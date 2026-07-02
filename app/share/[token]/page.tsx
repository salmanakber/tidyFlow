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
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-semibold text-rose-600">Link expired</p>
        <p className="mt-2 text-sm text-gray-500">This client report link is no longer valid.</p>
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
    <main className="min-h-screen bg-[#F7F8FA] pb-16">
      <header className="border-b border-gray-200 bg-white px-4 py-8 md:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-wide text-[#0D1B2A]/60">
            {task.companyName}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[#0D1117] md:text-3xl">
            Cleaning Report
          </h1>
          <p className="mt-2 text-sm text-gray-600">{task.property.address}</p>
          <p className="mt-1 text-sm font-medium text-[#0D1B2A]">{task.title}</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-6 md:px-8">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <dl className="space-y-3 text-sm">
            {cleanerName ? (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Completed by</dt>
                <dd className="font-semibold text-gray-900">{cleanerName}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Date</dt>
              <dd className="font-semibold text-gray-900">
                {task.completedAt
                  ? new Date(task.completedAt).toLocaleDateString()
                  : task.scheduledDate
                    ? new Date(task.scheduledDate).toLocaleDateString()
                    : '—'}
              </dd>
            </div>
            {proof.totalWorkMinutes > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Work time</dt>
                <dd className="font-semibold text-emerald-700">
                  {formatDurationMinutes(proof.totalWorkMinutes)}
                </dd>
              </div>
            ) : null}
            {task.averageScore != null ? (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Quality score</dt>
                <dd className="font-semibold text-gray-900">{task.averageScore}/100</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Status</dt>
              <dd>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  {task.status.replace(/_/g, ' ')}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {proof.gps.checkpointCount > 0 ? (
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0D1117]">GPS verification</h2>
            <p className="mt-1 text-sm text-gray-600">
              {proof.gps.checkpointCount} location checkpoints
              {proof.gps.onSiteCount > 0 ? ` · ${proof.gps.onSiteCount} on site` : ''}
              {proof.gps.offSiteCount > 0 ? ` · ${proof.gps.offSiteCount} off site` : ''}
            </p>

            {proof.cleaners.map((c, idx) => (
              <div key={`${c.name}-${idx}`} className="mt-3 text-sm">
                <p className="font-semibold text-gray-900">{c.name}</p>
                <p className="text-gray-500">
                  {formatDurationMinutes(c.workMinutes)}
                  {c.startWithinGeofence === true
                    ? ' · Started on site'
                    : c.startWithinGeofence === false
                      ? ' · Started off site'
                      : ''}
                </p>
              </div>
            ))}

            <div className="mt-5">
              <ProofGpsMap
                bounds={proof.gps.mapBounds}
                checkpoints={proof.gps.mapCheckpoints}
                propertyAddress={task.property.address}
              />
            </div>
          </section>
        ) : null}

        {beforePhotos.length > 0 ? (
          <section>
            <h2 className="mb-3 text-lg font-bold text-[#0D1117]">
              Before photos ({beforePhotos.length})
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {beforePhotos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption || 'Before photo'}
                    className="h-40 w-56 rounded-lg border border-gray-200 object-cover shadow-sm"
                  />
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {afterPhotos.length > 0 ? (
          <section>
            <h2 className="mb-3 text-lg font-bold text-[#0D1117]">
              After photos ({afterPhotos.length})
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {afterPhotos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption || 'After photo'}
                    className="h-40 w-56 rounded-lg border border-gray-200 object-cover shadow-sm"
                  />
                  {photo.aiScore != null ? (
                    <p className="mt-1 text-center text-xs font-semibold text-gray-600">
                      AI score {photo.aiScore}/100
                    </p>
                  ) : null}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {task.checklists.length > 0 ? (
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#0D1117]">Checklist</h2>
            <ul className="mt-3 space-y-2">
              {task.checklists.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                  <span
                    className={`mt-0.5 inline-block h-4 w-4 rounded border ${
                      item.isCompleted
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-gray-300 bg-white'
                    }`}
                  />
                  {item.title}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <footer className="mx-auto mt-10 max-w-3xl px-4 text-center text-xs text-gray-400 md:px-8">
        Verified cleaning report · {task.companyName}
      </footer>
    </main>
  );
}
