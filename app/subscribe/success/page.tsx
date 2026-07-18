'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { getAndroidPlayStoreUrl, getIosAppStoreUrl } from '@/lib/app-store-links';
import { SUBSCRIBE_THEME as T } from '@/lib/public-plan-scope';

type Device = 'ios' | 'android' | 'desktop';

function detectDevice(): Device {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export default function SubscribeSuccessPage() {
  const [device, setDevice] = useState<Device>('desktop');
  const [email, setEmail] = useState('');
  const [deepLinkTried, setDeepLinkTried] = useState(false);
  const [sessionId, setSessionId] = useState('');

  const iosUrl = useMemo(() => getIosAppStoreUrl(), []);
  const androidUrl = useMemo(() => getAndroidPlayStoreUrl(), []);

  useEffect(() => {
    setDevice(detectDevice());
    try {
      setEmail(sessionStorage.getItem('tidyflow_subscribe_email') || '');
    } catch {
      // ignore
    }

    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session_id') || '';
    setSessionId(sid);

    const deepLink = sid
      ? `tidyflow://subscribe/success?session_id=${encodeURIComponent(sid)}`
      : 'tidyflow://subscribe/success';

    const timer = window.setTimeout(() => {
      window.location.href = deepLink;
      setDeepLinkTried(true);
    }, 500);

    return () => window.clearTimeout(timer);
  }, []);

  const primary =
    device === 'android'
      ? { label: 'Get it on Google Play', href: androidUrl }
      : { label: 'Download on the App Store', href: iosUrl };

  const deepLinkHref = sessionId
    ? `tidyflow://subscribe/success?session_id=${encodeURIComponent(sessionId)}`
    : 'tidyflow://subscribe/success';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: `radial-gradient(900px 380px at 50% -10%, ${T.amberGlow}, transparent 55%), linear-gradient(180deg, ${T.navyDeep}, ${T.navy} 55%, ${T.canvas})`,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          background: T.surface,
          borderRadius: 20,
          overflow: 'hidden',
          border: `1px solid ${T.border}`,
          boxShadow: '0 24px 50px rgba(6,21,37,0.35)',
        }}
      >
        <div
          style={{
            background: `linear-gradient(145deg, ${T.navyDeep}, ${T.navyMid})`,
            padding: '28px 24px 24px',
            textAlign: 'center',
            color: '#fff',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 999,
              margin: '0 auto 14px',
              background: 'rgba(245,158,11,0.16)',
              border: '1px solid rgba(245,158,11,0.35)',
              display: 'grid',
              placeItems: 'center',
              color: T.amber,
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            ✓
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 26, letterSpacing: -0.4 }}>You&apos;re all set</h1>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.5 }}>
            Your plan is ready. Download TidyFlow and sign in with the same email you used at checkout.
          </p>
        </div>

        <div style={{ padding: 22 }}>
          {email ? (
            <div
              style={{
                background: T.amberSoft,
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 16,
                fontSize: 13,
                color: T.navy,
                lineHeight: 1.5,
              }}
            >
              <strong>Sign in with:</strong> {email}
              <div style={{ marginTop: 4, color: T.inkMid }}>Use the password you created.</div>
            </div>
          ) : (
            <p style={{ margin: '0 0 16px', color: T.inkMid, fontSize: 13, lineHeight: 1.5 }}>
              Open the app and sign in with the email and password from signup.
            </p>
          )}

          <ol style={{ margin: '0 0 18px', paddingLeft: 18, color: T.navyMid, fontSize: 13, lineHeight: 1.75 }}>
            <li>Download the TidyFlow app</li>
            <li>Open the app and tap Sign in</li>
            <li>Use the same email and password</li>
          </ol>

          <a href={primary.href} style={primaryBtn}>
            {primary.label}
          </a>

          {device === 'desktop' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              <a href={iosUrl} style={secondaryBtn}>
                App Store
              </a>
              <a href={androidUrl} style={secondaryBtn}>
                Google Play
              </a>
            </div>
          ) : (
            <a
              href={device === 'android' ? iosUrl : androidUrl}
              style={{ ...secondaryBtn, display: 'block', marginTop: 10 }}
            >
              {device === 'android' ? 'Also on the App Store' : 'Also on Google Play'}
            </a>
          )}

          <a
            href={deepLinkHref}
            style={{
              display: 'block',
              textAlign: 'center',
              marginTop: 14,
              color: T.emerald,
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            {deepLinkTried ? 'Open TidyFlow if it is already installed' : 'Opening the app…'}
          </a>

          <Link
            href="/login"
            style={{
              display: 'block',
              textAlign: 'center',
              marginTop: 10,
              color: T.inkFaint,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Continue on web login
          </Link>
        </div>
      </div>
    </main>
  );
}

const primaryBtn: CSSProperties = {
  display: 'block',
  textAlign: 'center',
  textDecoration: 'none',
  background: `linear-gradient(90deg, ${T.amber}, ${T.amberDeep})`,
  color: T.navyDeep,
  borderRadius: 12,
  padding: '14px 16px',
  fontWeight: 800,
  fontSize: 15,
  boxShadow: '0 10px 22px rgba(217,119,6,0.28)',
};

const secondaryBtn: CSSProperties = {
  textAlign: 'center',
  textDecoration: 'none',
  background: '#fff',
  color: T.navy,
  border: `1px solid ${T.border}`,
  borderRadius: 11,
  padding: '12px 12px',
  fontWeight: 700,
  fontSize: 13,
};
