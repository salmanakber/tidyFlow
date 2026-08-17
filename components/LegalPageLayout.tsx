import Link from 'next/link';
import type { ReactNode } from 'react';

type LegalPageLayoutProps = {
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

export default function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-teal-50">
      <header className="border-b border-cyan-100/80 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="https://app.tidyflowapp.com/login" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 text-sm font-bold text-white">
              TF
            </div>
            <span className="text-lg font-semibold text-slate-800">TidyFlow</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
            <Link href="/privacy" className="hover:text-teal-700">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-teal-700">
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <article className="rounded-2xl bg-white p-6 shadow-xl shadow-cyan-900/5 sm:p-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: {lastUpdated}</p>
          <div className="legal-content mt-8 space-y-6 text-[15px] leading-7 text-slate-700">
            {children}
          </div>
        </article>

        <footer className="mt-8 text-center text-sm text-slate-500">
          <p>
            Questions? Contact us at{' '}
            <a href="mailto:tidyflaw@gmail.com" className="font-medium text-teal-700 hover:underline">
              tidyflaw@gmail.com
            </a>
          </p>
          <p className="mt-2">© {new Date().getFullYear()} TidyFlow. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
