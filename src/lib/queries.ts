import { asc, inArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { booking, settings } from "./db/schema";
import { nextMonday } from "./slots";
import type { CreateBookingInput } from "./validation";
import type { AdminBooking, PublicBooking } from "./types";

// Any drizzle Postgres database (Neon HTTP in production, PGlite in tests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, any, any>;

function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const rows = (res as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** Name of the violated unique constraint (Postgres code 23505), if any. */
export function uniqueViolation(err: unknown): string | null {
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur; depth++) {
    const e = cur as { code?: string; constraint?: string; message?: string; cause?: unknown };
    if (e.code === "23505") return e.constraint ?? "unknown";
    if (typeof e.message === "string" && e.message.includes("duplicate key value")) {
      const m = /unique constraint "([^"]+)"/.exec(e.message);
      return m?.[1] ?? "unknown";
    }
    cur = e.cause;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getMondayUtc(db: Db): Promise<string> {
  const existing = await db.select().from(settings).limit(1);
  if (existing[0]) return existing[0].mondayUtc;
  const fallback = nextMonday();
  await db.insert(settings).values({ id: 1, mondayUtc: fallback }).onConflictDoNothing();
  const again = await db.select().from(settings).limit(1);
  return again[0]?.mondayUtc ?? fallback;
}

export async function setMondayUtc(db: Db, mondayUtc: string): Promise<void> {
  await db
    .insert(settings)
    .values({ id: 1, mondayUtc })
    .onConflictDoUpdate({ target: settings.id, set: { mondayUtc } });
}

// ---------------------------------------------------------------------------
// Reads. Columns are listed explicitly so that admin-only fields can never
// leak into a public response by accident.
// ---------------------------------------------------------------------------

export async function listPublic(db: Db): Promise<PublicBooking[]> {
  const rows = await db
    .select({
      id: booking.id,
      positionKey: booking.positionKey,
      slot: booking.slot,
      pseudo: booking.pseudo,
      alliance: booking.alliance,
      status: booking.status,
    })
    .from(booking)
    .where(inArray(booking.status, ["pending", "confirmed", "rejected"]))
    .orderBy(asc(booking.id));
  return rows as PublicBooking[];
}

export async function listAdmin(db: Db): Promise<AdminBooking[]> {
  const rows = await db
    .select({
      id: booking.id,
      positionKey: booking.positionKey,
      slot: booking.slot,
      pseudo: booking.pseudo,
      alliance: booking.alliance,
      status: booking.status,
      gameId: booking.gameId,
      accelerators: booking.accelerators,
      createdAt: booking.createdAt,
      createdByAdmin: booking.createdByAdmin,
    })
    .from(booking)
    .where(inArray(booking.status, ["pending", "confirmed", "rejected"]))
    .orderBy(asc(booking.id));
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  })) as AdminBooking[];
}

export type ExportRow = {
  positionKey: string;
  slot: number;
  pseudo: string;
  gameId: string;
  alliance: string;
  accelerators: number;
  status: string;
  createdAt: string;
  createdByAdmin: boolean;
};

