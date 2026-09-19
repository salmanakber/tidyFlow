import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { extractToken, generateToken, verifyToken } from "@/lib/auth"
import { buildCompanySlug } from "@/lib/company-slug"

const WORKSPACE_ROLES = new Set([
  "OWNER",
  "MANAGER",
  "COMPANY_ADMIN",
  "DEVELOPER",
  "SUPER_ADMIN",
  "ADMIN_UNIQUE",
])

function companyNeedsPlan(company: {
  subscriptionStatus?: string | null
  planTier?: string | null
  isTrialActive?: boolean | null
  trialEndsAt?: Date | string | null
} | null) {
  if (!company) return true
  const status = String(company.subscriptionStatus || "").toLowerCase()
  if (["active", "trialing", "past_due"].includes(status)) return false
  if (company.isTrialActive && company.trialEndsAt) {
    const end = new Date(company.trialEndsAt).getTime()
    if (!Number.isNaN(end) && end > Date.now()) return false
  }
  if (
    company.planTier &&
    !["", "none", "free", "unpaid"].includes(String(company.planTier).toLowerCase())
  ) {
    return false
  }
  return true
}

/** Always land in the ops workspace (never bounce back to billing). */
function workspacePath(opts: {
  role?: string | null
  companyId?: number | null
  companyName?: string | null
  companySlug?: string | null
}) {
  const role = String(opts.role || "").toUpperCase()
  if (role === "SUPER_ADMIN" || role === "ADMIN_UNIQUE") return "/admin/control-center"
  const slug =
    opts.companySlug ||
    (opts.companyId
      ? buildCompanySlug({ id: opts.companyId, name: opts.companyName })
      : null)
  if (role === "OWNER" || role === "MANAGER" || role === "COMPANY_ADMIN" || role === "DEVELOPER") {
    return slug ? `/${slug}/dashboard` : "/login"
  }
  return "/login"
}

/**
 * Exchange customer/admin JWT into an admin workspace session.
 * Does not change mobile login contracts.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = extractToken(request)
    if (!raw) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }

    const payload = verifyToken(raw, { quiet: true })
    if (!payload?.userId) {
      return NextResponse.json(
        { success: false, message: "Session expired — please sign in again" },
        { status: 401 }
      )
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
        company: {
          select: {
            id: true,
            name: true,
            subscriptionStatus: true,
            planTier: true,
            isTrialActive: true,
            trialEndsAt: true,
          },
        },
      },
    })

    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
    }

    let role = String(user.role || "").toUpperCase()
    let companyId = user.companyId

    // Billing-only accounts sometimes lack OWNER role until promoted
    if (!WORKSPACE_ROLES.has(role) && companyId) {
      const promoted = await prisma.user.update({
        where: { id: user.id },
        data: { role: "OWNER" },
        select: { role: true, companyId: true },
      })
      role = String(promoted.role || "OWNER").toUpperCase()
      companyId = promoted.companyId
    }

    if (!WORKSPACE_ROLES.has(role)) {
      return NextResponse.json(
        {
          success: false,
          message: "Your account cannot open the operations workspace. Contact your company owner.",
        },
        { status: 403 }
      )
    }

    if (!companyId) {
      return NextResponse.json(
        {
          success: false,
          message: "No company linked yet — finish billing setup first.",
        },
        { status: 400 }
      )
    }

    if (companyNeedsPlan(user.company)) {
      return NextResponse.json(
        {
          success: false,
          message: "Choose a plan below to unlock the operations workspace.",
          data: { needsPlan: true },
        },
        { status: 402 }
      )
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role,
      companyId: companyId || undefined,
      portal: "admin",
    })

    const slug = buildCompanySlug({
      id: companyId,
      name: user.company?.name || `company-${companyId}`,
    })

    const path = workspacePath({
      role,
      companyId,
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
          role,
          companyId,
          isHeadSuperAdmin: user.isHeadSuperAdmin,
        },
        company: {
          id: companyId,
          name: user.company?.name || null,
          slug,
          subscriptionStatus: user.company?.subscriptionStatus,
          planTier: user.company?.planTier,
          isTrialActive: user.company?.isTrialActive,
          trialEndsAt: user.company?.trialEndsAt,
        },
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
  } catch (error) {
    console.error("[open-workspace]", error)
    return NextResponse.json(
      { success: false, message: "Could not open workspace" },
      { status: 500 }
    )
  }
}
