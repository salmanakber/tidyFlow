import prisma from '@/lib/prisma';

export const COMPLIANCE_DOC_TYPES = [
  { type: 'id_verification', title: 'ID Verification' },
  { type: 'coshh', title: 'COSHH Documentation' },
  { type: 'insurance', title: 'Insurance Certificates' },
  { type: 'health_safety', title: 'Health & Safety Policy' },
  { type: 'dbs_check', title: 'DBS / Background Check' },
] as const;

export type ComplianceDocType = (typeof COMPLIANCE_DOC_TYPES)[number]['type'];
export type ComplianceDocStatus = 'valid' | 'expiring' | 'expired' | 'pending' | 'missing';

export function computeComplianceStatus(
  expiresAt: Date | null | undefined,
  hasFile: boolean
): ComplianceDocStatus {
  if (!hasFile) return 'missing';
  if (!expiresAt) return 'valid';

  const daysUntilExpiry = Math.ceil(
    (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 30) return 'expiring';
  return 'valid';
}

export function formatComplianceSummary(items: Array<{ status: string }>) {
  return {
    total: items.length,
    valid: items.filter((i) => i.status === 'valid').length,
    expiring: items.filter((i) => i.status === 'expiring').length,
    expired: items.filter((i) => i.status === 'expired').length,
    missing: items.filter((i) => i.status === 'missing' || i.status === 'pending').length,
  };
}

export async function logComplianceAudit(input: {
  companyId: number;
  userId: number;
  action: string;
  entityId: string;
  newValues?: Record<string, unknown>;
  oldValues?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      action: input.action,
      entityType: 'compliance_document',
      entityId: input.entityId,
      newValues: input.newValues ? JSON.stringify(input.newValues) : null,
      oldValues: input.oldValues ? JSON.stringify(input.oldValues) : null,
    },
  });
}

export function buildComplianceChecklist(
  documents: Array<{
    id: number;
    title: string;
    docType: string;
    fileUrl: string | null;
    fileName: string | null;
    status: string;
    expiresAt: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    uploader?: { firstName: string | null; lastName: string | null } | null;
  }>
) {
  const latestByType = new Map<string, (typeof documents)[number]>();
  for (const doc of documents) {
    const existing = latestByType.get(doc.docType);
    if (!existing || doc.updatedAt > existing.updatedAt) {
      latestByType.set(doc.docType, doc);
    }
  }

  return COMPLIANCE_DOC_TYPES.map((template) => {
    const doc = latestByType.get(template.type);
    const status = doc
      ? computeComplianceStatus(doc.expiresAt, !!doc.fileUrl)
      : ('missing' as ComplianceDocStatus);

    return {
      docType: template.type,
      title: doc?.title || template.title,
      status,
      document: doc
        ? {
            id: doc.id,
            fileUrl: doc.fileUrl,
            fileName: doc.fileName,
            expiresAt: doc.expiresAt,
            notes: doc.notes,
            updatedAt: doc.updatedAt,
            uploadedBy: doc.uploader
              ? [doc.uploader.firstName, doc.uploader.lastName].filter(Boolean).join(' ')
              : null,
          }
        : null,
    };
  });
}
