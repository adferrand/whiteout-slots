// Static configuration of the event. Positions are code, not data:
// only the Monday date changes from one event to the next (see `settings` table).

export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = 48;

export const POSITION_KEYS = [
  "vp_construction",
  "vp_research",
  "ministry_education",
] as const;
export type PositionKey = (typeof POSITION_KEYS)[number];

export type PositionConfig = {
  key: PositionKey;
  title: string;
  buff: string;
  /** Days after the Monday of the event week (Mon = 0). */
  dayOffset: number;
  dayName: string;
  /** Kind of speedups the admin compares when solving a conflict. */
  speedupKind: string;
};

export const POSITIONS: readonly PositionConfig[] = [
  {
    key: "vp_construction",
    title: "Vice President",
    buff: "Construction",
    dayOffset: 0,
    dayName: "Monday",
    speedupKind: "construction",
  },
  {
    key: "vp_research",
    title: "Vice President",
    buff: "Research",
    dayOffset: 1,
    dayName: "Tuesday",
    speedupKind: "research",
  },
  {
    key: "ministry_education",
    title: "Minister of Education",
    buff: "Training",
    dayOffset: 3,
    dayName: "Thursday",
    speedupKind: "training",
  },
] as const;

export function getPosition(key: string): PositionConfig | undefined {
  return POSITIONS.find((p) => p.key === key);
}

/** In-game player IDs are numeric. Adjust the bounds if real IDs fall outside. */
export const GAME_ID_REGEX = /^\d{6,12}$/;

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "rejected",
  "withdrawn",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Max booking creations per IP hash in a 10 minute window. */
export const RATE_LIMIT_PER_10_MIN = 10;
