import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Single-row table: the Monday (UTC) of the event week. */
export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey().default(1),
    mondayUtc: date("monday_utc", { mode: "string" }).notNull(),
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`)],
);

export const booking = pgTable(
  "booking",
  {
    id: serial("id").primaryKey(),
    positionKey: text("position_key").notNull(),
    slot: smallint("slot").notNull(),
    pseudo: text("pseudo").notNull(),
    gameId: text("game_id").notNull(),
    alliance: text("alliance").notNull(),
    /** Admin-only. Never returned by public endpoints. */
    accelerators: integer("accelerators").notNull().default(0),
    status: text("status").notNull().default("pending"),
    /** sha256 of the secret the booking browser holds; allows self-withdrawal. */
    editTokenHash: text("edit_token_hash").notNull(),
    ipHash: text("ip_hash"),
    /** True when an admin registered the player (out-of-circuit or late request). */
    createdByAdmin: boolean("created_by_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    check("booking_slot_range", sql`${t.slot} BETWEEN 0 AND 47`),
    check(
      "booking_status_values",
      sql`${t.status} IN ('pending','confirmed','rejected','withdrawn')`,
    ),
    check(
      "booking_position_values",
      sql`${t.positionKey} IN ('vp_construction','vp_research','ministry_education')`,
    ),
    // The invariant: at most one confirmed booking per slot, even under races.
    uniqueIndex("booking_one_confirmed_per_slot")
      .on(t.positionKey, t.slot)
      .where(sql`${t.status} = 'confirmed'`),
    // One active (pending or confirmed) booking per player per position.
    uniqueIndex("booking_one_active_per_player")
      .on(t.positionKey, t.gameId)
      .where(sql`${t.status} IN ('pending','confirmed')`),
    index("booking_slot_idx").on(t.positionKey, t.slot),
    index("booking_ip_created_idx").on(t.ipHash, t.createdAt),
  ],
);

export type BookingRow = typeof booking.$inferSelect;
