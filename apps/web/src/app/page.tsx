export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div
        data-testid="placeholder"
        className="rounded-2xl border border-neutral-800 bg-neutral-900 px-8 py-6 text-center"
      >
        <h1 className="text-2xl font-semibold tracking-tight">SecondSeat</h1>
        <p className="mt-2 text-sm text-neutral-400">Scaffold online.</p>
      </div>
    </main>
  );
}
