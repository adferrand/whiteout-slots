// The zone must be set before any Intl formatter is created.
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSlotStart, slotDayLabel, slotRange } from "../src/lib/slots";

describe("local time display, Americas (UTC-4 in October)", () => {
  it("keeps the UTC day as anchor and tags the local date when it differs", () => {
    // Monday 5 Oct 00:00 UTC is Sunday evening in New York.
    assert.deepEqual(formatSlotStart("2026-10-05", 0, "local"), { time: "20:00", dayTag: "Sun 4 Oct" });
    assert.deepEqual(formatSlotStart("2026-10-05", 1, "local"), { time: "20:30", dayTag: "Sun 4 Oct" });
    // 04:00 UTC is local midnight, same date as the UTC day: no tag.
    assert.deepEqual(formatSlotStart("2026-10-05", 8, "local"), { time: "00:00", dayTag: null });
  });

  it("never tags in UTC mode", () => {
    assert.deepEqual(formatSlotStart("2026-10-05", 0, "utc"), { time: "00:00", dayTag: null });
  });

  it("describes ranges and days explicitly for dialogs", () => {
    assert.equal(slotRange("2026-10-05", 0, "utc"), "00:00 to 00:30");
    assert.equal(slotRange("2026-10-05", 0, "local"), "20:00 to 20:30");
    assert.equal(slotDayLabel("2026-10-05", 0, "utc"), "Mon 5 Oct");
    assert.equal(slotDayLabel("2026-10-05", 0, "local"), "Sun 4 Oct");
  });

  it("handles the last slot of the day rolling over to the next UTC midnight", () => {
    assert.equal(slotRange("2026-10-05", 47, "utc"), "23:30 to 00:00");
  });
});
