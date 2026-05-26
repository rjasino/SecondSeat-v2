import { NextResponse } from 'next/server';
import argon2 from 'argon2';
import { User } from '@secondseat/db';
import { ensureDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { registerSchema } from '@/schemas/auth';
import { formatZodErrors } from '@/schemas/ingest';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: [{ field: 'body', message: 'Invalid JSON' }] }, { status: 422 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: formatZodErrors(parsed.error) }, { status: 422 });
  }

  await ensureDb();

  const existing = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const passwordHash = await argon2.hash(parsed.data.password);

  const user = await User.create({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    passwordHash,
    role: 'user',
    profile: {
      displayName: parsed.data.name,
    },
  });

  const session = await getSession();
  session.user = {
    id: user._id.toString(),
    email: user.email,
    displayName: user.name,
    role: user.role,
  };
  await session.save();

  return NextResponse.json(
    {
      id: user._id.toString(),
      email: user.email,
      displayName: user.name,
      role: user.role,
    },
    { status: 201 },
  );
}
