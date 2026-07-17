
'use client';
import Link from 'next/link';

export default function SubscribeSuccessPage() {
  // Brand color palette configuration
  const colors = {
    navyDark: '#0B1E36',     // Deep Navy for primary headings and button
    navyMedium: '#1E2E42',   // Soft Navy for readable body text
    navyLight: '#5A6E85',    // Light Navy for secondary details
    amber: '#D97706',        // Amber accent for actions, highlights, and icons
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
          borderTop: `4px solid ${colors.amber}`, // Amber top-border accent
          textAlign: 'center',
          boxShadow: '0 10px 25px -5px rgba(11, 30, 54, 0.05), 0 8px 10px -6px rgba(11, 30, 54, 0.05)',
        }}
      >
        {/* Styled checkmark wrapper */}
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
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
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
          Subscription updated
        </h1>

        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: colors.navyLight,
            margin: '0 0 28px',
          }}
        >
          You can close this page and return to the TidyFlow app. Tap Refresh if your plan does not
          unlock right away.
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
          Open TidyFlow Web
        </Link>
      </div>
    </main>
  );
}


