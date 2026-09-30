"use client";

import { useState } from "react";
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

function Body({ position, slotBookings, tz, onChanged }: Props) {
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

  if (slotBookings.length === 0) {
    return <p className="note">Nobody has requested this slot yet.</p>;
  }

  return (
    <div className="stack">
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
      {hasConfirmed && (
        <p className="muted">
          This slot is confirmed. Reject the confirmed booking to free the slot, then restore or
          confirm another request.
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
