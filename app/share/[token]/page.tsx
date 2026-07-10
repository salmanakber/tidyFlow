
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSharePortalData } from '@/lib/share-portal';
import ProofGpsMap from '@/components/share/ProofGpsMap';

function formatDurationMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

type PageProps = { params: { token: string } };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const result = await getSharePortalData(params.token, { incrementView: false });
  if (!result.ok) {
    return { title: 'Cleaning Report' };
  }
  return {
    title: `${result.data.title} · Cleaning Report`,
    description: `Photo and GPS verified cleaning report for ${result.data.property.address}`,
  };
}

export default async function SharePortalPage({ params }: PageProps) {
  const result = await getSharePortalData(params.token);
  if (!result.ok) {
    if (result.ok === false && result.status === 404) notFound();
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center bg-slate-50">
        <div className="rounded-2xl bg-white p-8 shadow-sm border border-slate-100">
          <svg className="mx-auto h-12 w-12 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="mt-4 text-lg font-semibold text-slate-900">Link Expired</p>
          <p className="mt-2 text-sm text-slate-500">This client report link is no longer valid or has been deactivated.</p>
        </div>
      </main>
    );
  }

  const task = result.data;
  const proof = task.proof;
  const beforePhotos = task.photos.filter((p) => p.photoType === 'before');
  const afterPhotos = task.photos.filter((p) => p.photoType === 'after');
  const cleanerName = task.assignedUser
    ? `${task.assignedUser.firstName || ''} ${task.assignedUser.lastName || ''}`.trim()
    : proof.cleaners[0]?.name;

  return (
    <main className="min-h-screen bg-slate-50 pb-16 text-slate-800 antialiased">
      {/* Top Brand Bar */}
      <div className="bg-slate-900 px-4 py-3 text-center text-xs font-medium tracking-wider text-slate-300 uppercase">
        {task.companyName || 'Cleaning Service Report'}
      </div>

      {/* Header Section */}
      <header className="border-b border-slate-200 bg-white px-4 py-8 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Verified Report
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 uppercase tracking-wider">
              {task.status.replace(/_/g, ' ')}
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-950 md:text-3.5xl">
            Cleaning Report
          </h1>
          <p className="mt-1.5 text-base font-semibold text-slate-700">{task.title}</p>
          
          <div className="mt-4 flex items-start gap-2 text-sm text-slate-500">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{task.property.address}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-6 md:px-8">
        
        {/* Report Summary Cards */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cleanerName ? (
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Service Professional</span>
              <span className="mt-1 block text-sm font-semibold text-slate-900 truncate">{cleanerName}</span>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Service Date</span>
            <span className="mt-1 block text-sm font-semibold text-slate-900">
              {task.completedAt
                ? new Date(task.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : task.scheduledDate
                  ? new Date(task.scheduledDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—'}
            </span>
          </div>

          {proof.totalWorkMinutes > 0 ? (
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Time on Site</span>
              <span className="mt-1 block text-sm font-semibold text-emerald-700">
                {formatDurationMinutes(proof.totalWorkMinutes)}
              </span>
            </div>
          ) : null}

          {task.averageScore != null ? (
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider">Quality Score</span>
              <span className="mt-1 block text-sm font-bold text-slate-900">
                {task.averageScore}<span className="text-xs font-normal text-slate-400">/100</span>
              </span>
            </div>
          ) : null}
        </section>

        {/* GPS Verification Info & Map */}
        {proof.gps.checkpointCount > 0 ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/50 p-5">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-sky-50 p-1.5 text-sky-600 ring-1 ring-sky-500/10">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <h2 className="text-base font-bold text-slate-900">GPS Audit Verification</h2>
              </div>
              <p className="mt-2 text-xs font-medium text-slate-500">
                {proof.gps.checkpointCount} logged location pings
                {proof.gps.onSiteCount > 0 ? ` · ${proof.gps.onSiteCount} confirmed on site` : ''}
                {proof.gps.offSiteCount > 0 ? ` · ${proof.gps.offSiteCount} off site` : ''}
              </p>

              {proof.cleaners.map((c, idx) => (
                <div key={`${c.name}-${idx}`} className="mt-3 rounded-lg border border-slate-100 bg-white p-3 text-xs shadow-xs">
                  <div className="flex items-center justify-between font-semibold text-slate-800">
                    <span>{c.name}</span>
                    <span className="text-slate-500">{formatDurationMinutes(c.workMinutes)}</span>
                  </div>
                  {c.startWithinGeofence !== undefined && (
                    <div className="mt-1 flex items-center gap-1 text-slate-400">
                      <span className={`h-1.5 w-1.5 rounded-full ${c.startWithinGeofence ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                      <span>{c.startWithinGeofence ? 'Started within authorized property zone' : 'Started outside property zone'}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-50">
              <div className="overflow-hidden rounded-xl border border-slate-200 shadow-inner">
                <ProofGpsMap
                  bounds={proof.gps.mapBounds}
                  checkpoints={proof.gps.mapCheckpoints}
                  propertyAddress={task.property.address}
                />
              </div>
            </div>
          </section>
        ) : null}

        {/* Before Photos Gallery */}
        {beforePhotos.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Before Photos <span className="ml-1 text-xs font-normal text-slate-400">({beforePhotos.length})</span>
              </h2>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Initial State</span>
            </div>
            
            <div className="flex gap-4 overflow-x-auto pb-3 snap-x scrollbar-thin scrollbar-thumb-slate-200">
              {beforePhotos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative shrink-0 snap-start overflow-hidden rounded-xl border border-slate-200 shadow-sm transition hover:opacity-95"
                >
                  <span className="absolute top-2 left-2 z-10 rounded bg-slate-900/70 px-2 py-0.5 text-[10px] font-bold text-white uppercase backdrop-blur-xs">
                    Before
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption || 'Before service'}
                    className="h-44 w-64 object-cover"
                  />
                  {photo.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-[11px] text-white truncate">{photo.caption}</p>
                    </div>
                  )}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {/* After Photos Gallery */}
        {afterPhotos.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                After Photos <span className="ml-1 text-xs font-normal text-slate-400">({afterPhotos.length})</span>
              </h2>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                Completed
              </span>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-3 snap-x scrollbar-thin scrollbar-thumb-slate-200">
              {afterPhotos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative shrink-0 snap-start overflow-hidden rounded-xl border border-slate-200 shadow-sm transition hover:opacity-95"
                >
                  <span className="absolute top-2 left-2 z-10 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase shadow-xs">
                    After
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption || 'After service'}
                    className="h-44 w-64 object-cover"
                  />
                  
                  {photo.aiScore != null && (
                    <span className="absolute top-2 right-2 z-10 rounded bg-slate-900/70 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                      AI: {photo.aiScore}/100
                    </span>
                  )}

                  {photo.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-[11px] text-white truncate">{photo.caption}</p>
                    </div>
                  )}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {/* Dynamic Checklist Tasks */}
        {task.checklists.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Task Inspection Checklist</h2>
              <p className="text-xs text-slate-400">Real-time checklist logged at completion</p>
            </div>
            
            <ul className="mt-4 divide-y divide-slate-100">
              {task.checklists.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  {item.isCompleted ? (
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="10" cy="10" r="7" />
                    </svg>
                  )}
                  <span className={`font-medium ${item.isCompleted ? 'text-slate-600 line-through decoration-slate-300' : 'text-slate-800'}`}>
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/* Footer */}
      <footer className="mx-auto mt-12 max-w-3xl px-4 text-center text-xs text-slate-400 md:px-8">
        <p className="font-semibold tracking-wide uppercase text-slate-400/80">Verified Cleaning Report</p>
        <p className="mt-1">Generated and verified by {task.companyName}</p>
      </footer>
    </main>
  );
}
