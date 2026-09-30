"use client";

import type { TzMode } from "@/lib/slots";

type Props = {
  mode: TzMode;
  zoneName: string;
  onChange: (mode: TzMode) => void;
};

export function TimezoneToggle({ mode, zoneName, onChange }: Props) {
  return (
    <div className="tz" role="group" aria-label="Time zone used to display slot times">
      <button
        type="button"
        className="tz__option"
        aria-pressed={mode === "utc"}
        onClick={() => onChange("utc")}
      >
        <span className="tz__name">Server time</span>
        <span className="tz__hint">UTC</span>
      </button>
      <button
        type="button"
        className="tz__option"
        aria-pressed={mode === "local"}
        onClick={() => onChange("local")}
      >
        <span className="tz__name">My time</span>
        <span className="tz__hint">{zoneName}</span>
      </button>
    </div>
  );
}
