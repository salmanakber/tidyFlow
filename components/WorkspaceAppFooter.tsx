"use client"

import { getAndroidPlayStoreUrl, getIosAppStoreUrl } from "@/lib/app-store-links"

function AppleGlyph() {
  return (
    <svg width="16" height="19" viewBox="0 0 18 22" fill="currentColor" aria-hidden>
      <path d="M14.7 11.6c0-2.5 2-3.7 2.1-3.8-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-3.9 2.5-1.7 2.9-.4 7.2 1.2 9.6.8 1.1 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8s1.8.8 3.2.8c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.6-3.9zM12.4 3.8c.7-.8 1.1-2 1-3.1-1 .1-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.5 2.9-1.4z" />
    </svg>
  )
}

function PlayGlyph() {
  return (
    <svg width="15" height="17" viewBox="0 0 18 20" aria-hidden>
      <path fill="#34A853" d="M.8 1.2v17.6L10.2 10 .8 1.2z" />
      <path fill="#FBBC04" d="M13.1 7.1 3.3.4.8 1.2 10.2 10l2.9-2.9z" />
      <path fill="#4285F4" d="M.8 18.8 10.2 10l2.9 2.9-7.1 6.7-5.2-.8z" />
      <path fill="#EA4335" d="M17.2 8.8c.5.4.8 1 .8 1.7s-.3 1.3-.8 1.7l-4.1 2.4-2.9-2.9 2.9-2.9 4.1 0z" />
    </svg>
  )
}

/**
 * Footer strip for authenticated workspace shells — App Store + Play Store.
 */
export default function WorkspaceAppFooter() {
  const ios = getIosAppStoreUrl()
  const android = getAndroidPlayStoreUrl()

  return (
    <footer className="mt-8 border-t border-navy-900/8 pt-5 pb-2 dark:border-navy-800">
      <div className="relative overflow-hidden rounded-2xl border border-navy-900/10 bg-gradient-to-br from-navy-950 via-[#0f2740] to-navy-900 px-4 py-4 sm:px-5 sm:py-5">
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full opacity-40 blur-2xl"
          style={{ background: "radial-gradient(circle, rgba(217,119,6,0.45), transparent 70%)" }}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/logot-transparent.png"
              alt=""
              className="mt-0.5 h-10 w-10 shrink-0 rounded-xl object-contain ring-1 ring-white/15"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.16em] text-amber-400 uppercase">
                TidyFlow mobile
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                Take jobs, GPS & photos on the go
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-white/50">
                Same login as this dashboard · iPhone & Android
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <a
              href={ios}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/8 px-3.5 py-2.5 text-white backdrop-blur transition hover:border-amber-400/40 hover:bg-white/12"
            >
              <AppleGlyph />
              <span className="text-left leading-tight">
                <span className="block text-[9px] font-medium text-white/55">
                  Download on the
                </span>
                <span className="block text-[13px] font-bold tracking-tight">
                  App Store
                </span>
              </span>
            </a>
            <a
              href={android}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/8 px-3.5 py-2.5 text-white backdrop-blur transition hover:border-amber-400/40 hover:bg-white/12"
            >
              <PlayGlyph />
              <span className="text-left leading-tight">
                <span className="block text-[9px] font-medium text-white/55">
                  Get it on
                </span>
                <span className="block text-[13px] font-bold tracking-tight">
                  Google Play
                </span>
              </span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
