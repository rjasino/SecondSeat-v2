import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

/**
 * GET /api/auth/logout
 * Destroys the iron-session cookie and redirects to the landing page.
 */
export async function GET(): Promise<never> {
  const session = await getSession();
  session.destroy();
  redirect('/');
}
