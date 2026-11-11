/** Human-readable labels for audit log actions (CSV + UI). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'share.create': 'Share link created',
  'share.update': 'Share link updated',
  'share.delete': 'Share link deleted',
  'task.create': 'Task created',
  'task.update': 'Task updated',
  'task.status': 'Task status changed',
  'user.create': 'User created',
  'user.update': 'User updated',
  'compliance.upload': 'Compliance document uploaded',
  'compliance.update': 'Compliance document updated',
  compliance_document_uploaded: 'Compliance document uploaded',
  compliance_document_updated: 'Compliance document updated',
  compliance_document_deleted: 'Compliance document deleted',
};

export function humanizeAuditAction(action: string): string {
  const key = String(action || '').trim();
  if (!key) return 'Unknown action';
  if (AUDIT_ACTION_LABELS[key]) return AUDIT_ACTION_LABELS[key];
  return key
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
