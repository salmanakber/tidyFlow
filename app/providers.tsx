'use client';

import { useEffect } from 'react';
import { configureAdminApiClient } from '@/lib/admin-api-client';

/** Configure axios for admin pages — runs on /login and all /admin routes. */
export default function RootClientProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    configureAdminApiClient();
  }, []);

  return <>{children}</>;
}
