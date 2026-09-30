import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import {
  confirmBooking,
  confirmUncontested,
  createBooking,
  getMondayUtc,
  listAdmin,
  listPublic,
  purgeBooking,
  rejectBooking,
  resetEvent,
  restoreBooking,
  withdrawBooking,
} from "../src/lib/queries";

// Real Postgres semantics (PGlite = Postgres compiled to WASM), same migration
// file as production, same query functions as the API routes.
const pg = new PGlite();
const db = drizzle(pg, { schema });

const input = (over: Partial<Parameters<typeof createBooking>[1]> = {}) => ({
  positionKey: "vp_construction" as const,
  slot: 10,
  pseudo: "Alice",
  gameId: "100000001",
  alliance: "ABC",
  accelerators: 50,
  ...over,
});

describe("booking invariants", () => {
  before(async () => {
    const migration = readFileSync("drizzle/0000_init.sql", "utf8");
    for (const stmt of migration.split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  });

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM booking`);
  });

  it("lets two players book the same free slot (conflict, both pending)", async () => {
    const a = await createBooking(db, input(), "tokA", null);
    const b = await createBooking(db, input({ pseudo: "Bob", gameId: "100000002" }), "tokB", null);
    assert.ok(a.ok && b.ok);
    const rows = await listPublic(db);
    assert.equal(rows.filter((r) => r.status === "pending").length, 2);
  });

  it("refuses a second active booking for the same game ID and position", async () => {
    await createBooking(db, input(), "tokA", null);
    const dup = await createBooking(db, input({ slot: 11 }), "tokA2", null);
    assert.deepEqual(dup, { ok: false, reason: "already_booked" });
    // Same player, other position: allowed.
    const other = await createBooking(db, input({ positionKey: "vp_research" }), "tokA3", null);
    assert.ok(other.ok);
  });

  it("resolves a conflict atomically: winner confirmed, others rejected", async () => {
    const a = await createBooking(db, input(), "tokA", null);
    const b = await createBooking(db, input({ pseudo: "Bob", gameId: "100000002" }), "tokB", null);
    const c = await createBooking(db, input({ pseudo: "Cy", gameId: "100000003" }), "tokC", null);
    assert.ok(a.ok && b.ok && c.ok);
    const res = await confirmBooking(db, b.booking.id);
    assert.deepEqual(res, { ok: true, rejected: 2 });
    const rows = await listPublic(db);
    const byId = new Map(rows.map((r) => [r.id, r.status]));
    assert.equal(byId.get(b.booking.id), "confirmed");
    assert.equal(byId.get(a.booking.id), "rejected");
    assert.equal(byId.get(c.booking.id), "rejected");
  });

  it("closes a confirmed slot to new bookings", async () => {
    const a = await createBooking(db, input(), "tokA", null);
    assert.ok(a.ok);
    await confirmBooking(db, a.booking.id);
    const late = await createBooking(db, input({ pseudo: "Late", gameId: "100000009" }), "tokL", null);
    assert.deepEqual(late, { ok: false, reason: "slot_taken" });
  });

  it("makes a double confirmation impossible even when a pending row slipped in", async () => {
    const a = await createBooking(db, input(), "tokA", null);
    assert.ok(a.ok);
    await confirmBooking(db, a.booking.id);
    // Simulate the race: a pending row inserted directly on the confirmed slot.
    await db.execute(sql`
      INSERT INTO booking (position_key, slot, pseudo, game_id, alliance, edit_token_hash)
      VALUES ('vp_construction', 10, 'Racer', '100000010', 'XYZ', 'h')
    `);
    const rows = await listAdmin(db);
    const racer = rows.find((r) => r.pseudo === "Racer")!;
    assert.deepEqual(await confirmBooking(db, racer.id), { ok: false, reason: "slot_taken" });
    const confirmed = (await listPublic(db)).filter((r) => r.status === "confirmed");
    assert.equal(confirmed.length, 1);
  });

  it("frees the slot when an admin rejects a confirmed booking; rejected players can rebook", async () => {
    const a = await createBooking(db, input(), "tokA", null);
    const b = await createBooking(db, input({ pseudo: "Bob", gameId: "100000002" }), "tokB", null);
    assert.ok(a.ok && b.ok);
    await confirmBooking(db, a.booking.id); // Bob rejected
    const rebook = await createBooking(db, input({ pseudo: "Bob", gameId: "100000002", slot: 12 }), "tokB2", null);
    assert.ok(rebook.ok);
    assert.equal(await rejectBooking(db, a.booking.id), true);
    const again = await createBooking(db, input({ pseudo: "Dan", gameId: "100000004" }), "tokD", null);
    assert.ok(again.ok);
  });

  it("undoes a wrong decision: reject the winner, restore the loser, confirm again", async () => {
    const a = await createBooking(db, input(), "tokA", null);
    const b = await createBooking(db, input({ pseudo: "Bob", gameId: "100000002" }), "tokB", null);
    assert.ok(a.ok && b.ok);
    await confirmBooking(db, a.booking.id);
    assert.equal(await rejectBooking(db, a.booking.id), true);
    assert.deepEqual(await restoreBooking(db, b.booking.id), { ok: true });
    assert.deepEqual(await confirmBooking(db, b.booking.id), { ok: true, rejected: 0 });
  });

  it("refuses to restore a rejected booking when the player booked again", async () => {
    const a = await createBooking(db, input(), "tokA", null);
    const b = await createBooking(db, input({ pseudo: "Bob", gameId: "100000002" }), "tokB", null);
    assert.ok(a.ok && b.ok);
    await confirmBooking(db, a.booking.id); // Bob rejected
    await createBooking(db, input({ pseudo: "Bob", gameId: "100000002", slot: 12 }), "tokB2", null);
    assert.deepEqual(await restoreBooking(db, b.booking.id), { ok: false, reason: "player_active" });
  });

  it("lets a player withdraw only with the right token", async () => {
    const a = await createBooking(db, input(), "tokA", null);
    assert.ok(a.ok);
    assert.equal(await withdrawBooking(db, a.booking.id, "wrong"), false);
    assert.equal(await withdrawBooking(db, a.booking.id, "tokA"), true);
    assert.equal((await listPublic(db)).length, 0);
  });

  it("confirms only uncontested pending bookings in bulk", async () => {
    await createBooking(db, input({ slot: 1 }), "t1", null);
    await createBooking(db, input({ slot: 2, pseudo: "B", gameId: "100000002" }), "t2", null);
    await createBooking(db, input({ slot: 2, pseudo: "C", gameId: "100000003" }), "t3", null);
    assert.equal(await confirmUncontested(db), 1);
    const rows = await listPublic(db);
    assert.equal(rows.filter((r) => r.status === "confirmed").length, 1);
    assert.equal(rows.filter((r) => r.status === "pending").length, 2);
  });

  it("never exposes game ID or accelerators publicly", async () => {
    await createBooking(db, input(), "tokA", null);
    const [row] = await listPublic(db);
    assert.equal("gameId" in row, false);
    assert.equal("accelerators" in row, false);
    const [adminRow] = await listAdmin(db);
    assert.equal(adminRow.gameId, "100000001");
    assert.equal(adminRow.accelerators, 50);
  });

  it("purges spam and resets the event atomically", async () => {
    const a = await createBooking(db, input(), "tokA", null);
    assert.ok(a.ok);
    assert.equal(await purgeBooking(db, a.booking.id), true);
    await createBooking(db, input(), "tokA", null);
    await createBooking(db, input({ slot: 3, pseudo: "B", gameId: "100000002" }), "t2", null);
    assert.equal(await resetEvent(db, "2026-10-12"), 2);
    assert.equal((await listAdmin(db)).length, 0);
    assert.equal(await getMondayUtc(db), "2026-10-12");
  });

  it("rejects out-of-range slots and unknown positions at the database level", async () => {
    await assert.rejects(() =>
      db.execute(sql`
        INSERT INTO booking (position_key, slot, pseudo, game_id, alliance, edit_token_hash)
        VALUES ('vp_construction', 48, 'X', '1', 'A', 'h')
      `),
    );
    await assert.rejects(() =>
      db.execute(sql`
        INSERT INTO booking (position_key, slot, pseudo, game_id, alliance, edit_token_hash)
        VALUES ('president', 1, 'X', '1', 'A', 'h')
      `),
    );
  });
});
