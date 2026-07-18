import prisma from '@/lib/prisma';

export const HIGH_PRIORITY_METHOD = 'PRIORITY_REPLIES';
export const HIGH_PRIORITY_LABEL = '⭐ High priority — Replied';

export function buildDiscoveryGroupLabel(input: {
  countries?: string[];
  cities?: string[];
  keywords?: string[];
  method?: string;
}) {
  const geo =
    [input.countries?.join(', '), input.cities?.slice(0, 3).join(', ')].filter(Boolean).join(' · ') ||
    'All locations';
  const kw = (input.keywords || []).slice(0, 2).join(', ') || 'leads';
  const when = new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${geo} — ${kw} (${when})`;
}

export async function createDiscoveryGroup(input: {
  method: string;
  countries?: string[];
  cities?: string[];
  keywords?: string[];
  totalChunks: number;
  userId?: number;
  status?: string;
  label?: string;
}) {
  return (prisma as any).saDiscoveryGroup.create({
    data: {
      label: input.label || buildDiscoveryGroupLabel(input),
      method: input.method,
      countries: JSON.stringify(input.countries || []),
      cities: JSON.stringify(input.cities || []),
      keywords: JSON.stringify(input.keywords || []),
      status: input.status || 'QUEUED',
      totalChunks: input.totalChunks,
      completedChunks: 0,
      createdCount: 0,
      skippedCount: 0,
      userId: input.userId || null,
    },
  });
}

/** Manual empty / named group for organizing leads */
export async function createManualGroup(input: {
  label: string;
  userId?: number;
  leadIds?: number[];
}) {
  const label = input.label.trim();
  if (!label) throw new Error('Group name is required');
  const group = await createDiscoveryGroup({
    method: 'MANUAL',
    label,
    totalChunks: 0,
    userId: input.userId,
    status: 'COMPLETED',
  });
  if (input.leadIds?.length) {
    // Assign moves leads out of any previous groups
    await assignLeadsToGroup({
      groupId: group.id,
      leadIds: input.leadIds,
      move: true,
    });
    await (prisma as any).saDiscoveryGroup.update({
      where: { id: group.id },
      data: { createdCount: input.leadIds.length },
    });
  }
  return group;
}

export async function addLeadsToDiscoveryGroup(groupId: number, leadIds: number[]) {
  const unique = Array.from(new Set(leadIds.filter(Boolean)));
  if (!unique.length) return 0;

  // Avoid unique-constraint noise: skip members already in the group
  const existing = await (prisma as any).saDiscoveryGroupMember.findMany({
    where: { groupId, companyId: { in: unique } },
    select: { companyId: true },
  });
  const already = new Set(existing.map((m: any) => m.companyId));
  const toAdd = unique.filter((id) => !already.has(id));
  if (!toAdd.length) return 0;

  await (prisma as any).saDiscoveryGroupMember.createMany({
    data: toAdd.map((companyId) => ({ groupId, companyId })),
    skipDuplicates: true,
  });
  return toAdd.length;
}

export async function removeLeadsFromDiscoveryGroup(groupId: number, leadIds: number[]) {
  const result = await (prisma as any).saDiscoveryGroupMember.deleteMany({
    where: { groupId, companyId: { in: leadIds } },
  });
  return result.count as number;
}

/** Assign leads to a group. Always removes them from other groups (move). */
export async function assignLeadsToGroup(input: {
  groupId: number;
  leadIds: number[];
  /** @deprecated Always moves now — kept for API compat */
  move?: boolean;
  removeFromGroupIds?: number[];
}) {
  const leadIds = Array.from(new Set(input.leadIds.map(Number).filter(Boolean)));
  if (!leadIds.length) return { added: 0, removed: 0 };

  // Always leave previous groups so a lead isn't duplicated across segments
  let removed = 0;
  if (input.removeFromGroupIds?.length) {
    const result = await (prisma as any).saDiscoveryGroupMember.deleteMany({
      where: {
        companyId: { in: leadIds },
        groupId: { in: input.removeFromGroupIds },
      },
    });
    removed = result.count;
  } else {
    const result = await (prisma as any).saDiscoveryGroupMember.deleteMany({
      where: {
        companyId: { in: leadIds },
        groupId: { not: input.groupId },
      },
    });
    removed = result.count;
  }

  const added = await addLeadsToDiscoveryGroup(input.groupId, leadIds);
  return { added, removed, groupId: input.groupId, leadIds };
}

export async function deleteDiscoveryGroup(groupId: number) {
  const group = await (prisma as any).saDiscoveryGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new Error('Group not found');
  // Members cascade; leads stay. Priority group can be recreated.
  await (prisma as any).saDiscoveryGroup.delete({ where: { id: groupId } });
  return group;
}

export async function ensureHighPriorityRepliesGroup(opts?: { backfill?: boolean }) {
  let group = await (prisma as any).saDiscoveryGroup.findFirst({
    where: { method: HIGH_PRIORITY_METHOD },
    orderBy: { id: 'asc' },
  });
  let created = false;
  if (!group) {
    group = await createDiscoveryGroup({
      method: HIGH_PRIORITY_METHOD,
      label: HIGH_PRIORITY_LABEL,
      totalChunks: 0,
      status: 'COMPLETED',
    });
    created = true;
  } else if (group.label !== HIGH_PRIORITY_LABEL) {
    group = await (prisma as any).saDiscoveryGroup.update({
      where: { id: group.id },
      data: { label: HIGH_PRIORITY_LABEL },
    });
  }

  if (created || opts?.backfill) {
    const replied = await (prisma as any).saLeadCompany.findMany({
      where: {
        OR: [
          { status: { in: ['REPLIED', 'CONVERTED'] } },
          { replyStatus: { not: null } },
          { replies: { some: {} } },
        ],
      },
      select: { id: true },
      take: 2000,
    });
    if (replied.length) {
      await addLeadsToDiscoveryGroup(
        group.id,
        replied.map((r: any) => r.id)
      );
    }
  }
  return group;
}

/** When a company replies, put them in the high-priority group */
export async function addLeadToHighPriorityGroup(companyId: number) {
  if (!companyId) return null;
  const group = await ensureHighPriorityRepliesGroup();
  await addLeadsToDiscoveryGroup(group.id, [companyId]);
  return group;
}

export async function recordDiscoveryChunkResult(
  groupId: number | undefined | null,
  result: { created?: number; skipped?: number; leads?: { id: number }[] }
) {
  if (!groupId) return;

  const leadIds = (result.leads || []).map((l) => l.id).filter(Boolean);
  if (leadIds.length) await addLeadsToDiscoveryGroup(groupId, leadIds);

  const group = await (prisma as any).saDiscoveryGroup.update({
    where: { id: groupId },
    data: {
      completedChunks: { increment: 1 },
      createdCount: { increment: result.created || 0 },
      skippedCount: { increment: result.skipped || 0 },
      status: 'RUNNING',
    },
  });

  if (group.totalChunks > 0 && group.completedChunks >= group.totalChunks) {
    await (prisma as any).saDiscoveryGroup.update({
      where: { id: groupId },
      data: { status: 'COMPLETED' },
    });
  }
}

function mapGroup(g: any) {
  const emailedCount = g.emailedCount ?? 0;
  const memberCount = g._count?.members ?? 0;
  const alreadySent = g.alreadySent != null ? !!g.alreadySent : emailedCount > 0;
  return {
    ...g,
    memberCount,
    emailedCount,
    alreadySent,
    countries: safeJson(g.countries, []),
    cities: safeJson(g.cities, []),
    keywords: safeJson(g.keywords, []),
    isPriority: g.method === HIGH_PRIORITY_METHOD,
    progressPct:
      g.totalChunks > 0 ? Math.min(100, Math.round((g.completedChunks / g.totalChunks) * 100)) : 0,
  };
}

const ALREADY_SENT_MARKER = ' · Already sent';

export async function listDiscoveryGroups(limit = 50) {
  await ensureHighPriorityRepliesGroup();
  const groups = await (prisma as any).saDiscoveryGroup.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      _count: { select: { members: true } },
    },
  });

  const groupIds = groups.map((g: any) => g.id);
  let emailedMap = new Map<number, number>();
  if (groupIds.length) {
    // Lightweight aggregate — do NOT load every member row (that was freezing Outreach)
    const emailed = await (prisma as any).saDiscoveryGroupMember.groupBy({
      by: ['groupId'],
      where: {
        groupId: { in: groupIds },
        company: { emailSentCount: { gt: 0 } },
      },
      _count: { _all: true },
    });
    emailedMap = new Map(
      emailed.map((row: any) => [row.groupId, row._count?._all ?? row._count ?? 0])
    );
  }

  const mapped = groups.map((g: any) =>
    mapGroup({
      ...g,
      emailedCount: emailedMap.get(g.id) || 0,
      alreadySent:
        (emailedMap.get(g.id) || 0) > 0 || String(g.label || '').includes(ALREADY_SENT_MARKER),
    })
  );
  // Priority group always first
  mapped.sort((a: any, b: any) => {
    if (a.isPriority && !b.isPriority) return -1;
    if (!a.isPriority && b.isPriority) return 1;
    return 0;
  });
  return mapped;
}

/**
 * After a campaign emails leads, mark every discovery group that contains them
 * so the UI shows an "Already sent" label (and bump if emailed again).
 */
export async function markDiscoveryGroupsEmailed(companyIds: number[]) {
  const ids = Array.from(new Set(companyIds.map(Number).filter(Boolean)));
  if (!ids.length) return { groupsMarked: 0 };

  const memberships = await (prisma as any).saDiscoveryGroupMember.findMany({
    where: { companyId: { in: ids } },
    select: { groupId: true },
  });
  const groupIds = Array.from(new Set(memberships.map((m: any) => m.groupId)));
  if (!groupIds.length) return { groupsMarked: 0 };

  const groups = await (prisma as any).saDiscoveryGroup.findMany({
    where: { id: { in: groupIds } },
    select: { id: true, label: true, method: true },
  });

  let groupsMarked = 0;
  for (const g of groups) {
    if (g.method === HIGH_PRIORITY_METHOD) continue;
    let label = String(g.label || '');
    // Second (or later) campaign wave: make the label explicit
    if (label.includes(ALREADY_SENT_MARKER)) {
      if (!label.includes(' · Sent again')) {
        label = `${label.replace(ALREADY_SENT_MARKER, '')}${ALREADY_SENT_MARKER} · Sent again`;
        await (prisma as any).saDiscoveryGroup.update({
          where: { id: g.id },
          data: { label },
        });
        groupsMarked++;
      }
    } else {
      await (prisma as any).saDiscoveryGroup.update({
        where: { id: g.id },
        data: { label: `${label}${ALREADY_SENT_MARKER}` },
      });
      groupsMarked++;
    }
  }
  return { groupsMarked, groupIds };
}

function safeJson(raw: unknown, fallback: any) {
  if (!raw) return fallback;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

export async function getLeadIdsInGroup(groupId: number): Promise<number[]> {
  const members = await (prisma as any).saDiscoveryGroupMember.findMany({
    where: { groupId },
    select: { companyId: true },
  });
  return members.map((m: any) => m.companyId);
}
