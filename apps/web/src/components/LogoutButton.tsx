"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
      router.push("/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="ghost"
      style={{ fontSize: "12px", padding: "5px 12px" }}
    >
      {loading ? "Logging out…" : "Logout"}
    </button>
  );
}
