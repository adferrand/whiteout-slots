process.env.TZ = "Asia/Kathmandu";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSlotStart } from "../src/lib/slots";

describe("local time display, UTC+5:45", () => {
  it("does not assume slots align on local :00 and :30", () => {
    assert.deepEqual(formatSlotStart("2026-10-05", 0, "local"), { time: "05:45", dayTag: null });
    assert.deepEqual(formatSlotStart("2026-10-05", 1, "local"), { time: "06:15", dayTag: null });
  });

  it("tags the next local date late in the UTC day", () => {
    // 23:30 UTC on Monday is 05:15 Tuesday in Kathmandu.
    assert.deepEqual(formatSlotStart("2026-10-05", 47, "local"), { time: "05:15", dayTag: "Tue 6 Oct" });
  });
});
