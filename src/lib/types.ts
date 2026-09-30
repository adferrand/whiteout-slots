import type { PositionKey } from "./config";

export type PublicStatus = "pending" | "confirmed" | "rejected";

/** What every visitor may see. No game ID, no accelerators. */
export type PublicBooking = {
  id: number;
  positionKey: PositionKey;
  slot: number;
  pseudo: string;
  alliance: string;
  status: PublicStatus;
};

/** Admin-only extension. */
export type AdminBooking = PublicBooking & {
  gameId: string;
  accelerators: number;
  createdAt: string;
};

export type Overview<B extends PublicBooking = PublicBooking> = {
  mondayUtc: string;
  bookings: B[];
};

export type ApiErrorBody = { error: { code: string; message: string } };
