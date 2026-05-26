import { getSession } from '@/lib/session';

export default async function HomePage() {
  const session = await getSession();
  const user = session.user;

  if (user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 px-8 py-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.displayName}</h1>
          <p className="mt-2 text-sm text-neutral-400">The hint companion is on its way.</p>
          <p className="mt-1 text-xs text-neutral-600">Inference UI coming soon.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 px-8 py-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">SecondSeat</h1>
        <p className="mt-2 text-sm text-neutral-400">Your spoiler-safe gaming companion.</p>
        <a
          href="/login"
          className="mt-4 inline-block rounded bg-neutral-700 px-4 py-2 text-sm text-neutral-100 transition hover:bg-neutral-600"
        >
          Sign in
        </a>
        <p className="mt-3 text-xs text-neutral-600">
          New player?{' '}
          <a href="/register" className="text-neutral-400 underline hover:text-neutral-200">
            Create an account
          </a>
        </p>
      </div>
    </main>
  );
}
