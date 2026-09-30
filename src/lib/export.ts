import { POSITIONS, SLOT_MINUTES, getPosition } from "./config";
import type { ExportRow } from "./queries";
import { addDays, slotStartMs } from "./slots";

// User-controlled text ends up in spreadsheets: neutralise formula injection.
function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sortRows(rows: ExportRow[]): ExportRow[] {
  const order = new Map<string, number>(POSITIONS.map((p, i) => [p.key, i]));
  return [...rows].sort(
    (a, b) =>
      (order.get(a.positionKey) ?? 99) - (order.get(b.positionKey) ?? 99) ||
      a.slot - b.slot,
  );
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function toCsv(
  rows: ExportRow[],
  mondayUtc: string,
  scope: "schedule" | "full",
): string {
  const header = [
    "position",
    "buff",
    "date_utc",
    "start_utc",
    "end_utc",
    "pseudo",
    "game_id",
    "alliance",
    ...(scope === "full" ? ["status", "speedup_days", "created_at_utc"] : []),
  ];
  const lines = [header.join(",")];
  for (const r of sortRows(rows)) {
    const p = getPosition(r.positionKey);
    const date = addDays(mondayUtc, p?.dayOffset ?? 0);
    const start = slotStartMs(date, r.slot);
    const cells: (string | number)[] = [
      p?.title ?? r.positionKey,
      p?.buff ?? "",
      date,
      iso(start),
      iso(start + SLOT_MINUTES * 60_000),
      r.pseudo,
      r.gameId,
      r.alliance,
    ];
    if (scope === "full") cells.push(r.status, r.accelerators, r.createdAt);
    lines.push(cells.map(csvCell).join(","));
  }
  // BOM so that Excel reads UTF-8 (accents, emoji in pseudos) correctly.
  return "\ufeff" + lines.join("\r\n") + "\r\n";
}

/** Plain text schedule, ready to paste into Discord or the in-game chat. */
export function toText(rows: ExportRow[], mondayUtc: string): string {
  const sorted = sortRows(rows);
  const blocks: string[] = [];
  for (const p of POSITIONS) {
    const date = addDays(mondayUtc, p.dayOffset);
    const lines = [`${p.title} (${p.buff} buff) - ${p.dayName} ${date} (UTC)`];
    const mine = sorted.filter((r) => r.positionKey === p.key);
    if (mine.length === 0) lines.push("(no confirmed booking)");
    for (const r of mine) {
      const t = new Date(slotStartMs(date, r.slot)).toISOString().slice(11, 16);
      lines.push(`${t}  ${r.pseudo} [${r.alliance}]`);
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n") + "\n";
}
