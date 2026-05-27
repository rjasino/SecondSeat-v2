import NavBar from "@/components/NavBar";

export default function HomePage() {
  return (
    <>
      <NavBar />
      <main
        style={{
          maxWidth: "640px",
          margin: "0 auto",
          padding: "4rem 2rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "1rem" }}>
          SecondSeat
        </h1>
        <p style={{ color: "var(--text-muted)", lineHeight: "1.8" }}>
          Your second-screen AI companion for gaming. Get 1–3 line, spoiler-safe
          micro-hints without breaking your flow.
        </p>
      </main>
    </>
  );
}
