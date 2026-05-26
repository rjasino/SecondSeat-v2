import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession } from '@/lib/session';

/**
 * Layout for all /ingest routes.
 * Enforces author | admin access — redirects everyone else to the landing page.
 */
export default async function IngestLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session.user || !['author', 'admin'].includes(session.user.role)) {
    redirect('/login');
  }

  return <>{children}</>;
}
