import { Suspense } from 'react';
import PublicSubscribePlanPage from './SubscribePlanClient';

export default function Page() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#5A6E85',
          }}
        >
          Loading…
        </main>
      }
    >
      <PublicSubscribePlanPage />
    </Suspense>
  );
}
