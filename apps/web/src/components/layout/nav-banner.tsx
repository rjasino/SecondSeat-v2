import { getSession } from '@/lib/session';

/**
 * NavBanner — Server Component.
 * Reads the iron-session and renders:
 *  - Authenticated: display name + logout form
 *  - Unauthenticated: login link (→ /)
 */
export default async function NavBanner() {
  const session = await getSession();
  const user = session.user;

  return (
    <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2 text-sm">
      <span className="font-semibold tracking-wide text-neutral-100">SecondSeat</span>

      <div className="flex items-center gap-4">
        {user ? (
          <>
            <span className="text-neutral-400">{user.displayName || user.email}</span>
            <form action="/api/auth/logout" method="get">
              <button
                type="submit"
                className="rounded bg-neutral-800 px-3 py-1 text-neutral-200 transition hover:bg-neutral-700"
              >
                Logout
              </button>
            </form>
          </>
        ) : (
          <a
            href="/"
            className="rounded bg-neutral-800 px-3 py-1 text-neutral-200 transition hover:bg-neutral-700"
          >
            Login
          </a>
        )}
      </div>
    </header>
  );
}
