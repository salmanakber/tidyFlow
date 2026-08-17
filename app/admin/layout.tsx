'use client';

import { useEffect } from 'react';
import { configureAdminApiClient } from '@/lib/admin-api-client';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    configureAdminApiClient();
  }, []);

  return <>{children}</>;
}
