"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/client";
import { addDays, formatUtcDate } from "@/lib/slots";
import { storage } from "@/lib/storage";
import { Modal } from "./Modal";

type Props = {
  mondayUtc: string;
  totalBookings: number;
  uncontested: number;
  onChanged: (message?: string) => void;
};

const EXPORTS = [
  { label: "Schedule as CSV", href: "/api/admin/export?scope=schedule&format=csv" },
  { label: "Schedule as text for chat", href: "/api/admin/export?scope=schedule&format=text" },
  { label: "Full log as CSV", href: "/api/admin/export?scope=full&format=csv" },
];

export function AdminToolbar({ mondayUtc, totalBookings, uncontested, onChanged }: Props) {
  const [week, setWeek] = useState(mondayUtc);
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<string | undefined>) {
    setError(null);
    setBusy(true);
    try {
      onChanged(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The action failed.");
    } finally {
      setBusy(false);
    }
  }

  const saveWeek = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ mondayUtc: week }) });
      return "Event week saved.";
    });
  };

  const confirmUncontested = () =>
    void run(async () => {
      const r = await api<{ confirmed: number }>("/api/admin/confirm-uncontested", { method: "POST" });
      return `${r.confirmed} uncontested booking${r.confirmed === 1 ? "" : "s"} confirmed.`;
    });

  const logout = async () => {
    await api("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/admin/login";
  };

  return (
    <section className="toolbar" aria-label="Admin tools">
      <form className="toolbar__week" onSubmit={saveWeek}>
        <div className="field field--inline">
          <label htmlFor="week">Event week starts on Monday (UTC)</label>
          <input id="week" type="date" value={week} onChange={(e) => setWeek(e.target.value)} required />
        </div>
        <button type="submit" className="btn" disabled={busy || week === mondayUtc}>
          Save week
        </button>
      </form>

      <div className="toolbar__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || uncontested === 0}
          onClick={confirmUncontested}
        >
          Confirm {uncontested} uncontested
        </button>

        <details className="menu">
          <summary className="btn">Export</summary>
          <div className="menu__panel">
            {EXPORTS.map((x) => (
              <a key={x.href} href={x.href} download onClick={() => storage.markExported()}>
                {x.label}
              </a>
            ))}
          </div>
        </details>

        <button type="button" className="btn btn--danger" onClick={() => setResetOpen(true)}>
          Reset event
        </button>
        <button type="button" className="btn btn--quiet" onClick={logout}>
          Log out
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <ResetDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        mondayUtc={mondayUtc}
        totalBookings={totalBookings}
        onDone={(msg) => {
          setResetOpen(false);
          onChanged(msg);
        }}
      />
    </section>
  );
}

function ResetDialog({
  open,
  onClose,
  mondayUtc,
  totalBookings,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  mondayUtc: string;
  totalBookings: number;
  onDone: (message: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Reset event" subtitle={<span>Prepare the site for the next SvS week</span>}>
      <ResetBody mondayUtc={mondayUtc} totalBookings={totalBookings} onDone={onDone} onClose={onClose} />
    </Modal>
  );
}

function ResetBody({
  mondayUtc,
  totalBookings,
  onDone,
  onClose,
}: {
  mondayUtc: string;
  totalBookings: number;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const [exported, setExported] = useState(() => storage.hasExported());
  const [nextWeek, setNextWeek] = useState(() => addDays(mondayUtc, 7));
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsExport = totalBookings > 0 && !exported;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ deleted: number }>("/api/admin/reset", {
        method: "POST",
        body: JSON.stringify({ mondayUtc: nextWeek, confirm }),
      });
      storage.clearExported();
      onDone(`Event reset: ${r.deleted} booking${r.deleted === 1 ? "" : "s"} deleted. New week starts ${formatUtcDate(nextWeek)}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p>
        This permanently deletes all {totalBookings} booking{totalBookings === 1 ? "" : "s"} and
        cannot be undone.
      </p>

      {needsExport ? (
        <div className="note note--alert stack stack--tight">
          <p>Export the results first. The reset unlocks once you have downloaded an export.</p>
          <div className="actions">
            {EXPORTS.map((x) => (
              <a
                key={x.href}
                className="btn"
                href={x.href}
                download
                onClick={() => {
                  storage.markExported();
                  setExported(true);
                }}
              >
                {x.label}
              </a>
            ))}
          </div>
        </div>
      ) : (
        totalBookings > 0 && <p className="muted">Export downloaded in this session.</p>
      )}

      <div className="field">
        <label htmlFor="nextWeek">New event week starts on Monday (UTC)</label>
        <input id="nextWeek" type="date" value={nextWeek} onChange={(e) => setNextWeek(e.target.value)} required disabled={needsExport} />
      </div>
      <div className="field">
        <label htmlFor="confirmReset">Type RESET to confirm</label>
        <input id="confirmReset" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" disabled={needsExport} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" className="btn btn--danger" disabled={busy || needsExport || confirm !== "RESET"}>
          Delete all bookings
        </button>
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
