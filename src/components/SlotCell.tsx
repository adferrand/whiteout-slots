"use client";

import { formatSlotStart, type SlotView, type TzMode } from "@/lib/slots";
import type { PublicBooking } from "@/lib/types";

type Props = {
  dateUtc: string;
  slot: number;
  view: SlotView<PublicBooking>;
  mode: TzMode;
  admin: boolean;
  mine: boolean;
  onOpen: (slot: number) => void;
};

const STATE_LABEL = {
  free: "Free",
  pending: "Pending",
  contested: "Contested",
  taken: "Taken",
} as const;

function who(b: PublicBooking) {
  return `${b.pseudo} [${b.alliance}]`;
}

export function SlotCell({ dateUtc, slot, view, mode, admin, mine, onOpen }: Props) {
  const { time, dayTag } = formatSlotStart(dateUtc, slot, mode);
  const zone = mode === "utc" ? "UTC" : "local time";

  let main: string;
  let extra: string | null = null;
  switch (view.state) {
    case "taken":
      main = who(view.confirmed!);
      break;
    case "pending":
      main = who(view.pending[0]);
      break;
    case "contested":
      main = who(view.pending[0]);
      extra = `+${view.pending.length - 1} more`;
      break;
    default:
      main = admin ? "No request" : "Free";
  }

  const label = [
    `${time}${dayTag ? `, ${dayTag}` : ""} ${zone}`,
    STATE_LABEL[view.state],
    view.state === "free" ? "" : view.state === "taken" ? who(view.confirmed!) : view.pending.map(who).join(", "),
    mine ? "includes your booking" : "",
    admin ? "open to manage" : view.state === "taken" ? "open details" : "open to book",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <button
      type="button"
      className={`cell cell--${view.state}${mine ? " cell--mine" : ""}`}
      onClick={() => onOpen(slot)}
      aria-label={label}
    >
      <span className="cell__time">
        {time}
        {dayTag && <span className="cell__day">{dayTag}</span>}
      </span>
      <span className="cell__main">{main}</span>
      {extra && <span className="cell__extra">{extra}</span>}
      {view.rejected.length > 0 && (
        <span className="cell__rejected">
          {view.rejected.slice(0, 2).map((b) => (
            <s key={b.id}>{b.pseudo}</s>
          ))}
          {view.rejected.length > 2 && <span>+{view.rejected.length - 2}</span>}
        </span>
      )}
      {mine && <span className="cell__you">You</span>}
    </button>
  );
}