export async function listForExport(
  db: Db,
  scope: "schedule" | "full",
): Promise<ExportRow[]> {
  const base = db
    .select({
      positionKey: booking.positionKey,
      slot: booking.slot,
      pseudo: booking.pseudo,
      gameId: booking.gameId,
      alliance: booking.alliance,
      accelerators: booking.accelerators,
      status: booking.status,
      createdAt: booking.createdAt,
      createdByAdmin: booking.createdByAdmin,
    })
    .from(booking);
  const rows = await (scope === "schedule"
    ? base.where(sql`${booking.status} = 'confirmed'`)
    : base
  ).orderBy(asc(booking.positionKey), asc(booking.slot), asc(booking.id));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

// ---------------------------------------------------------------------------
// Player writes
// ---------------------------------------------------------------------------

export async function countRecentByIp(db: Db, ipHash: string): Promise<number> {
  const res = await db.execute(sql`
    SELECT count(*)::int AS n FROM booking
    WHERE ip_hash = ${ipHash} AND created_at > now() - interval '10 minutes'
  `);
  return Number(rowsOf<{ n: number }>(res)[0]?.n ?? 0);
}

export type CreateResult =
  | { ok: true; booking: PublicBooking }
  | { ok: false; reason: "slot_taken" | "already_booked" };

/**
 * One statement: inserts only if the slot has no confirmed booking. The unique
 * indexes remain the last line of defence against races.
 */
export async function createBooking(
  db: Db,
  input: CreateBookingInput,
  editTokenHash: string,
  ipHash: string | null,
): Promise<CreateResult> {
  try {
    const res = await db.execute(sql`
      INSERT INTO booking
        (position_key, slot, pseudo, game_id, alliance, accelerators, edit_token_hash, ip_hash)
      SELECT
        ${input.positionKey}::text, ${input.slot}::smallint, ${input.pseudo}::text,
        ${input.gameId}::text, ${input.alliance}::text, ${input.accelerators}::int,
        ${editTokenHash}::text, ${ipHash}::text
      WHERE NOT EXISTS (
        SELECT 1 FROM booking c
        WHERE c.position_key = ${input.positionKey}::text
          AND c.slot = ${input.slot}::smallint
          AND c.status = 'confirmed'
      )
      RETURNING id, position_key AS "positionKey", slot, pseudo, alliance, status
    `);
    const row = rowsOf<PublicBooking>(res)[0];
    if (!row) return { ok: false, reason: "slot_taken" };
    return { ok: true, booking: row };
  } catch (err) {
    const constraint = uniqueViolation(err);
    if (constraint === "booking_one_active_per_player") {
      return { ok: false, reason: "already_booked" };
    }
    if (constraint === "booking_one_confirmed_per_slot") {
      return { ok: false, reason: "slot_taken" };
    }
    throw err;
  }
}

export async function withdrawBooking(
  db: Db,
  id: number,
  editTokenHash: string,
): Promise<boolean> {
  const res = await db.execute(sql`
    UPDATE booking SET status = 'withdrawn', decided_at = now()
    WHERE id = ${id} AND edit_token_hash = ${editTokenHash}
      AND status IN ('pending', 'confirmed')
    RETURNING id
  `);
  return rowsOf(res).length > 0;
}

// ---------------------------------------------------------------------------
// Admin writes
// ---------------------------------------------------------------------------

export type ConfirmResult =
  | { ok: true; rejected: number }
  | { ok: false; reason: "not_pending" | "slot_taken" };

/**
 * Conflict resolution in a single atomic statement: the winner becomes
 * confirmed and every other pending booking on the same slot is rejected.
 * If the slot already has a confirmed booking, the unique index aborts it all.
 */
export async function confirmBooking(db: Db, id: number): Promise<ConfirmResult> {
  try {
    const res = await db.execute(sql`
      WITH w AS (
        UPDATE booking SET status = 'confirmed', decided_at = now()
        WHERE id = ${id} AND status = 'pending'
        RETURNING id, position_key, slot
      ), r AS (
        UPDATE booking b SET status = 'rejected', decided_at = now()
        FROM w
        WHERE b.position_key = w.position_key AND b.slot = w.slot
          AND b.status = 'pending' AND b.id <> w.id
        RETURNING b.id
      )
      SELECT (SELECT count(*) FROM w)::int AS confirmed,
             (SELECT count(*) FROM r)::int AS rejected
    `);
    const row = rowsOf<{ confirmed: number; rejected: number }>(res)[0];
    if (!row || Number(row.confirmed) === 0) return { ok: false, reason: "not_pending" };
    return { ok: true, rejected: Number(row.rejected) };
  } catch (err) {
    if (uniqueViolation(err) === "booking_one_confirmed_per_slot") {
      return { ok: false, reason: "slot_taken" };
    }
    throw err;
  }
}

export type RegisterResult =
  | { ok: true; booking: PublicBooking; rejected: number }
  | { ok: false; reason: "slot_taken" | "already_booked" };

/**
 * Authoritative registration by an admin (request made outside the normal
 * circuit, or late). The player is inserted as confirmed and every pending
 * request on the slot is rejected, in one atomic statement. It is refused when
 * the slot already has a confirmed booking, or when the player already has an
 * active booking for the position (confirm or reject that one instead).
 */
export async function registerBooking(
  db: Db,
  input: CreateBookingInput,
  editTokenHash: string,
): Promise<RegisterResult> {
  try {
    const res = await db.execute(sql`
      WITH ins AS (
        INSERT INTO booking
          (position_key, slot, pseudo, game_id, alliance, accelerators,
           status, edit_token_hash, created_by_admin, decided_at)
        VALUES
          (${input.positionKey}::text, ${input.slot}::smallint, ${input.pseudo}::text,
           ${input.gameId}::text, ${input.alliance}::text, ${input.accelerators}::int,
           'confirmed', ${editTokenHash}::text, true, now())
        RETURNING id, position_key, slot, pseudo, alliance, status
      ), r AS (
        UPDATE booking b SET status = 'rejected', decided_at = now()
        FROM ins
        WHERE b.position_key = ins.position_key AND b.slot = ins.slot
          AND b.status = 'pending' AND b.id <> ins.id
        RETURNING b.id
      )
      SELECT ins.id, ins.position_key AS "positionKey", ins.slot, ins.pseudo,
             ins.alliance, ins.status, (SELECT count(*) FROM r)::int AS rejected
      FROM ins
    `);
    const row = rowsOf<PublicBooking & { rejected: number }>(res)[0];
    if (!row) return { ok: false, reason: "slot_taken" };
    const { rejected, ...booking } = row;
    return { ok: true, booking, rejected: Number(rejected) };
  } catch (err) {
    const constraint = uniqueViolation(err);
    if (constraint === "booking_one_confirmed_per_slot") return { ok: false, reason: "slot_taken" };
    if (constraint === "booking_one_active_per_player") return { ok: false, reason: "already_booked" };
    throw err;
  }
}

/** Rejects a pending or confirmed booking (kept visible, struck through). */
export async function rejectBooking(db: Db, id: number): Promise<boolean> {
  const res = await db.execute(sql`
    UPDATE booking SET status = 'rejected', decided_at = now()
    WHERE id = ${id} AND status IN ('pending', 'confirmed')
    RETURNING id
  `);
  return rowsOf(res).length > 0;
}

export type RestoreResult =
  | { ok: true }
  | { ok: false; reason: "not_rejected" | "player_active" };

/**
 * Puts a rejected booking back to pending (undo of a wrong decision). Fails if
 * the same player has meanwhile taken another active booking for the position.
 */
export async function restoreBooking(db: Db, id: number): Promise<RestoreResult> {
  try {
    const res = await db.execute(sql`
      UPDATE booking SET status = 'pending', decided_at = NULL
      WHERE id = ${id} AND status = 'rejected'
      RETURNING id
    `);
    return rowsOf(res).length > 0 ? { ok: true } : { ok: false, reason: "not_rejected" };
  } catch (err) {
    if (uniqueViolation(err) === "booking_one_active_per_player") {
      return { ok: false, reason: "player_active" };
    }
    throw err;
  }
}

/** Hard delete, for spam. */
export async function purgeBooking(db: Db, id: number): Promise<boolean> {
  const res = await db.execute(sql`DELETE FROM booking WHERE id = ${id} RETURNING id`);
  return rowsOf(res).length > 0;
}

/** Confirms every pending booking that is alone on a free slot. */
export async function confirmUncontested(db: Db): Promise<number> {
  const res = await db.execute(sql`
    UPDATE booking b SET status = 'confirmed', decided_at = now()
    WHERE b.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM booking c
        WHERE c.position_key = b.position_key AND c.slot = b.slot AND c.status = 'confirmed'
      )
      AND (
        SELECT count(*) FROM booking p
        WHERE p.position_key = b.position_key AND p.slot = b.slot AND p.status = 'pending'
      ) = 1
    RETURNING b.id
  `);
  return rowsOf(res).length;
}

/** Wipes all bookings and sets the new event week, atomically. */
export async function resetEvent(db: Db, mondayUtc: string): Promise<number> {
  const res = await db.execute(sql`
    WITH d AS (DELETE FROM booking RETURNING id)
    INSERT INTO settings (id, monday_utc) VALUES (1, ${mondayUtc}::date)
    ON CONFLICT (id) DO UPDATE SET monday_utc = EXCLUDED.monday_utc
    RETURNING (SELECT count(*) FROM d)::int AS deleted
  `);
  return Number(rowsOf<{ deleted: number }>(res)[0]?.deleted ?? 0);
}
