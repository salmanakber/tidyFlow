'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const APP_DEEP_LINK = 'tidyflow://subscribe/cancel';

export default function SubscribeCancelPage() {
  const [autoOpenFailed, setAutoOpenFailed] = useState(false);

  const colors = {
    navyDark: '#0B1E36',
    navyLight: '#5A6E85',
    amber: '#D97706',
    amberLight: '#FEF3C7',
    bg: '#F8FAFC',
    cardBg: '#FFFFFF',
    border: '#E2E8F0',
  };

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
        background: colors.bg,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          background: colors.cardBg,
          borderRadius: 16,
          padding: '40px 32px',
          border: `1px solid ${colors.border}`,
          borderTop: `4px solid ${colors.navyDark}`,
          textAlign: 'center',
          boxShadow:
            '0 10px 25px -5px rgba(11, 30, 54, 0.05), 0 8px 10px -6px rgba(11, 30, 54, 0.05)',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: colors.amberLight,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.amber}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            margin: '0 0 12px',
            color: colors.navyDark,
            letterSpacing: '-0.02em',
          }}
        >
          Checkout canceled
        </h1>

        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: colors.navyLight,
            margin: '0 0 28px',
          }}
        >
          {autoOpenFailed
            ? 'No payment was taken. Tap below to return to the TidyFlow app and try again when you are ready.'
            : 'Returning to the TidyFlow app…'}
        </p>

        <a
          href={APP_DEEP_LINK}
          style={{
            display: 'block',
            background: colors.navyDark,
            color: '#ffffff',
            textDecoration: 'none',
            padding: '14px 24px',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 15,
            marginBottom: 12,
          }}
        >
          Open TidyFlow App
        </a>

        <Link
          href="/login"
          style={{
            display: 'block',
            color: colors.navyLight,
            textDecoration: 'none',
            padding: '10px 24px',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Back to web login
        </Link>
      </div>
    </main>
  );
}
