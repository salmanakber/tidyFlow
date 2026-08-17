import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { uploadCompanyLogoToCloudinary } from '@/lib/cloudinary';
import { upsertCompanyInvoiceSettings } from '@/lib/invoice-settings';
import { UserRole } from '@prisma/client';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!['OWNER', 'SUPER_ADMIN', 'DEVELOPER'].includes(role)) {
    return NextResponse.json(
      { success: false, message: 'Only the company owner can upload invoice logo' },
      { status: 403 }
    );
  }

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, message: 'file required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await uploadCompanyLogoToCloudinary(buffer, companyId);
    if (!upload.success || !upload.secureUrl) {
      return NextResponse.json(
        { success: false, message: upload.error || 'Upload failed' },
        { status: 500 }
      );
    }

    const settings = await upsertCompanyInvoiceSettings(companyId, { logoUrl: upload.secureUrl });

    return NextResponse.json({
      success: true,
      data: { logoUrl: upload.secureUrl, settings },
    });
  } catch (error) {
    console.error('Logo upload error:', error);
    return NextResponse.json({ success: false, message: 'Logo upload failed' }, { status: 500 });
  }
}
