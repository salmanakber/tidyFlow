'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface PortalPhoto {
  id: number;
  url: string;
  photoType: string;
  caption?: string;
  aiScore?: number | null;
  aiSummary?: string | null;
  aiFlags?: string[];
}

interface PortalData {
  title: string;
  description?: string;
  status: string;
  companyName?: string;
  scheduledDate?: string;
  completedAt?: string;
  averageScore?: number | null;
  property: { address: string; postcode?: string };
  photos: PortalPhoto[];
  checklists: Array<{ title: string; isCompleted: boolean }>;
  notes: Array<{ content: string; category?: string }>;
}

export default function ClientPortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
        else setError(res.message || 'Unable to load portal');
      })
      .catch(() => setError('Connection error'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading cleaning report...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center p-8">
          <h1 className="text-xl font-semibold text-slate-800">TidyFlow Cleaning Report</h1>
          <p className="text-red-600 mt-2">{error || 'Link not found'}</p>
        </div>
      </div>
    );
  }

  const beforePhotos = data.photos.filter((p) => p.photoType === 'before');
  const afterPhotos = data.photos.filter((p) => p.photoType === 'after');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <p className="text-sm text-teal-600 font-medium">
            {data.companyName || 'TidyFlow'} — Cleaning Report
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{data.title}</h1>
          <p className="text-slate-600 mt-1">{data.property.address}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800">Service Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 text-sm">
            <div>
              <span className="text-slate-500">Status</span>
              <p className="font-medium capitalize">{data.status?.toLowerCase().replace('_', ' ')}</p>
            </div>
            {data.completedAt && (
              <div>
                <span className="text-slate-500">Completed</span>
                <p className="font-medium">{new Date(data.completedAt).toLocaleDateString()}</p>
              </div>
            )}
            {data.averageScore != null && (
              <div>
                <span className="text-slate-500">AI Quality Score</span>
                <p className="font-bold text-teal-700 text-lg">{data.averageScore}/100</p>
              </div>
            )}
          </div>
        </section>

        {data.checklists?.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800">Checklist</h2>
            <ul className="mt-4 space-y-2">
              {data.checklists.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className={item.isCompleted ? 'text-teal-600' : 'text-slate-400'}>
                    {item.isCompleted ? '✓' : '○'}
                  </span>
                  {item.title}
                </li>
              ))}
            </ul>
          </section>
        )}

        <PhotoSection title="Before Photos" photos={beforePhotos} />
        <PhotoSection title="After Photos" photos={afterPhotos} />

        {data.notes?.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800">Issues Noted</h2>
            <ul className="mt-4 space-y-3">
              {data.notes.map((note, i) => (
                <li key={i} className="text-sm text-slate-700 border-l-2 border-amber-400 pl-3">
                  {note.category && <span className="font-medium">{note.category}: </span>}
                  {note.content}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="text-center text-xs text-slate-400 pb-8">
          Powered by TidyFlow — Professional Cleaning Operations Platform
        </footer>
      </main>
    </div>
  );
}

function scoreColor(score: number) {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (score >= 60) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-rose-100 text-rose-800 border-rose-200';
}

function PhotoSection({ title, photos }: { title: string; photos: PortalPhoto[] }) {
  if (photos.length === 0) return null;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-800">
        {title} ({photos.length})
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50"
          >
            <div className="relative aspect-[4/3] bg-slate-100">
              <img
                src={photo.url}
                alt={photo.caption || title}
                className="w-full h-full object-cover"
              />
              {photo.aiScore != null && (
                <span
                  className={`absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded-full border ${scoreColor(photo.aiScore)}`}
                >
                  {photo.aiScore}/100
                </span>
              )}
            </div>
            {photo.aiSummary && (
              <div className="p-3 border-t border-slate-200 bg-white">
                <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">
                  AI Assessment
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{photo.aiSummary}</p>
                {photo.aiFlags && photo.aiFlags.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {photo.aiFlags.map((flag, i) => (
                      <li key={i} className="text-xs text-amber-700 flex items-start gap-1">
                        <span>•</span>
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
