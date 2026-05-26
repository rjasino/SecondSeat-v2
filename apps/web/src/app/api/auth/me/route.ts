import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getUserById } from '@/lib/user';

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const profile = await getUserById(session.user.userId);
  if (!profile) {
    // User document deleted after session was issued — invalidate the stale session.
    session.destroy();
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  return NextResponse.json({
    userId: profile.userId,
    name: profile.name,
    email: profile.email,
    role: profile.role,
  });
}
