import { NextRequest, NextResponse } from 'next/server';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import {
  listDiscoveryGroups,
  getLeadIdsInGroup,
  createManualGroup,
  assignLeadsToGroup,
  deleteDiscoveryGroup,
  renameDiscoveryGroup,
  removeLeadsFromDiscoveryGroup,
  ensureHighPriorityRepliesGroup,
} from '@/lib/sales-agent/groups';
import { saLog } from '@/lib/sales-agent/logger';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const groupId = request.nextUrl.searchParams.get('id');
  if (groupId) {
    const id = parseInt(groupId, 10);
    const group = await (prisma as any).saDiscoveryGroup.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
    if (!group) return jsonError('Group not found', 404);
    const leadIds = await getLeadIdsInGroup(id);
    return jsonOk({
      ...group,
      memberCount: group._count?.members ?? 0,
      leadIds,
      isPriority: group.method === 'PRIORITY_REPLIES',
      progressPct:
        group.totalChunks > 0
          ? Math.min(100, Math.round((group.completedChunks / group.totalChunks) * 100))
          : group.status === 'COMPLETED'
            ? 100
            : 0,
    });
  }

  const groups = await listDiscoveryGroups(80);
  return jsonOk(groups);
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  const action = body.action || 'create';

  if (action === 'ensure_priority') {
    const group = await ensureHighPriorityRepliesGroup({ backfill: true });
    return jsonOk(group);
  }

  if (action === 'create') {
    const label = String(body.label || '').trim();
    if (!label) return jsonError('label is required');
    const leadIds = Array.isArray(body.leadIds) ? body.leadIds.map(Number) : [];
    const group = await createManualGroup({
      label,
      userId: gate.userId,
      leadIds,
    });
    await saLog({
      category: 'user',
      action: 'group_create',
      message: `Created group “${label}” with ${leadIds.length} leads`,
      userId: gate.userId,
      entityType: 'SaDiscoveryGroup',
      entityId: group.id,
    });
    return jsonOk(group, 201);
  }

  if (action === 'assign') {
    let groupId = body.groupId ? Number(body.groupId) : null;
    const leadIds = Array.isArray(body.leadIds) ? body.leadIds.map(Number) : [];
    if (!leadIds.length) return jsonError('leadIds required');

    // Create new group + assign in one step (always moves out of old groups)
    if (!groupId && body.newGroupLabel) {
      const group = await createManualGroup({
        label: String(body.newGroupLabel),
        userId: gate.userId,
        leadIds,
      });
      await saLog({
        category: 'user',
        action: 'group_create_assign',
        message: `Created “${body.newGroupLabel}” and moved ${leadIds.length} leads into it`,
        userId: gate.userId,
        entityType: 'SaDiscoveryGroup',
        entityId: group.id,
      });
      return jsonOk({ group, added: leadIds.length, removed: leadIds.length, moved: true });
    }

    if (!groupId) return jsonError('groupId or newGroupLabel required');
    const result = await assignLeadsToGroup({
      groupId,
      leadIds,
      move: true,
      removeFromGroupIds: Array.isArray(body.removeFromGroupIds)
        ? body.removeFromGroupIds.map(Number)
        : undefined,
    });
    await saLog({
      category: 'user',
      action: 'group_assign',
      message: `Moved ${result.added} leads to group #${groupId} (removed from ${result.removed} prior memberships)`,
      userId: gate.userId,
      entityType: 'SaDiscoveryGroup',
      entityId: groupId,
    });
    return jsonOk({ ...result, moved: true });
  }

  if (action === 'remove_members') {
    const groupId = Number(body.groupId);
    const leadIds = Array.isArray(body.leadIds) ? body.leadIds.map(Number) : [];
    if (!groupId || !leadIds.length) return jsonError('groupId and leadIds required');
    const removed = await removeLeadsFromDiscoveryGroup(groupId, leadIds);
    return jsonOk({ removed });
  }

  if (action === 'rename') {
    const groupId = Number(body.groupId);
    const label = String(body.label || '').trim();
    if (!groupId) return jsonError('groupId required');
    if (!label) return jsonError('label is required');
    try {
      const group = await renameDiscoveryGroup(groupId, label);
      await saLog({
        category: 'user',
        action: 'group_rename',
        message: `Renamed group #${groupId} to “${group.label}”`,
        userId: gate.userId,
        entityType: 'SaDiscoveryGroup',
        entityId: groupId,
      });
      return jsonOk(group);
    } catch (e: any) {
      return jsonError(e.message || 'Rename failed', 400);
    }
  }

  return jsonError('Unknown action');
}

export async function DELETE(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10);
  if (!id) return jsonError('id required');

  try {
    const group = await deleteDiscoveryGroup(id);
    await saLog({
      category: 'user',
      action: 'group_delete',
      message: `Deleted group “${group.label}”`,
      userId: gate.userId,
      entityType: 'SaDiscoveryGroup',
      entityId: id,
    });
    return jsonOk({ deleted: true, id });
  } catch (e: any) {
    return jsonError(e.message || 'Delete failed', 404);
  }
}
