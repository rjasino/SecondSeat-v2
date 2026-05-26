import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export async function POST(): Promise<never> {
  const session = await getSession();
  session.destroy();
  redirect('/');
}
