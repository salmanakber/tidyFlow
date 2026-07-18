
'use client';

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { normalizePublicPlanSlug, planSlugToTier } from '@/lib/app-store-links';
import {
  getPublicPlanScopeItems,
  SUBSCRIBE_THEME as T,
  type PublicPlanPayload,
} from '@/lib/public-plan-scope';
import { evaluatePassword } from '@/lib/password-policy';

function CheckIcon({ on = true }: { on?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="9" fill={on ? T.amberSoft : '#F1EEE8'} />
      {on ? (
        <path
          d="M6 10.2L8.6 12.8L14 7.4"
          stroke={T.amberDeep}
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path d="M7 7L13 13M13 7L7 13" stroke={T.inkFaint} strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function PublicSubscribePlanPage() {
  const params = useParams<{ plan: string }>();
  const searchParams = useSearchParams();
  const slug = normalizePublicPlanSlug(params?.plan);
  const tier = slug ? planSlugToTier(slug) : null;

  const [plan, setPlan] = useState<PublicPlanPayload | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [useTrial, setUseTrial] = useState(true);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    companyName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const canceled = searchParams.get('canceled') === '1';
  const passwordCheck = useMemo(() => evaluatePassword(form.password), [form.password]);
  const passwordsMatch =
    form.confirmPassword.length > 0 && form.password === form.confirmPassword;
  const passwordReady = passwordCheck.valid && passwordsMatch;

  useEffect(() => {
    if (!tier) {
      setLoadingPlan(false);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(`/api/public/plans/${tier}`, { cache: 'no-store' });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Plan not found');
        setPlan(json.data);
        if (json.data?.trialDays === 0) setUseTrial(false);
      } catch (e: any) {
        setError(e?.message || 'Could not load this plan');
      } finally {
        setLoadingPlan(false);
      }
    };
    void load();
  }, [tier]);

  const scope = useMemo(() => (plan ? getPublicPlanScopeItems(plan) : []), [plan]);
  const limits = scope.filter((s) => s.kind === 'limit');
  const features = scope.filter((s) => s.kind === 'feature');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tier) return;
    setError('');
    if (!passwordCheck.valid) {
      setError(passwordCheck.message || 'Please choose a stronger password');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const { confirmPassword: _confirm, ...accountFields } = form;
      const res = await fetch('/api/public/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...accountFields,
          planTier: tier,
          useTrial,
        }),
      });
      const json = await res.json();
      if (!json.success || !json.data?.url) {
        throw new Error(json.message || 'Could not start checkout');
      }
      if (json.data.email) {
        try {
          sessionStorage.setItem('tidyflow_subscribe_email', json.data.email);
        } catch {
          // ignore
        }
      }
      window.location.href = json.data.url;
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
      setSubmitting(false);
    }
  };

  if (!slug || !tier) {
    return (
      <main style={pageShell}>
        <div className="responsive-panel" style={{ ...panel, maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 12px', color: T.navy, fontSize: 24, fontWeight: 800 }}>Plan not found</h1>
          <p style={{ color: T.inkMid, marginBottom: 24, fontSize: 14, lineHeight: 1.5 }}>
            Use /subscribe/startup, /subscribe/standard, or /subscribe/premium.
          </p>
          <Link href="/subscribe" style={primaryBtn}>
            View all plans
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={pageShell}>
      {/* Scoped CSS to ensure responsiveness across grid systems, panels, and forms */}
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
        
        /* Grid setup */
        .subscribe-plan-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          align-items: start;
        }
        @media (min-width: 860px) {
          .subscribe-plan-grid {
            grid-template-columns: 0.95fr 1.15fr;
            gap: 28px;
          }
        }

        /* Responsive Panel Padding */
        .responsive-panel {
          background: #FFF;
          border: 1px solid ${T.border || '#E6E0D6'};
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 12px 32px rgba(11,30,54,0.04);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        @media (min-width: 640px) {
          .responsive-panel {
            padding: 32px;
            border-radius: 24px;
          }
        }

        /* Responsive Card Header */
        .responsive-header {
          padding: 28px 20px 24px;
        }
        @media (min-width: 640px) {
          .responsive-header {
            padding: 38px 32px 30px;
          }
        }

        /* Input Controls */
        .custom-input {
          width: 100%;
          box-sizing: border-box;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .custom-input:focus {
          border-color: ${T.amberDeep} !important;
          box-shadow: 0 0 0 4px ${T.amberSoft} !important;
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

        /* Responsive step text styling to fit smaller screens */
        .step-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1px;
        }
        @media (max-width: 440px) {
          .step-label {
            font-size: 9px;
          }
        }
        
        /* Line connecting steps */
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

        /* Form double column responsive treatment */
        .form-split {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        @media (min-width: 480px) {
          .form-split {
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
        }
      `}} />

      <div style={{ maxWidth: 1040, margin: '0 auto', width: '100%' }}>
        
        {/* Header Hero Area */}
        <div style={{ textAlign: 'center', marginBottom: 36, color: T.navyDeep }}>
          <p
            style={{
              margin: '0 0 10px',
              display: 'inline-block',
              background: T.amberSoft,
              border: `1px solid ${T.border || '#E6E0D6'}`,
              color: T.amberDeep,
              borderRadius: 999,
              padding: '5px 14px',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            Secure signup
          </p>
          <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(26px, 4.5vw, 36px)', fontWeight: 800, letterSpacing: -0.8, color: T.navy, lineHeight: 1.2 }}>
            Get started with TidyFlow
          </h1>
          <p style={{ margin: 0, color: T.inkMid, fontSize: 15, lineHeight: 1.55 }}>
            Create your account, complete payment, then download the app and sign in with the same email.
          </p>
        </div>

        {canceled ? (
          <div
            style={{
              background: T.amberSoft,
              border: `1px solid ${T.amber}`,
              color: T.navyDeep,
              borderRadius: 14,
              padding: '14px 18px',
              marginBottom: 20,
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(217,119,6,0.05)',
            }}
          >
            Checkout was canceled. Update your details and continue whenever you are ready.
          </div>
        ) : null}

        {/* Form & Plan layout Grid */}
        <div className="subscribe-plan-grid">
          
          {/* Plan Scope Card */}
          <section className="responsive-panel" style={{ padding: 0, overflow: 'hidden' }}>
            {loadingPlan ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="responsive-header" style={{ background: '#F9F7F3', borderRadius: '0 0 24px 24px' }}>
                  <div className="skeleton-shimmer" style={{ width: '40%', height: 12, borderRadius: 4, marginBottom: 12 }} />
                  <div className="skeleton-shimmer" style={{ width: '60%', height: 28, borderRadius: 6, marginBottom: 16 }} />
                  <div className="skeleton-shimmer" style={{ width: '45%', height: 20, borderRadius: 12 }} />
                </div>
                <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="skeleton-shimmer" style={{ width: '100%', height: 16, borderRadius: 4 }} />
                  <div className="skeleton-shimmer" style={{ width: '90%', height: 16, borderRadius: 4 }} />
                  <div className="skeleton-shimmer" style={{ width: '95%', height: 16, borderRadius: 4 }} />
                </div>
              </div>
            ) : plan ? (
              <>
                <div
                  className="responsive-header"
                  style={{
                    background: `linear-gradient(145deg, ${T.navyDeep}, ${T.navyMid || T.navy})`,
                    color: '#fff',
                    borderRadius: '0 0 24px 24px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
                  }}
                >
                  <p style={{ margin: '0 0 8px', color: T.amber, fontSize: 10, fontWeight: 800, letterSpacing: 1.2 }}>
                    {plan.label.toUpperCase()} PLAN
                  </p>
                  <p style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: -1.2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 24, fontWeight: 700, transform: 'translateY(-6px)' }}>$</span>
                    {Number(plan.monthlyPrice || 0).toFixed(0)}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginLeft: 2 }}> / month</span>
                  </p>
                  {plan.trialDays ? (
                    <p
                      style={{
                        margin: '14px 0 0',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'rgba(245,158,11,0.16)',
                        color: T.amber,
                        borderRadius: 999,
                        padding: '4px 12px',
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                      }}
                    >
                      <span style={{ width: 4, height: 4, borderRadius: 99, background: T.amber }} />
                      {plan.trialDays}-day free trial available
                    </p>
                  ) : null}
                </div>

                <div style={{ padding: '24px 20px 28px' }}>
                  <p style={sectionEyebrow}>Team capacity & allowances</p>
                  <ul style={list}>
                    {limits.map((item) => (
                      <li
                        key={item.id}
                        style={{
                          ...row,
                          opacity: item.included ? 1 : 0.5,
                        }}
                      >
                        <CheckIcon on={item.included} />
                        <span style={{ flex: 1, textDecoration: item.included ? 'none' : 'line-through', color: item.included ? T.ink : T.inkFaint }}>
                          {item.label}
                        </span>
                        <strong style={{ color: item.included ? T.navy : T.inkFaint, fontSize: 13, fontWeight: 700 }}>
                          {item.included ? item.value : '—'}
                        </strong>
                      </li>
                    ))}
                  </ul>

                  <div style={{ margin: '20px 0 12px', borderTop: `1px dashed ${T.border || '#E6E0D6'}` }} />

                  <p style={sectionEyebrow}>Everything included</p>
                  <ul style={list}>
                    {features.map((item) => (
                      <li key={item.id} style={{ ...row, opacity: item.included ? 1 : 0.48 }}>
                        <CheckIcon on={item.included} />
                        <span style={{ color: item.included ? T.inkMid : T.inkFaint }}>{item.label}</span>
                      </li>
                    ))}
                  </ul>

                  <p style={{ margin: '20px 0 0', fontSize: 11, color: T.inkFaint, display: 'inline-block' }}>
                    Shareable link: <code style={{ color: T.navy, background: '#FAF8F4', padding: '3px 6px', borderRadius: 4 }}>/subscribe/{slug}</code>
                  </p>
                </div>
              </>
            ) : (
              <div style={{ padding: 32, color: T.rose, fontWeight: 700 }}>{error || 'Plan unavailable'}</div>
            )}
          </section>

          {/* Checkout/Registration Form */}
          <section className="responsive-panel">
            <h2 style={{ margin: '0 0 6px', fontSize: 22, color: T.navy, fontWeight: 800, letterSpacing: -0.3 }}>
              Create your account
            </h2>
            <p style={{ margin: '0 0 24px', color: T.inkMid, fontSize: 13, lineHeight: 1.5 }}>
              You’ll use this email and password to sign in on the TidyFlow app after checkout.
            </p>

            <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
              <div className="form-split">
                <Field
                  label="First name"
                  value={form.firstName}
                  onChange={(v) => setForm((s) => ({ ...s, firstName: v }))}
                />
                <Field
                  label="Last name"
                  value={form.lastName}
                  onChange={(v) => setForm((s) => ({ ...s, lastName: v }))}
                />
              </div>
              <Field
                label="Company name"
                required
                value={form.companyName}
                onChange={(v) => setForm((s) => ({ ...s, companyName: v }))}
              />
              <Field
                label="Work email"
                type="email"
                required
                value={form.email}
                onChange={(v) => setForm((s) => ({ ...s, email: v }))}
              />
              <Field
                label="Password"
                type="password"
                required
                value={form.password}
                onChange={(v) => setForm((s) => ({ ...s, password: v }))}
                autoComplete="new-password"
              />
              <div
                style={{
                  background: '#FAF8F4',
                  border: `1px solid ${T.border || '#E6E0D6'}`,
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 8,
                }}
                aria-live="polite"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.navy, letterSpacing: 0.4 }}>
                    PASSWORD STRENGTH
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: passwordCheck.valid ? '#15803D' : T.amberDeep,
                    }}
                  >
                    {passwordCheck.valid
                      ? 'Strong'
                      : form.password
                        ? `${passwordCheck.score}/5`
                        : 'Required'}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: '#EDE8DF',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(passwordCheck.score / 5) * 100}%`,
                      background: passwordCheck.valid
                        ? '#22C55E'
                        : passwordCheck.score >= 3
                          ? T.amber
                          : T.rose,
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                  {passwordCheck.checks.map((check) => (
                    <li
                      key={check.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        color: check.ok ? '#15803D' : T.inkMid,
                        fontWeight: check.ok ? 700 : 500,
                      }}
                    >
                      <span aria-hidden style={{ width: 14, textAlign: 'center' }}>
                        {check.ok ? '✓' : '○'}
                      </span>
                      {check.label}
                    </li>
                  ))}
                </ul>
              </div>
              <Field
                label="Confirm password"
                type="password"
                required
                value={form.confirmPassword}
                onChange={(v) => setForm((s) => ({ ...s, confirmPassword: v }))}
                autoComplete="new-password"
                hint={
                  form.confirmPassword
                    ? passwordsMatch
                      ? 'Passwords match'
                      : 'Passwords do not match'
                    : undefined
                }
                hintTone={form.confirmPassword ? (passwordsMatch ? 'ok' : 'error') : undefined}
              />

              {(plan?.trialDays ?? 0) > 0 && (
                <label
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    background: T.amberSoft,
                    border: `1.5px solid rgba(217,119,6,0.18)`,
                    borderRadius: 12,
                    padding: '14px 14px',
                    cursor: 'pointer',
                    marginTop: 4,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={useTrial}
                    onChange={(e) => setUseTrial(e.target.checked)}
                    style={{ marginTop: 3, accentColor: T.amberDeep, width: 15, height: 15, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, color: T.navy, lineHeight: 1.45 }}>
                    <strong>Start with a {plan?.trialDays}-day free trial</strong>
                    <br />
                    <span style={{ color: T.inkMid, fontSize: 12 }}>Card required now · billed after trial ends</span>
                  </span>
                </label>
              )}

              {error ? (
                <p style={{ margin: '4px 0 0', color: T.rose, fontSize: 13, fontWeight: 700 }}>{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={submitting || !plan || !passwordReady}
                className="interactive-btn"
                style={{
                  ...primaryBtn,
                  opacity: submitting || !plan || !passwordReady ? 0.75 : 1,
                  pointerEvents: submitting || !plan || !passwordReady ? 'none' : 'auto',
                  marginTop: 8,
                }}
              >
                {submitting ? 'Opening secure checkout…' : 'Continue to secure payment'}
              </button>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  color: T.inkMid,
                  fontSize: 11,
                  fontWeight: 600,
                  marginTop: 8,
                }}
              >
                <span>Encrypted payment</span>
                <span>·</span>
                <span>Cancel anytime</span>
                <span>·</span>
                <span>App download after</span>
              </div>
            </form>
          </section>
        </div>

        {/* Page Footer Navigation links */}
        <p style={{ textAlign: 'center', marginTop: 32, color: T.inkMid, fontSize: 13 }}>
          <Link href="/subscribe" style={{ color: T.navy, fontWeight: 800, textDecoration: 'none' }}>
            ← All plans
          </Link>
          {'  ·  '}
          <Link href="/login" style={{ color: T.navy, fontWeight: 800, textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  hint,
  hintTone,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  hint?: string;
  hintTone?: 'ok' | 'error';
  autoComplete?: string;
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: T.navy }}>{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        autoComplete={autoComplete}
        className="custom-input"
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: `1px solid ${T.border || '#E6E0D6'}`,
          borderRadius: 11,
          padding: '12px 14px',
          fontSize: 14,
          color: T.navy,
          outline: 'none',
          background: '#fff',
        }}
      />
      {hint ? (
        <span
          style={{
            fontSize: 11,
            marginTop: -2,
            fontWeight: hintTone ? 700 : 500,
            color: hintTone === 'ok' ? '#15803D' : hintTone === 'error' ? T.rose : T.inkFaint,
          }}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const pageShell: CSSProperties = {
  minHeight: '100vh',
  background: `radial-gradient(1000px 400px at 50% 0%, ${T.amberSoft} 0%, transparent 100%), #FCFAF7`,
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  padding: '48px 16px 96px',
  boxSizing: 'border-box',
};

const panel: CSSProperties = {
  background: '#FFF',
};

const primaryBtn: CSSProperties = {
  display: 'inline-block',
  textAlign: 'center',
  textDecoration: 'none',
  background: `linear-gradient(90deg, ${T.amber}, ${T.amberDeep})`,
  color: T.navyDeep,
  border: 'none',
  borderRadius: 12,
  padding: '14px 18px',
  fontWeight: 800,
  fontSize: 14,
  cursor: 'pointer',
  width: '100%',
  boxShadow: '0 8px 20px rgba(217,119,6,0.18)',
  boxSizing: 'border-box',
};

const sectionEyebrow: CSSProperties = {
  margin: '0 0 10px',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  color: T.amberDeep,
};

const list: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 10,
};

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 13,
  color: T.inkMid,
  fontWeight: 500,
};
