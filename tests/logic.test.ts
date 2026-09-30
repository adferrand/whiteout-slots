import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toCsv, toText } from "../src/lib/export";
import type { ExportRow } from "../src/lib/queries";
import { addDays, deriveSlot, isMonday, nextMonday } from "../src/lib/slots";
import type { PublicBooking } from "../src/lib/types";
import { createBookingSchema, resetSchema, settingsSchema } from "../src/lib/validation";

const b = (id: number, status: PublicBooking["status"]): PublicBooking => ({
  id, positionKey: "vp_research", slot: 3, pseudo: `P${id}`, alliance: "ABC", status,
});

describe("dates", () => {
  it("computes the next Monday strictly after a date", () => {
    assert.equal(nextMonday(new Date("2026-09-30T10:00:00Z")), "2026-10-05"); // Wednesday
    assert.equal(nextMonday(new Date("2026-10-05T00:00:00Z")), "2026-10-12"); // Monday itself
    assert.equal(nextMonday(new Date("2026-10-04T23:59:00Z")), "2026-10-05"); // Sunday
  });
  it("adds days across month ends and recognises Mondays", () => {
    assert.equal(addDays("2026-10-30", 3), "2026-11-02");
    assert.equal(isMonday("2026-10-05"), true);
    assert.equal(isMonday("2026-10-06"), false);
  });
});

describe("slot state derivation", () => {
  it("maps bookings to free, pending, contested, taken", () => {
    assert.equal(deriveSlot([]).state, "free");
    assert.equal(deriveSlot([b(1, "rejected")]).state, "free");
    assert.equal(deriveSlot([b(1, "pending")]).state, "pending");
    assert.equal(deriveSlot([b(1, "pending"), b(2, "pending")]).state, "contested");
    const taken = deriveSlot([b(1, "confirmed"), b(2, "rejected")]);
    assert.equal(taken.state, "taken");
    assert.equal(taken.rejected.length, 1);
  });
});

describe("validation", () => {
  const valid = { positionKey: "vp_research", slot: 3, pseudo: " Alice ", gameId: " 123456789 ", alliance: "ABC", accelerators: 10 };
  it("trims and accepts a valid booking", () => {
    const r = createBookingSchema.parse(valid);
    assert.equal(r.pseudo, "Alice");
    assert.equal(r.gameId, "123456789");
  });
  it("rejects bad ids, slots, positions and negative speedups", () => {
    for (const bad of [
      { ...valid, gameId: "12ab" },
      { ...valid, slot: 48 },
      { ...valid, slot: 1.5 },
      { ...valid, positionKey: "president" },
      { ...valid, accelerators: -1 },
      { ...valid, accelerators: Number.NaN },
      { ...valid, pseudo: "  " },
    ]) {
      assert.equal(createBookingSchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });
  it("requires a Monday and the RESET word", () => {
    assert.equal(settingsSchema.safeParse({ mondayUtc: "2026-10-05" }).success, true);
    assert.equal(settingsSchema.safeParse({ mondayUtc: "2026-10-06" }).success, false);
    assert.equal(resetSchema.safeParse({ mondayUtc: "2026-10-05", confirm: "reset" }).success, false);
    assert.equal(resetSchema.safeParse({ mondayUtc: "2026-10-05", confirm: "RESET" }).success, true);
  });
});

describe("export", () => {
  const rows: ExportRow[] = [
    { positionKey: "ministry_education", slot: 2, pseudo: "Zed", gameId: "111111", alliance: "ZZZ", accelerators: 5, status: "confirmed", createdAt: "2026-10-01T10:00:00.000Z" },
    { positionKey: "vp_construction", slot: 1, pseudo: "=HYPERLINK(\"x\")", gameId: "222222", alliance: "A,B", accelerators: 9, status: "confirmed", createdAt: "2026-10-01T11:00:00.000Z" },
  ];
  it("starts with a BOM, sorts by position then slot, and neutralises formulas", () => {
    const csv = toCsv(rows, "2026-10-05", "schedule");
    assert.equal(csv.charCodeAt(0), 0xfeff);
    const lines = csv.trim().split("\r\n");
    assert.ok(lines[1].startsWith("Vice President,Construction,2026-10-05,2026-10-05T00:30:00.000Z"));
    assert.ok(lines[1].includes("'=HYPERLINK"));
    assert.ok(lines[1].includes('"A,B"'));
    assert.ok(lines[2].startsWith("Minister of Education,Training,2026-10-08,2026-10-08T01:00:00.000Z"));
    assert.equal(lines[0].includes("speedup_days"), false);
  });
  it("adds status and speedups in the full log", () => {
    assert.ok(toCsv(rows, "2026-10-05", "full").split("\r\n")[0].endsWith("status,speedup_days,created_at_utc"));
  });
  it("renders a chat-friendly text schedule with empty positions", () => {
    const text = toText(rows, "2026-10-05");
    assert.ok(text.includes("Vice President (Construction buff) - Monday 2026-10-05 (UTC)"));
    assert.ok(text.includes("00:30  =HYPERLINK"));
    assert.ok(text.includes("(no confirmed booking)")); // Tuesday research
  });
});
