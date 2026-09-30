import { z } from "zod";
import { GAME_ID_REGEX, POSITION_KEYS, SLOTS_PER_DAY } from "./config";
import { isMonday } from "./slots";

const noControlChars = /^[^\p{Cc}]+$/u;

export const createBookingSchema = z.object({
  positionKey: z.enum(POSITION_KEYS),
  slot: z
    .number("Invalid slot.")
    .int("Invalid slot.")
    .min(0, "Invalid slot.")
    .max(SLOTS_PER_DAY - 1, "Invalid slot."),
  pseudo: z
    .string()
    .trim()
    .min(1, "Enter your in-game name.")
    .max(32, "In-game name is too long (32 characters max).")
    .regex(noControlChars, "In-game name contains invalid characters."),
  gameId: z
    .string()
    .trim()
    .regex(GAME_ID_REGEX, "Game ID must be numeric (6 to 12 digits)."),
  alliance: z
    .string()
    .trim()
    .min(1, "Enter your alliance.")
    .max(32, "Alliance is too long (32 characters max).")
    .regex(noControlChars, "Alliance contains invalid characters."),
  accelerators: z
    .number("Enter a number of speedup days.")
    .int("Speedup days must be a whole number.")
    .min(0, "Speedup days cannot be negative.")
    .max(100_000, "That number of speedup days looks wrong."),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

const mondaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date.")
  .refine(isMonday, "The event week must start on a Monday (UTC).");

export const settingsSchema = z.object({ mondayUtc: mondaySchema });

export const resetSchema = z.object({
  mondayUtc: mondaySchema,
  confirm: z.literal("RESET", "Type RESET to confirm."),
});

export const adminActionSchema = z.object({
  action: z.enum(["confirm", "reject", "restore"]),
});

export const loginSchema = z.object({ password: z.string().min(1).max(200) });

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request.";
}
