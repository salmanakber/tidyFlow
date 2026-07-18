
'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  getPublicPlanScopeItems,
  SUBSCRIBE_THEME as T,
  type PublicPlanPayload,
} from '@/lib/public-plan-scope';

const STEPS = ['Choose plan', 'Secure checkout', 'Download app', 'Sign in'];

function CheckIcon({ dimmed }: { dimmed?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      style={{ flexShrink: 0, opacity: dimmed ? 0.35 : 1 }}
    >
      <circle cx="10" cy="10" r="9" fill={dimmed ? '#E6E0D6' : T.amberSoft} />
      <path
        d="M6 10.2L8.6 12.8L14 7.4"
        stroke={dimmed ? T.inkFaint : T.amberDeep}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0, opacity: 0.45 }}>
      <circle cx="10" cy="10" r="9" fill="#F1EEE8" />
      <path d="M7 7L13 13M13 7L7 13" stroke={T.inkFaint} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function SubscribeIndexPage() {
  const [plans, setPlans] = useState<PublicPlanPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/public/plans', { cache: 'no-store' });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Failed to load plans');
        setPlans(json.data || []);
      } catch (e: any) {
        setError(e?.message || 'Could not load plans');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const recommendedTier =
    plans.length >= 3 ? plans[1]?.tier : plans.length === 2 ? plans[1]?.tier : undefined;

  return (
    <main
      style={{
        minHeight: '100vh',
        background: `radial-gradient(1000px 400px at 50% 0%, ${T.amberSoft} 0%, transparent 100%), #FCFAF7`,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        padding: '48px 16px 96px',
      }}
    >
      {/* Styles for hover transitions, the step connector line, and skeleton animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .skeleton-shimmer {
          background: linear-gradient(90deg, #F3EFE9 25%, #EBE5DB 50%, #F3EFE9 75%);
          background-size: 200% 100%;
          animation: shimmer 1.6s infinite linear;
        }
        .step-container {
          position: relative;
        }
        .step-line-bg {
          position: absolute;
          top: 15px;
          left: 12%;
          right: 12%;
          height: 2px;
          background-color: ${T.border || '#E6E0D6'};
          z-index: 1;
        }
        @media (max-width: 640px) {
          .step-line-bg {
            display: none;
          }
        }
        .interactive-card {
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease;
        }
        .interactive-card:hover {
          transform: translateY(-5px);
          border-color: ${T.amber} !important;
          box-shadow: 0 24px 48px rgba(11,30,54,0.1) !important;
        }
        .interactive-btn {
          transition: transform 0.15s ease, filter 0.15s ease, box-shadow 0.15s ease;
        }
        .interactive-btn:hover {
          filter: brightness(1.05);
          transform: translateY(-1px);
        }
        .interactive-btn:active {
          transform: translateY(0px);
        }
      `}} />

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        
        {/* Hero Area */}
        <div style={{ textAlign: 'center', padding: '0 8px 16px', color: T.navyDeep }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: T.amberSoft,
              border: `1px solid ${T.border}`,
              borderRadius: 999,
              padding: '6px 14px',
              marginBottom: 20,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 99, background: T.amberDeep }} />
            <span style={{ color: T.amberDeep, fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              TidyFlow Plans
            </span>
          </div>
          <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(32px, 5.5vw, 44px)', fontWeight: 800, letterSpacing: -0.9, lineHeight: 1.15, color: T.navy }}>
            Choose the plan that fits your team
          </h1>
          <p style={{ margin: '0 auto', maxWidth: 540, color: T.inkMid, fontSize: 15, lineHeight: 1.6 }}>
            Create your account, complete secure checkout, then download the app and sign in with the same email.
          </p>
        </div>

        {/* Steps Tracker */}
        <div
          className="step-container"
          style={{
            maxWidth: 680,
            margin: '36px auto 48px',
          }}
        >
          {/* Connector Line */}
          <div className="step-line-bg" />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              position: 'relative',
              zIndex: 2,
            }}
          >
            {STEPS.map((step, i) => {
              const isActive = i === 0;
              return (
                <div key={step} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 99,
                      margin: '0 auto 10px',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 13,
                      fontWeight: 800,
                      background: isActive ? T.navyDeep : '#FFF',
                      color: isActive ? '#FFF' : T.inkMid,
                      border: isActive ? `2.5px solid ${T.amber}` : `2px solid ${T.border || '#E6E0D6'}`,
                      boxShadow: '0 4px 10px rgba(11,30,54,0.05)',
                      zIndex: 3,
                      position: 'relative',
                    }}
                  >
                    {i + 1}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: isActive ? T.navyDeep : T.inkMid,
                      letterSpacing: 0.1,
                    }}
                  >
                    {step}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error ? (
          <p style={{ textAlign: 'center', color: '#dc2626', marginBottom: 20, fontWeight: 600 }}>{error}</p>
        ) : null}

        {/* Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24,
            alignItems: 'stretch',
          }}
        >
          {/* Detailed Skeleton Loader */}
          {loading &&
            [0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  background: '#FFF',
                  borderRadius: 24,
                  border: `1px solid ${T.border || '#E6E0D6'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  minHeight: 580,
                }}
              >
                {/* Skeleton Header Area (Rounded Bottom) */}
                <div style={{ background: '#F9F7F3', padding: '38px 32px 30px', borderRadius: '0 0 24px 24px' }}>
                  <div className="skeleton-shimmer" style={{ width: '40%', height: 14, borderRadius: 4, marginBottom: 12 }} />
                  <div className="skeleton-shimmer" style={{ width: '65%', height: 32, borderRadius: 6, marginBottom: 16 }} />
                  <div className="skeleton-shimmer" style={{ width: '50%', height: 20, borderRadius: 12 }} />
                </div>
                {/* Skeleton Body Area */}
                <div style={{ padding: '28px 32px 32px', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="skeleton-shimmer" style={{ width: '30%', height: 10, borderRadius: 3 }} />
                    <div className="skeleton-shimmer" style={{ width: '100%', height: 16, borderRadius: 4 }} />
                    <div className="skeleton-shimmer" style={{ width: '90%', height: 16, borderRadius: 4 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 'auto' }}>
                    <div className="skeleton-shimmer" style={{ width: '100%', height: 48, borderRadius: 12 }} />
                  </div>
                </div>
              </div>
            ))}

          {/* Actual Cards */}
          {!loading &&
            plans.map((plan) => {
              const slug = String(plan.tier || '').toLowerCase();
              const recommended = plan.tier === recommendedTier;
              const scope = getPublicPlanScopeItems(plan);
              const limits = scope.filter((s) => s.kind === 'limit');
              const features = scope.filter((s) => s.kind === 'feature');
              const hasTrial = typeof plan.trialDays === 'number' && plan.trialDays > 0;

              return (
                <article
                  key={plan.tier}
                  className="interactive-card"
                  style={{
                    background: '#FFF',
                    borderRadius: 24,
                    border: recommended ? `2.5px solid ${T.amber}` : `1px solid ${T.border || '#E6E0D6'}`,
                    boxShadow: recommended
                      ? '0 20px 40px rgba(11,30,54,0.08)'
                      : '0 8px 24px rgba(11,30,54,0.03)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                  }}
                >
                  {recommended ? (
                    <div
                      style={{
                        position: 'absolute',
                        top: 16,
                        right: 16,
                        background: `linear-gradient(135deg, ${T.amber}, ${T.amberDeep})`,
                        color: T.navyDeep,
                        fontSize: 9,
                        fontWeight: 900,
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                        padding: '4px 10px',
                        borderRadius: 999,
                        boxShadow: '0 2px 8px rgba(245,158,11,0.2)',
                        zIndex: 10,
                      }}
                    >
                      Most popular
                    </div>
                  ) : null}

                  {/* Header Area with Rounded Bottom and Increased Padding */}
                  <div
                    style={{
                      background: recommended
                        ? `linear-gradient(145deg, ${T.navyDeep}, ${T.navyMid || T.navy})`
                        : `linear-gradient(180deg, #FAF7F2, #F3EFE7)`,
                      padding: '38px 32px 30px',
                      color: recommended ? '#fff' : T.ink,
                      borderRadius: '0 0 24px 24px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
                    }}
                  >
                    <p
                      style={{
                        margin: '0 0 8px',
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: 1.2,
                        textTransform: 'uppercase',
                        color: recommended ? T.amber : T.amberDeep,
                      }}
                    >
                      {plan.label}
                    </p>
                    <p style={{ margin: 0, fontSize: 44, fontWeight: 800, letterSpacing: -1.2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 26, fontWeight: 700, transform: 'translateY(-6px)' }}>$</span>
                      {Number(plan.monthlyPrice || 0).toFixed(0)}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: recommended ? 'rgba(255,255,255,0.6)' : T.inkMid,
                          marginLeft: 2,
                        }}
                      >
                        / month
                      </span>
                    </p>
                    {hasTrial ? (
                      <p
                        style={{
                          margin: '14px 0 0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: recommended ? 'rgba(245,158,11,0.16)' : T.amberSoft,
                          color: recommended ? T.amber : T.amberDeep,
                          borderRadius: 999,
                          padding: '5px 12px',
                          fontSize: 11,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: 0.4,
                        }}
                      >
                        <span style={{ width: 4, height: 4, borderRadius: 99, background: recommended ? T.amber : T.amberDeep }} />
                        {plan.trialDays}-day free trial
                      </p>
                    ) : null}
                  </div>

                  {/* Card Content */}
                  <div style={{ padding: '28px 32px 32px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    
                    <p style={sectionLabel}>Team Capacity</p>
                    <ul style={listStyle}>
                      {limits.slice(0, 3).map((item) => (
                        <li key={item.id} style={rowStyle}>
                          <CheckIcon />
                          <span style={{ flex: 1, color: T.ink }}>{item.label}</span>
                          <strong style={{ color: T.navy, fontSize: 13, fontWeight: 700 }}>{item.value}</strong>
                        </li>
                      ))}
                    </ul>

                    {limits.length > 3 && (
                      <div style={{ margin: '18px 0 10px', borderTop: `1px dashed ${T.border || '#E6E0D6'}` }} />
                    )}

                    {limits.length > 3 && <p style={sectionLabel}>Monthly Allowances</p>}
                    <ul style={listStyle}>
                      {limits.slice(3).map((item) => (
                        <li
                          key={item.id}
                          style={{
                            ...rowStyle,
                            opacity: item.included ? 1 : 0.6,
                          }}
                        >
                          {item.included ? <CheckIcon /> : <CrossIcon />}
                          <span style={{ flex: 1, textDecoration: item.included ? 'none' : 'line-through', color: item.included ? T.ink : T.inkFaint }}>
                            {item.label}
                          </span>
                          <strong style={{ color: item.included ? T.navy : T.inkFaint, fontSize: 13, fontWeight: 700 }}>
                            {item.included ? item.value : '—'}
                          </strong>
                        </li>
                      ))}
                    </ul>

                    <div style={{ margin: '18px 0 10px', borderTop: `1px dashed ${T.border || '#E6E0D6'}` }} />

                    <p style={sectionLabel}>Features Included</p>
                    <ul style={{ ...listStyle, marginBottom: 32 }}>
                      {features.map((item) => (
                        <li
                          key={item.id}
                          style={{
                            ...rowStyle,
                            opacity: item.included ? 1 : 0.5,
                          }}
                        >
                          {item.included ? <CheckIcon /> : <CrossIcon />}
                          <span style={{ flex: 1, color: item.included ? T.inkMid : T.inkFaint }}>
                            {item.label}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* Action Button */}
                    <Link
                      href={`/subscribe/${slug}`}
                      className="interactive-btn"
                      style={{
                        marginTop: 'auto',
                        display: 'block',
                        textAlign: 'center',
                        textDecoration: 'none',
                        borderRadius: 12,
                        padding: '14px 18px',
                        fontWeight: 800,
                        fontSize: 14,
                        background: recommended
                          ? `linear-gradient(90deg, ${T.amber}, ${T.amberDeep})`
                          : `linear-gradient(135deg, ${T.navyDeep}, ${T.navyMid || T.navy})`,
                        color: recommended ? T.navyDeep : '#fff',
                        boxShadow: recommended
                          ? '0 8px 20px rgba(217,119,6,0.18)'
                          : '0 8px 18px rgba(11,30,54,0.12)',
                      }}
                    >
                      {hasTrial ? `Start ${plan.trialDays}-day trial` : `Continue with ${plan.label}`}
                    </Link>
                  </div>
                </article>
              );
            })}
        </div>

        {/* Security / Checkout Guarantee */}
        <div
          style={{
            marginTop: 40,
            background: '#FFF',
            border: `1px solid ${T.border || '#E6E0D6'}`,
            borderRadius: 16,
            padding: '20px 24px',
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            maxWidth: 720,
            marginLeft: 'auto',
            marginRight: 'auto',
            boxShadow: '0 4px 18px rgba(11,30,54,0.02)',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: T.amberSoft,
              display: 'grid',
              placeItems: 'center',
              color: T.amberDeep,
              fontSize: 16,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            ✓
          </div>
          <div>
            <p style={{ margin: '0 0 3px', color: T.navy, fontWeight: 800, fontSize: 14 }}>
              Secure checkout · Cancel anytime
            </p>
            <p style={{ margin: 0, color: T.inkMid, fontSize: 13, lineHeight: 1.5 }}>
              Payment is completed on a protected checkout page. After you subscribe, download the app and
              sign in with your email.
            </p>
          </div>
        </div>

        {/* Footer Link */}
        {/* <p style={{ textAlign: 'center', marginTop: 28, color: T.inkMid, fontSize: 13 }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: T.navy, fontWeight: 800, textDecoration: 'none', borderBottom: `1.5px solid ${T.amber}` }}>
            Sign in
          </Link>
        </p> */}
      </div>
    </main>
  );
}

const sectionLabel: CSSProperties = {
  margin: '6px 0 10px',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  color: T.amberDeep,
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 10,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 13,
  color: T.inkMid,
  fontWeight: 500,
};
