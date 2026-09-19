import { NextRequest, NextResponse } from "next/server"
import { extractToken, verifyToken } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { buildCompanySlug } from "@/lib/company-slug"
import { getAppOrigin } from "@/lib/domains"

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
  if (role === "OWNER" || role === "MANAGER" || role === "COMPANY_ADMIN") {
    return slug ? `/${slug}/dashboard` : "/login"
  }
  if (role === "DEVELOPER") {
    return slug ? `/${slug}/dashboard` : "/admin/control-center"
  }
  return "/login"
}

/**
 * Public session probe for marketing sites on another domain.
 *
 * Website snippet (recommended):
 *   <script src="https://app.tidyflowapp.com/embed/nav-auth.js" data-selector="#tf-login" async></script>
 *
 * Or CORS fetch with credentials if cookie Domain is shared:
 *   fetch('https://app.tidyflowapp.com/api/public/nav-auth', { credentials: 'include' })
 */
function corsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") || "*"
  const allowed = (process.env.NAV_AUTH_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  let allowOrigin = origin
  if (allowed.length > 0) {
    if (allowed.includes("*")) allowOrigin = origin === "*" ? "*" : origin
    else if (origin !== "*" && allowed.includes(origin)) allowOrigin = origin
    else allowOrigin = allowed[0]
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Cache-Control": "no-store",
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)
  const app = getAppOrigin()
  const loginHref = `${app}/login`
  const accountLoginHref = `${app}/account/login`

  const raw = extractToken(request)
  if (!raw) {
    return NextResponse.json(
      {
        success: true,
        loggedIn: false,
        label: "Login",
        href: loginHref,
        accountLoginHref,
        portal: null,
      },
      { headers }
    )
  }

  const payload = verifyToken(raw, { quiet: true })
  if (!payload?.userId) {
    return NextResponse.json(
      {
        success: true,
        loggedIn: false,
        label: "Login",
        href: loginHref,
        accountLoginHref,
        portal: null,
      },
      { headers }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      role: true,
      companyId: true,
      isActive: true,
      company: { select: { id: true, name: true } },
    },
  })

  if (!user?.isActive) {
    return NextResponse.json(
      {
        success: true,
        loggedIn: false,
        label: "Login",
        href: loginHref,
        accountLoginHref,
        portal: null,
      },
      { headers }
    )
  }

  const portal = payload.portal === "customer" ? "customer" : "admin"
  const slug = user.companyId
    ? buildCompanySlug({
        id: user.companyId,
        name: user.company?.name || `company-${user.companyId}`,
      })
    : null

  const path = workspacePath({
    role: user.role,
    companyId: user.companyId,
    companyName: user.company?.name,
    companySlug: slug,
  })

  const workspaceHref = `${app}${path.startsWith("/") ? path : `/${path}`}`
  const href = portal === "customer" ? `${app}/account/billing` : workspaceHref

  return NextResponse.json(
    {
      success: true,
      loggedIn: true,
      label: portal === "customer" ? "Go to billing" : "Go to dashboard",
      href,
      workspaceHref,
      billingHref: `${app}/account/billing`,
      accountLoginHref,
      loginHref,
      portal,
      role: user.role,
    },
    { headers }
  )
}
