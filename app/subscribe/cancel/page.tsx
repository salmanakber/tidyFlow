
'use client';

import Link from 'next/link';

export default function SubscribeCancelPage() {
  // Brand color palette configuration
  const colors = {
    navyDark: '#0B1E36',     // Deep Navy for primary headings and button
    navyMedium: '#1E2E42',   // Soft Navy for readable body text
    navyLight: '#5A6E85',    // Light Navy for secondary details
    amber: '#D97706',        // Amber accent for status indication
    amberLight: '#FEF3C7',   // Light amber background for icons
    bg: '#F8FAFC',           // Neutral light background
    cardBg: '#FFFFFF',       // Clean white for the container card
    border: '#E2E8F0',       // Subtle border color
  };

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
          borderTop: `4px solid ${colors.navyDark}`, // Deep Navy top-border accent to differentiate from success
          textAlign: 'center',
          boxShadow: '0 10px 25px -5px rgba(11, 30, 54, 0.05), 0 8px 10px -6px rgba(11, 30, 54, 0.05)',
        }}
      >
        {/* Styled close/cancel icon wrapper */}
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
          No payment was taken. You can close this page and try again from the TidyFlow app when you
          are ready.
        </p>

        <Link
          href="/login"
          style={{
            display: 'block',
            background: colors.navyDark,
            color: '#ffffff',
            textDecoration: 'none',
            padding: '14px 24px',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 15,
            transition: 'background-color 0.2s ease',
          }}
        >
          Back to login
        </Link>
      </div>
    </main>
  );
}
