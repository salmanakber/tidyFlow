'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { tidyflowMarketingUrl } from '@/lib/booking-widget';

interface ReviewInfo {
  submitted: boolean;
  companyName: string;
  propertyAddress: string;
  taskTitle: string;
  rating?: number;
}

interface SubmitResult {
  message: string;
  redirectUrl?: string | null;
  isPublic?: boolean;
}

export default function ReviewPage() {
  const params = useParams();
  const token = params.token as string;
  const [info, setInfo] = useState<ReviewInfo | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/reviews/${token}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setInfo(res.data);
          if (res.data.submitted) {
            setSubmitted(true);
            if (res.data.rating) setRating(res.data.rating);
          }
        } else setError(res.message);
      })
      .catch(() => setError('Could not load review link.'));
  }, [token]);

  const handleSubmit = async () => {
    if (rating < 1 || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        setResult(data.data);
      } else {
        setError(data.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const primary = '#0B1F33';
  const accent = '#D97706';
  const background = '#F7F4EF';

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0a1520] px-6 text-center text-white">
        <p className="font-serif text-2xl">{error}</p>
        <a href={tidyflowMarketingUrl()} className="text-sm text-amber-400/80">
          tidyflowapp.com
        </a>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a1520]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[#c4a574]" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen px-4 py-12 sm:px-6"
      style={{
        background: `linear-gradient(165deg, ${background} 0%, #fff 55%)`,
        fontFamily: 'Outfit, system-ui, sans-serif',
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Outfit:wght@400;500;600;700&display=swap');`}</style>
      <div className="mx-auto max-w-lg">
        <div
          className="overflow-hidden rounded-[28px] shadow-2xl"
          style={{ boxShadow: `0 24px 60px ${primary}22` }}
        >
          <div
            className="px-7 pb-8 pt-7 text-white"
            style={{
              background: `linear-gradient(145deg, ${primary} 0%, ${primary}ee 60%, ${accent}99 140%)`,
            }}
          >
            <p className="text-[10px] font-semibold tracking-[0.2em] text-white/55 uppercase">
              Feedback
            </p>
            <p className="mt-1 text-sm font-semibold">{info.companyName || 'TidyFlow'}</p>
            <h1
              className="mt-6 text-4xl leading-tight text-white"
              style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}
            >
              How was your cleaning?
            </h1>
            {info.taskTitle && (
              <p className="mt-2 text-sm text-white/80">{info.taskTitle}</p>
            )}
            <p className="mt-1 text-sm text-white/65">{info.propertyAddress}</p>
          </div>

          <div className="bg-white px-7 py-7">
            {submitted ? (
              <div className="text-center">
                <p
                  className="text-2xl"
                  style={{
                    fontFamily: 'Cormorant Garamond, Georgia, serif',
                    color: primary,
                  }}
                >
                  Thank you
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {result?.message || 'Thank you for your feedback!'}
                </p>
                {result?.redirectUrl && (
                  <a
                    href={result.redirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-block rounded-full px-6 py-3 text-sm font-bold text-white"
                    style={{ background: accent }}
                  >
                    Leave a public review
                  </a>
                )}
                {result?.isPublic === false && (
                  <p className="mt-4 text-xs text-slate-500">
                    Your feedback was received privately. Our team will follow up if needed.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="text-3xl transition-transform hover:scale-110"
                      style={{ color: star <= rating ? accent : '#d4d4d8' }}
                      aria-label={`${star} star`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <textarea
                  className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2"
                  placeholder="Tell us about your experience (optional)"
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={rating < 1 || submitting}
                  className="mt-4 w-full rounded-full py-3 text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: accent }}
                >
                  {submitting ? 'Submitting…' : 'Submit feedback'}
                </button>
                <p className="mt-3 text-center text-[11px] text-slate-400">
                  4–5 stars may be invited to leave a public review. Lower ratings are handled privately.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-2">
          <a
            href={tidyflowMarketingUrl()}
            className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/80 px-3.5 py-2 text-xs shadow-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/logot-transparent.png"
              alt=""
              className="h-6 w-6 object-contain"
            />
            Powered by <strong>TidyFlow</strong>
          </a>
        </div>
      </div>
    </div>
  );
}
