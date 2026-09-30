"use client";

import { useState, type FormEvent } from "react";
import type { PositionConfig } from "@/lib/config";
import { api, ApiError } from "@/lib/client";
import {
  slotDayLabel,
  slotRange,
  type TzMode,
} from "@/lib/slots";
import { storage, type Profile } from "@/lib/storage";
import type { PublicBooking } from "@/lib/types";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  position: PositionConfig;
  dateUtc: string;
  slot: number;
  slotBookings: PublicBooking[];
  /** The visitor's own active booking for this position, wherever it is. */
  myActive: PublicBooking | undefined;
  tokens: Record<string, string>;
  zoneName: string;
  onBooked: (booking: PublicBooking, token: string, profile: Profile) => void;
  onWithdrawn: (id: number) => void;
};

const STATUS_TEXT = { pending: "Pending", confirmed: "Confirmed", rejected: "Rejected" } as const;

export function BookingDialog(props: Props) {
  const { open, onClose, position, dateUtc, slot, zoneName } = props;
  const modes: TzMode[] = ["utc", "local"];
  const [utc, local] = modes.map((m) => ({
    range: slotRange(dateUtc, slot, m),
    day: slotDayLabel(dateUtc, slot, m),
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${position.title}, ${position.buff} buff`}
      subtitle={
        <>
          <span>{utc.day}, {utc.range} UTC</span>
          <span>{local.day}, {local.range} in {zoneName}</span>
        </>
      }
    >
      <Body {...props} />
    </Modal>
  );
}

function Body({
  position,
  dateUtc,
  slotBookings,
  myActive,
  tokens,
  slot,
  onClose,
  onBooked,
  onWithdrawn,
}: Props) {
  const confirmed = slotBookings.find((b) => b.status === "confirmed");
  const [profile] = useState<Profile>(() => storage.getProfile());
  const [pseudo, setPseudo] = useState(profile.pseudo);
  const [gameId, setGameId] = useState(profile.gameId);
  const [alliance, setAlliance] = useState(profile.alliance);
  const [accelerators, setAccelerators] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ booking: PublicBooking; editToken: string }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          positionKey: position.key,
          slot,
          pseudo,
          gameId,
          alliance,
          accelerators: accelerators.trim() === "" ? NaN : Number(accelerators),
        }),
      });
      onBooked(res.booking, res.editToken, {
        pseudo: pseudo.trim(),
        gameId: gameId.trim(),
        alliance: alliance.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your request.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: number) {
    setError(null);
    setBusy(true);
    try {
      await api(`/api/bookings/${id}`, {
        method: "DELETE",
        headers: { "x-edit-token": tokens[String(id)] ?? "" },
      });
      onWithdrawn(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not withdraw your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {slotBookings.length > 0 && (
        <ul className="rows" aria-label="Requests on this slot">
          {slotBookings.map((b) => (
            <li key={b.id} className={`rows__item rows__item--${b.status}`}>
              <span className="rows__who">
                {b.status === "rejected" ? <s>{b.pseudo}</s> : b.pseudo}{" "}
                <span className="muted">[{b.alliance}]</span>
                {tokens[String(b.id)] && <span className="tag">You</span>}
              </span>
              <span className={`badge badge--${b.status}`}>{STATUS_TEXT[b.status as keyof typeof STATUS_TEXT]}</span>
            </li>
          ))}
        </ul>
      )}

      {confirmed ? (
        <p className="note">
          This slot is confirmed for {confirmed.pseudo}. Pick another free slot.
        </p>
      ) : myActive ? (
        <div className="note stack stack--tight">
          <p>
            You already have an active request for this position (
            {slotRange(dateUtc, myActive.slot, "utc")} UTC). Withdraw it before requesting
            another slot.
          </p>
          <div>
            <button type="button" className="btn" disabled={busy} onClick={() => withdraw(myActive.id)}>
              Withdraw my request
            </button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p className="muted">
            Your request stays pending until an admin confirms it. If several players want the
            same slot, an admin decides.
          </p>
          <div className="field">
            <label htmlFor="pseudo">In-game name</label>
            <input id="pseudo" value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={32} required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="gameId">Game ID</label>
            <input id="gameId" value={gameId} onChange={(e) => setGameId(e.target.value)} inputMode="numeric" pattern="\d{6,12}" title="6 to 12 digits" required autoComplete="off" />
            <span className="field__hint">Only admins see your game ID.</span>
          </div>
          <div className="field">
            <label htmlFor="alliance">Alliance</label>
            <input id="alliance" value={alliance} onChange={(e) => setAlliance(e.target.value)} maxLength={32} required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="accel">Planned {position.speedupKind} speedups, in days</label>
            <input id="accel" type="number" min={0} step={1} inputMode="numeric" value={accelerators} onChange={(e) => setAccelerators(e.target.value)} required />
            <span className="field__hint">Only admins see this. It helps them choose when two players want the same slot.</span>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Sending" : "Request this slot"}
            </button>
            <span className="muted">Your details stay in this browser to prefill the next request.</span>
          </div>
        </form>
      )}
      {(confirmed || myActive) && error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
