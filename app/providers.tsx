'use client';

import { useEffect } from 'react';
import { configureAdminApiClient } from '@/lib/admin-api-client';
import { CompanyWorkspaceProvider } from '@/contexts/CompanyWorkspaceContext';

/** Configure axios — runs on login, /admin, and /{companySlug} workspaces. */
export default function RootClientProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    configureAdminApiClient();
  }, []);

  return <CompanyWorkspaceProvider>{children}</CompanyWorkspaceProvider>;
}
