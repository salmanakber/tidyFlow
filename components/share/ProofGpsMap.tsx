'use client';

import type { ProofMapBounds, ProofMapCheckpoint } from '@/lib/task-proof';
import { buildOsmEmbedUrl } from '@/lib/task-proof';

const KIND_COLORS: Record<string, string> = {
  property: '#0D1B2A',
  on_site: '#059669',
  off_site: '#E11D48',
  start: '#0284C7',
  complete: '#7C3AED',
};

const KIND_LABELS: Record<string, string> = {
  property: 'Property',
  on_site: 'On site',
  off_site: 'Off site',
  start: 'Job start',
  complete: 'Job end',
};

type Props = {
  bounds: ProofMapBounds | null;
  checkpoints: ProofMapCheckpoint[];
  propertyAddress?: string;
};

export default function ProofGpsMap({ bounds, checkpoints, propertyAddress }: Props) {
  if (!bounds || checkpoints.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No GPS map data available for this job yet.
      </p>
    );
  }

  const property = checkpoints.find((c) => c.kind === 'property');
  const embedUrl = buildOsmEmbedUrl(bounds, property);

  const counts = checkpoints.reduce<Record<string, number>>((acc, c) => {
    acc[c.kind] = (acc[c.kind] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
        <iframe
          title="GPS verification map"
          src={embedUrl}
          className="h-64 w-full border-0 md:h-80"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([kind, count]) => (
          <span
            key={kind}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: KIND_COLORS[kind] || '#9CA3AF' }}
            />
            {KIND_LABELS[kind] || kind} ({count})
          </span>
        ))}
      </div>

      {propertyAddress ? (
        <p className="text-xs text-gray-500">
          Map shows sampled GPS checkpoints recorded during the job at{' '}
          <span className="font-semibold text-gray-700">{propertyAddress}</span>.
        </p>
      ) : null}

      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2">
        {checkpoints.slice(0, 12).map((cp) => (
          <a
            key={cp.id}
            href={`https://maps.google.com/?q=${cp.latitude},${cp.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-white"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: KIND_COLORS[cp.kind] || '#9CA3AF' }}
            />
            <span className="flex-1 truncate font-medium">{cp.label}</span>
            {cp.recordedAt ? (
              <span className="shrink-0 text-gray-400">
                {new Date(cp.recordedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            ) : null}
          </a>
        ))}
        {checkpoints.length > 12 ? (
          <p className="px-2 py-1 text-[11px] text-gray-400">
            +{checkpoints.length - 12} more checkpoints on map
          </p>
        ) : null}
      </div>
    </div>
  );
}
