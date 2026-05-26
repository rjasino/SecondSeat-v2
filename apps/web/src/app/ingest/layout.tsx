import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession } from '@/lib/session';

export default async function IngestLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session.user) {
    redirect('/login');
  }

  if (!['author', 'admin'].includes(session.user.role)) {
    redirect('/');
  }

  return <>{children}</>;
}
