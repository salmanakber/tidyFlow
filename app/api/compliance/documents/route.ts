import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from '@/lib/rbac';
import { uploadDocumentToCloudinary } from '@/lib/cloudinary';
import {
  buildComplianceChecklist,
  computeComplianceStatus,
  formatComplianceSummary,
  logComplianceAudit,
  COMPLIANCE_DOC_TYPES,
} from '@/lib/compliance';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
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

  const documents = await prisma.complianceDocument.findMany({
    where: { companyId },
    orderBy: [{ docType: 'asc' }, { updatedAt: 'desc' }],
    include: {
      uploader: { select: { firstName: true, lastName: true } },
    },
  });

  const checklist = buildComplianceChecklist(documents);
  const summary = formatComplianceSummary(checklist);

  return NextResponse.json({
    success: true,
    data: {
      summary,
      checklist,
      documents: documents.map((doc) => ({
        ...doc,
        status: computeComplianceStatus(doc.expiresAt, !!doc.fileUrl),
      })),
      docTypes: COMPLIANCE_DOC_TYPES,
    },
  });
}

export async function POST(request: NextRequest) {
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

  try {
    const formData = await request.formData();
    const docType = String(formData.get('docType') || '').trim();
    const title = String(formData.get('title') || '').trim();
    const notes = formData.get('notes') ? String(formData.get('notes')) : null;
    const expiresAtRaw = formData.get('expiresAt') ? String(formData.get('expiresAt')) : null;
    const file = formData.get('file') as File | null;

    if (!docType) {
      return NextResponse.json({ success: false, message: 'docType required' }, { status: 400 });
    }

    const template = COMPLIANCE_DOC_TYPES.find((t) => t.type === docType);
    const resolvedTitle = title || template?.title || docType;

    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const upload = await uploadDocumentToCloudinary(
        buffer,
        companyId,
        docType,
        file.name,
        file.type
      );

      if (!upload.success || !upload.url) {
        return NextResponse.json(
          { success: false, message: upload.error || 'Upload failed' },
          { status: 500 }
        );
      }

      fileUrl = upload.url;
      fileName = file.name;
    }

    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    const status = computeComplianceStatus(expiresAt, !!fileUrl);

    const document = await prisma.complianceDocument.create({
      data: {
        companyId,
        title: resolvedTitle,
        docType,
        fileUrl,
        fileName,
        status,
        expiresAt,
        notes,
        uploadedBy: auth.tokenUser.userId,
      },
      include: {
        uploader: { select: { firstName: true, lastName: true } },
      },
    });

    await logComplianceAudit({
      companyId,
      userId: auth.tokenUser.userId,
      action: 'compliance_document_uploaded',
      entityId: String(document.id),
      newValues: {
        docType,
        title: resolvedTitle,
        status,
        fileName,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          document: {
            ...document,
            status: computeComplianceStatus(document.expiresAt, !!document.fileUrl),
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Compliance document POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
