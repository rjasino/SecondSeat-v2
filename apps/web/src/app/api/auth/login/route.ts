import { NextResponse } from 'next/server';
import argon2 from 'argon2';
import { User } from '@secondseat/db';
import { ensureDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { loginSchema } from '@/schemas/auth';
import { formatZodErrors } from '@/schemas/ingest';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'validation_error', issues: [{ path: ['body'], message: 'Invalid JSON' }] },
      { status: 422 },
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', issues: formatZodErrors(parsed.error) },
      { status: 422 },
    );
  }

  await ensureDb();

  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const valid = await argon2.verify(user.passwordHash, parsed.data.password);
  if (!valid) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const session = await getSession();
  session.user = {
    userId: user._id.toString(),
    role: user.role,
  };
  await session.save();

  return NextResponse.json({ ok: true, role: user.role });
}
