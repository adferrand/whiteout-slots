"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/client";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
      window.location.href = "/admin";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed.");
      setBusy(false);
    }
  }

  return (
    <form className="login stack" onSubmit={submit}>
      <h1 className="masthead__title">Admin login</h1>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          Log in
        </button>
      </div>
    </form>
  );
}
