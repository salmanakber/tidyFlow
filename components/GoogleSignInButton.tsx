"use client"

type Props = {
  portal?: "customer" | "admin"
  next?: string
  plan?: string
  useTrial?: boolean
  companyName?: string
  label?: string
}

export default function GoogleSignInButton({
  portal = "customer",
  next,
  plan,
  useTrial,
  companyName,
  label = "Continue with Google",
}: Props) {
  const href = (() => {
    const params = new URLSearchParams({ portal })
    if (next) params.set("next", next)
    if (plan) params.set("plan", plan)
    if (useTrial) params.set("trial", "1")
    if (companyName?.trim()) params.set("companyName", companyName.trim())
    return `/api/auth/google?${params.toString()}`
  })()

  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #E6E0D6",
        background: "#fff",
        borderRadius: 12,
        padding: "11px 14px",
        color: "#0B1E36",
        fontWeight: 700,
        fontSize: 14,
        textDecoration: "none",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.8-6.7 7.4l6.3 5.3C37.8 38.3 44 32.5 44 24c0-1.3-.1-2.5-.4-3.5z" />
      </svg>
      {label}
    </a>
  )
}
