import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from '@/lib/rbac';
import { computeComplianceStatus, logComplianceAudit } from '@/lib/compliance';
import { UserRole } from '@prisma/client';

type RouteParams = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!isManagerPlusRole(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const existing = await prisma.complianceDocument.findFirst({
    where: { id, companyId },
  });

  if (!existing) {
    return NextResponse.json({ success: false, message: 'Document not found' }, { status: 404 });
  }

  const body = await request.json();
  const { title, notes, expiresAt } = body;

  const nextExpiresAt =
    expiresAt === null || expiresAt === ''
      ? null
      : expiresAt !== undefined
        ? new Date(expiresAt)
        : existing.expiresAt;

  const updated = await prisma.complianceDocument.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title: String(title) } : {}),
      ...(notes !== undefined ? { notes: notes ? String(notes) : null } : {}),
      ...(expiresAt !== undefined ? { expiresAt: nextExpiresAt } : {}),
      status: computeComplianceStatus(nextExpiresAt, !!existing.fileUrl),
    },
  });

  await logComplianceAudit({
    companyId,
    userId: auth.tokenUser.userId,
    action: 'compliance_document_updated',
    entityId: String(id),
    oldValues: {
      title: existing.title,
      expiresAt: existing.expiresAt,
      notes: existing.notes,
    },
    newValues: {
      title: updated.title,
      expiresAt: updated.expiresAt,
      notes: updated.notes,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      document: {
        ...updated,
        status: computeComplianceStatus(updated.expiresAt, !!updated.fileUrl),
      },
    },
  });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!isManagerPlusRole(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const existing = await prisma.complianceDocument.findFirst({
    where: { id, companyId },
  });

  if (!existing) {
    return NextResponse.json({ success: false, message: 'Document not found' }, { status: 404 });
  }

  await prisma.complianceDocument.delete({ where: { id } });

  await logComplianceAudit({
    companyId,
    userId: auth.tokenUser.userId,
    action: 'compliance_document_deleted',
    entityId: String(id),
    oldValues: {
      title: existing.title,
      docType: existing.docType,
    },
  });

  return NextResponse.json({ success: true, message: 'Document deleted' });
}
