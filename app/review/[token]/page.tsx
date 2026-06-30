'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 max-w-md w-full p-8 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 max-w-md w-full p-8">
        <p className="text-teal-600 text-sm font-medium">{info.companyName || 'TidyFlow'}</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">How was your cleaning?</h1>
        {info.taskTitle && (
          <p className="text-slate-700 mt-2 text-sm font-medium">{info.taskTitle}</p>
        )}
        <p className="text-slate-600 mt-1 text-sm">{info.propertyAddress}</p>

        {submitted ? (
          <div className="mt-6 text-center">
            <p className="text-teal-700 font-medium">
              {result?.message || 'Thank you for your feedback!'}
            </p>
            {result?.redirectUrl && (
              <a
                href={result.redirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 px-6 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700"
              >
                Leave a Public Review
              </a>
            )}
            {result?.isPublic === false && (
              <p className="text-xs text-slate-500 mt-4">
                Your feedback was received privately. Our team will follow up if needed.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex justify-center gap-2 mt-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`text-3xl transition-colors ${star <= rating ? 'text-amber-400' : 'text-slate-300 hover:text-amber-200'}`}
                  aria-label={`${star} star`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              className="w-full mt-4 p-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Tell us about your experience (optional)"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={rating < 1 || submitting}
              className="w-full mt-4 py-3 bg-teal-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-teal-700"
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
            <p className="text-xs text-slate-400 mt-3 text-center">
              4–5 stars may be invited to leave a public review. Lower ratings are handled privately.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
