import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from "@/lib/rbac"
import { uploadBookingLogoToCloudinary } from "@/lib/cloudinary"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  if (!isManagerPlusRole(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
  }
  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser)
  if (!companyId) {
    return NextResponse.json({ success: false, message: "Company required" }, { status: 400 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ success: false, message: "file required" }, { status: 400 })
  }
  if (!String(file.type || "").startsWith("image/")) {
    return NextResponse.json(
      { success: false, message: "Please upload an image file" },
      { status: 400 }
    )
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json(
      { success: false, message: "Image must be under 4MB" },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const uploaded = await uploadBookingLogoToCloudinary(buffer, companyId)
  if (!uploaded.success || !uploaded.url) {
    return NextResponse.json(
      { success: false, message: uploaded.error || "Upload failed" },
      { status: 500 }
    )
  }

  // Persist on widget config so preview + public page stay in sync
  const existing = await prisma.bookingWidgetConfig.findUnique({
    where: { companyId },
    select: { id: true },
  })
  if (existing) {
    await prisma.bookingWidgetConfig.update({
      where: { companyId },
      data: { logoUrl: uploaded.url },
    })
  }

  return NextResponse.json({
    success: true,
    data: { url: uploaded.url, publicId: uploaded.publicId },
  })
}
