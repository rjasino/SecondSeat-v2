import { getSession } from '@/lib/session';
import { getUserById } from '@/lib/user';

const ROLE_BADGE: Record<string, string> = {
  user: 'Player',
  author: 'Author',
  admin: 'Admin',
};

export default async function NavBanner() {
  const session = await getSession();
  const sessionUser = session.user;

  const profile = sessionUser ? await getUserById(sessionUser.userId) : null;

  return (
    <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2 text-sm">
      <span className="font-semibold tracking-wide text-neutral-100">SecondSeat</span>

      <div className="flex items-center gap-4">
        {profile ? (
          <>
            <span className="text-neutral-400">{profile.name}</span>
            <span className="rounded bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-300">
              {ROLE_BADGE[profile.role] ?? profile.role}
            </span>
            {(profile.role === 'author' || profile.role === 'admin') && (
              <a
                href="/ingest"
                className="text-neutral-300 transition hover:text-neutral-100"
              >
                Ingestion
              </a>
            )}
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded bg-neutral-800 px-3 py-1 text-neutral-200 transition hover:bg-neutral-700"
              >
                Logout
              </button>
            </form>
          </>
        ) : (
          <>
            <a
              href="/login"
              className="rounded bg-neutral-800 px-3 py-1 text-neutral-200 transition hover:bg-neutral-700"
            >
              Login
            </a>
            <a
              href="/register"
              className="rounded bg-neutral-800 px-3 py-1 text-neutral-200 transition hover:bg-neutral-700"
            >
              Register
            </a>
          </>
        )}
      </div>
    </header>
  );
}
