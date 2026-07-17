'use client';

import Link from 'next/link';

export default function SubscribeCancelPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#F7F8FA',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          background: '#fff',
          borderRadius: 16,
          padding: 32,
          border: '1px solid #E4E9F0',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 22, margin: '0 0 8px', color: '#0D1117' }}>Checkout canceled</h1>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: '#4A5568', margin: '0 0 24px' }}>
          No payment was taken. You can close this page and try again from the TidyFlow app when you
          are ready.
        </p>
        <Link
          href="/login"
          style={{
            display: 'inline-block',
            background: '#0D1B2A',
            color: '#fff',
            textDecoration: 'none',
            padding: '12px 20px',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Back to login
        </Link>
      </div>
    </main>
  );
}
