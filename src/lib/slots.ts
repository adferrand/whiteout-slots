import {
  SLOT_MINUTES,
  SLOTS_PER_DAY,
  type PositionKey,
} from "./config";
import type { PublicBooking } from "./types";

// ---------------------------------------------------------------------------
// Dates. Everything is stored as (UTC date, slot 0..47); instants are derived.
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(iso: string): number {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIsoDate(parseIsoDate(iso) + days * 86_400_000);
}

export function isMonday(iso: string): boolean {
  return new Date(parseIsoDate(iso)).getUTCDay() === 1;
}

/** Next Monday strictly after `from` (UTC). */
export function nextMonday(from: Date = new Date()): string {
  const midnight = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const dow = new Date(midnight).getUTCDay(); // 0 = Sunday
  const delta = ((8 - dow) % 7) || 7;
  return toIsoDate(midnight + delta * 86_400_000);
}

export function slotStartMs(dateUtc: string, slot: number): number {
  return parseIsoDate(dateUtc) + slot * SLOT_MINUTES * 60_000;
}

// ---------------------------------------------------------------------------
// Display. UTC is the working zone, "local" is the browser zone.
// ---------------------------------------------------------------------------

export type TzMode = "utc" | "local";

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const dateKeyFormatters = new Map<string, Intl.DateTimeFormat>();

function cached(
  cache: Map<string, Intl.DateTimeFormat>,
  tz: string | undefined,
  make: () => Intl.DateTimeFormat,
) {
  const key = tz ?? "local";
  let f = cache.get(key);
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
}

export type SlotTime = {
  /** "07:30", 24h, in the display zone. */
  time: string;
  /** Local weekday/date, only when it differs from the UTC date of the slot. */
  dayTag: string | null;
};

export function formatSlotStart(
  dateUtc: string,
  slot: number,
  mode: TzMode,
): SlotTime {
  const ms = slotStartMs(dateUtc, slot);
  const tz = mode === "utc" ? "UTC" : undefined;

  const time = cached(timeFormatters, tz, () =>
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: tz,
    }),
  ).format(ms);

  if (mode === "utc") return { time, dayTag: null };

  const localKey = cached(dateKeyFormatters, tz, () =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: tz,
    }),
  ).format(ms);

  if (localKey === dateUtc) return { time, dayTag: null };

  const dayTag = cached(dayFormatters, tz, () =>
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: tz,
    }),
  ).format(ms);
  return { time, dayTag };
}

export function formatUtcDate(dateUtc: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseIsoDate(dateUtc));
}

export function formatUtcDateShort(dateUtc: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseIsoDate(dateUtc));
}

export function hourLabel(hour: number): string {
  return String(hour).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Slot state, derived from the bookings on the slot (never stored).
// ---------------------------------------------------------------------------

export type SlotState = "free" | "pending" | "contested" | "taken";

export type SlotView<B extends PublicBooking = PublicBooking> = {
  state: SlotState;
  confirmed?: B;
  pending: B[];
  rejected: B[];
};

export function deriveSlot<B extends PublicBooking>(bookings: B[]): SlotView<B> {
  const confirmed = bookings.find((b) => b.status === "confirmed");
  const pending = bookings.filter((b) => b.status === "pending");
  const rejected = bookings.filter((b) => b.status === "rejected");
  if (confirmed) return { state: "taken", confirmed, pending, rejected };
  if (pending.length >= 2) return { state: "contested", pending, rejected };
  if (pending.length === 1) return { state: "pending", pending, rejected };
  return { state: "free", pending, rejected };
}

export function groupBySlot<B extends PublicBooking>(
  bookings: B[],
  positionKey: PositionKey,
): B[][] {
  const slots: B[][] = Array.from({ length: SLOTS_PER_DAY }, () => []);
  for (const b of bookings) {
    if (b.positionKey === positionKey && b.slot >= 0 && b.slot < SLOTS_PER_DAY) {
      slots[b.slot].push(b);
    }
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Longer descriptions, used in dialogs (always explicit about the zone).
// ---------------------------------------------------------------------------

/** "Mon 5 Oct" in the display zone, for the start of the slot. */
export function slotDayLabel(dateUtc: string, slot: number, mode: TzMode): string {
  const tz = mode === "utc" ? "UTC" : undefined;
  return cached(dayFormatters, tz, () =>
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: tz,
    }),
  ).format(slotStartMs(dateUtc, slot));
}

/** "00:30 to 01:00" in the display zone. */
export function slotRange(dateUtc: string, slot: number, mode: TzMode): string {
  const start = formatSlotStart(dateUtc, slot, mode).time;
  const end = formatSlotStart(dateUtc, slot + 1, mode).time;
  return `${start} to ${end}`;
}
