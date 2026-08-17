'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SUBSCRIBE_THEME as T } from '@/lib/public-plan-scope';

const APP_DEEP_LINK = 'tidyflow://subscribe/cancel';

export default function SubscribeCancelPage() {
  const [autoOpenFailed, setAutoOpenFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.href = APP_DEEP_LINK;
    }, 250);
    const failTimer = window.setTimeout(() => setAutoOpenFailed(true), 1800);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(failTimer);
    };
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: `linear-gradient(180deg, ${T.navyDeep}, ${T.navy} 50%, ${T.canvas})`,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          background: T.surface,
          borderRadius: 18,
          padding: 28,
          border: `1px solid ${T.border}`,
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(6,21,37,0.28)',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            margin: '0 auto 14px',
            background: T.amberSoft,
            color: T.amberDeep,
            display: 'grid',
            placeItems: 'center',
            fontSize: 22,
            fontWeight: 800,
          }}
        >
          ×
        </div>
        <h1 style={{ margin: '0 0 8px', color: T.navy, fontSize: 24 }}>Checkout canceled</h1>
        <p style={{ margin: '0 0 20px', color: T.inkMid, fontSize: 14, lineHeight: 1.5 }}>
          {autoOpenFailed
            ? 'No payment was taken. You can return to your plan and try again anytime.'
            : 'Returning to the TidyFlow app…'}
        </p>
        <a
          href={APP_DEEP_LINK}
          style={{
            display: 'block',
            background: `linear-gradient(90deg, ${T.amber}, ${T.amberDeep})`,
            color: T.navyDeep,
            textDecoration: 'none',
            borderRadius: 12,
            padding: '13px 16px',
            fontWeight: 800,
            marginBottom: 10,
          }}
        >
          Open TidyFlow app
        </a>
        <Link
          href="/subscribe"
          style={{
            display: 'block',
            color: T.navy,
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: 13,
            padding: '8px 0',
          }}
        >
          Back to plans
        </Link>
      </div>
    </main>
  );
}
