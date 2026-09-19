import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { extractToken, generateToken, verifyToken } from "@/lib/auth"
import { buildCompanySlug } from "@/lib/company-slug"
import { resolvePostLoginPath } from "@/lib/post-login-path"

const WORKSPACE_ROLES = new Set([
  "OWNER",
  "MANAGER",
  "COMPANY_ADMIN",
  "DEVELOPER",
  "SUPER_ADMIN",
  "ADMIN_UNIQUE",
])

/**
 * Exchange a valid customer (or existing) JWT into an admin workspace session
 * so /account/billing can deep-link into the ops dashboard without re-typing password.
 * Does not change mobile login contracts.
 */
export async function POST(request: NextRequest) {
  const raw = extractToken(request)
  if (!raw) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const payload = verifyToken(raw, { quiet: true })
  if (!payload?.userId) {
    return NextResponse.json({ success: false, message: "Invalid session" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      companyId: true,
      isActive: true,
      isHeadSuperAdmin: true,
      company: { select: { id: true, name: true } },
    },
  })

  if (!user || !user.isActive) {
    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
  }

  const role = String(user.role || "").toUpperCase()
  if (!WORKSPACE_ROLES.has(role)) {
    return NextResponse.json(
      {
        success: false,
        message: "Your account cannot open the operations workspace. Contact your company owner.",
      },
      { status: 403 }
    )
  }

  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId || undefined,
    portal: "admin",
  })

  const slug = user.companyId
    ? buildCompanySlug({
        id: user.companyId,
        name: user.company?.name || `company-${user.companyId}`,
      })
    : null

  const path = resolvePostLoginPath({
    role: user.role,
    companyId: user.companyId,
    companyName: user.company?.name,
    companySlug: slug,
  })

  const response = NextResponse.json({
    success: true,
    data: {
      token,
      path,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        isHeadSuperAdmin: user.isHeadSuperAdmin,
      },
      company: user.companyId
        ? { id: user.companyId, name: user.company?.name || null, slug }
        : null,
    },
  })

  response.cookies.set("authToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })

  return response
}
