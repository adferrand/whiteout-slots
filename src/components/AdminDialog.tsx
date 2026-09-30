"use client";

import { useState, type FormEvent } from "react";
import type { PositionConfig } from "@/lib/config";
import { api, ApiError } from "@/lib/client";
import { slotDayLabel, slotRange, type TzMode } from "@/lib/slots";
import type { AdminBooking } from "@/lib/types";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  position: PositionConfig;
  dateUtc: string;
  slot: number;
  slotBookings: AdminBooking[];
  tz: TzMode;
  zoneName: string;
  onChanged: (message?: string) => void;
};

const STATUS_TEXT = { pending: "Pending", confirmed: "Confirmed", rejected: "Rejected" } as const;

function stamp(iso: string, tz: TzMode): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: tz === "utc" ? "UTC" : undefined,
  }).format(new Date(iso));
}

export function AdminDialog(props: Props) {
  const { open, onClose, position, dateUtc, slot, zoneName } = props;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${position.title}, ${position.buff} buff`}
      day={position.key}
      subtitle={
        <>
          <span>{slotDayLabel(dateUtc, slot, "utc")}, {slotRange(dateUtc, slot, "utc")} UTC</span>
          <span>{slotDayLabel(dateUtc, slot, "local")}, {slotRange(dateUtc, slot, "local")} in {zoneName}</span>
        </>
      }
    >
      <Body {...props} />
    </Modal>
  );
}

function Body({ position, slot, slotBookings, tz, onChanged }: Props) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = slotBookings.filter((b) => b.status === "pending");
  const hasConfirmed = slotBookings.some((b) => b.status === "confirmed");
  const maxAccel = pending.length > 1 ? Math.max(...pending.map((b) => b.accelerators)) : null;

  async function run(id: number, request: () => Promise<unknown>, message: string) {
    setError(null);
    setBusy(id);
    try {
      await request();
      onChanged(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The action failed.");
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  const patch = (id: number, action: "confirm" | "reject" | "restore") =>
    api(`/api/admin/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });

  return (
    <div className="stack">
      {slotBookings.length === 0 && <p className="note">Nobody has requested this slot yet.</p>}
      {pending.length > 1 && (
        <p className="note note--alert">
          {pending.length} players want this slot. Confirm one and the others are rejected.
        </p>
      )}
      <ul className="cards">
        {slotBookings.map((b) => (
          <li key={b.id} className={`card card--${b.status}`}>
            <div className="card__head">
              <strong className="card__name">
                {b.status === "rejected" ? <s>{b.pseudo}</s> : b.pseudo}{" "}
                <span className="muted">[{b.alliance}]</span>
                {b.createdByAdmin && <span className="tag tag--admin">Registered by admin</span>}
              </strong>
              <span className={`badge badge--${b.status}`}>{STATUS_TEXT[b.status as keyof typeof STATUS_TEXT]}</span>
            </div>
            <dl className="facts">
              <div>
                <dt>Game ID</dt>
                <dd>{b.gameId}</dd>
              </div>
              <div>
                <dt>Planned {position.speedupKind} speedups</dt>
                <dd>
                  {b.accelerators.toLocaleString("en-GB")} days
                  {maxAccel !== null && b.status === "pending" && b.accelerators === maxAccel && (
                    <span className="tag">Most speedups</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Requested</dt>
                <dd>{stamp(b.createdAt, tz)}{tz === "utc" ? " UTC" : ""}</dd>
              </div>
            </dl>
            <div className="actions">
              {b.status === "pending" && (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy !== null || hasConfirmed}
                  onClick={() =>
                    run(b.id, () => patch(b.id, "confirm"), `${b.pseudo} confirmed.`)
                  }
                >
                  {pending.length > 1 ? "Confirm this player" : "Confirm"}
                </button>
              )}
              {(b.status === "pending" || b.status === "confirmed") && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy !== null}
                  onClick={() =>
                    run(b.id, () => patch(b.id, "reject"), `${b.pseudo} rejected.`)
                  }
                >
                  Reject
                </button>
              )}
              {b.status === "rejected" && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy !== null}
                  onClick={() =>
                    run(b.id, () => patch(b.id, "restore"), `${b.pseudo} is pending again.`)
                  }
                >
                  Restore to pending
                </button>
              )}
              <button
                type="button"
                className="btn btn--danger-quiet"
                disabled={busy !== null}
                onClick={() => {
                  if (!window.confirm(`Delete ${b.pseudo}'s request permanently? Use Reject to keep it visible.`)) return;
                  void run(
                    b.id,
                    () => api(`/api/admin/bookings/${b.id}`, { method: "DELETE" }),
                    `${b.pseudo}'s request deleted.`,
                  );
                }}
              >
                Delete permanently
              </button>
            </div>
          </li>
        ))}
      </ul>
      {hasConfirmed ? (
        <p className="muted">
          This slot is confirmed. Reject the confirmed booking to free the slot, then restore,
          confirm or register another player.
        </p>
      ) : (
        <RegisterForm
          position={position}
          slot={slot}
          pendingCount={pending.length}
          startOpen={slotBookings.length === 0}
          onChanged={onChanged}
        />
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

/** Authoritative registration: request made outside the site, or a late one. */
function RegisterForm({
  position,
  slot,
  pendingCount,
  startOpen,
  onChanged,
}: {
  position: PositionConfig;
  slot: number;
  pendingCount: number;
  startOpen: boolean;
  onChanged: (message?: string) => void;
}) {
  const [pseudo, setPseudo] = useState("");
  const [gameId, setGameId] = useState("");
  const [alliance, setAlliance] = useState("");
  const [accelerators, setAccelerators] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ rejected: number }>("/api/admin/bookings", {
        method: "POST",
        body: JSON.stringify({
          positionKey: position.key,
          slot,
          pseudo,
          gameId,
          alliance,
          ...(accelerators.trim() === "" ? {} : { accelerators: Number(accelerators) }),
        }),
      });
      onChanged(
        `${pseudo.trim()} registered and confirmed.` +
          (r.rejected > 0 ? ` ${r.rejected} pending request${r.rejected === 1 ? "" : "s"} rejected.` : ""),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="register" open={startOpen}>
      <summary className="register__summary">Register a player on this slot</summary>
      <form className="stack register__form" onSubmit={submit}>
        <p className="muted">
          The player is confirmed immediately.
          {pendingCount > 0 && ` The ${pendingCount} pending request${pendingCount === 1 ? "" : "s"} on this slot will be rejected.`}
        </p>
        <div className="field">
          <label htmlFor="reg-pseudo">In-game name</label>
          <input id="reg-pseudo" value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={32} required autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="reg-gameId">Game ID</label>
          <input id="reg-gameId" value={gameId} onChange={(e) => setGameId(e.target.value)} inputMode="numeric" pattern="\d{6,12}" title="6 to 12 digits" required autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="reg-alliance">Alliance</label>
          <input id="reg-alliance" value={alliance} onChange={(e) => setAlliance(e.target.value)} maxLength={32} required autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="reg-accel">Planned {position.speedupKind} speedups, in days (optional)</label>
          <input id="reg-accel" type="number" min={0} step={1} inputMode="numeric" value={accelerators} onChange={(e) => setAccelerators(e.target.value)} />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Registering" : "Register and confirm"}
          </button>
        </div>
      </form>
    </details>
  );
}
