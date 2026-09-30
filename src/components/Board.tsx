"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { POSITIONS, SLOTS_PER_DAY, type PositionKey } from "@/lib/config";
import { api, ApiError } from "@/lib/client";
import {
  addDays,
  browserTimeZone,
  deriveSlot,
  formatUtcDate,
  formatUtcDateShort,
  groupBySlot,
  hourLabel,
  slotRange,
  type TzMode,
} from "@/lib/slots";
import { storage, type Profile } from "@/lib/storage";
import type { AdminBooking, Overview, PublicBooking } from "@/lib/types";
import { AdminDialog } from "./AdminDialog";
import { AdminToolbar } from "./AdminToolbar";
import { BookingDialog } from "./BookingDialog";
import { SlotCell } from "./SlotCell";
import { TimezoneToggle } from "./TimezoneToggle";

type AnyOverview = Overview<PublicBooking | AdminBooking>;

const SERVER_NUMBER = process.env.NEXT_PUBLIC_SERVER_NUMBER ?? "1460";
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function Board({ mode }: { mode: "public" | "admin" }) {
  const admin = mode === "admin";

  const [tz, setTz] = useState<TzMode>("utc");
  const [zoneName, setZoneName] = useState("local time");
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [positionKey, setPositionKey] = useState<PositionKey>(POSITIONS[0].key);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Browser-only state is read after mount, so the first render matches the server's.
  useEffect(() => {
    setTz(storage.getTz());
    setZoneName(browserTimeZone());
    setTokens(storage.getTokens());
    const saved = storage.getPosition();
    const match = POSITIONS.find((p) => p.key === saved);
    if (match) setPositionKey(match.key);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  const url = admin ? "/api/admin/overview" : "/api/overview";
  const { data, error, mutate } = useSWR<AnyOverview>(url, (u: string) => api<AnyOverview>(u), {
    refreshInterval: 10_000,
    keepPreviousData: true,
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) window.location.href = "/admin/login";
    },
  });

  /** After our own write, skip the CDN cache of the public overview. */
  const refresh = useCallback(async () => {
    try {
      if (admin) await mutate();
      else await mutate(api<AnyOverview>(`/api/overview?fresh=${Date.now()}`), { revalidate: false });
    } catch {
      /* the next poll will retry */
    }
  }, [admin, mutate]);

  const position = POSITIONS.find((p) => p.key === positionKey)!;
  const dateUtc = data ? addDays(data.mondayUtc, position.dayOffset) : null;

  const views = useMemo(() => {
    if (!data) return null;
    return groupBySlot(data.bookings, positionKey).map((list) => ({ list, view: deriveSlot(list) }));
  }, [data, positionKey]);

  const counts = useMemo(() => {
    const c = { free: 0, pending: 0, contested: 0, taken: 0 };
    views?.forEach(({ view }) => (c[view.state] += 1));
    return c;
  }, [views]);

  const uncontested = useMemo(() => {
    if (!data || !admin) return 0;
    let n = 0;
    for (const p of POSITIONS) {
      for (const list of groupBySlot(data.bookings, p.key)) {
        if (deriveSlot(list).state === "pending") n += 1;
      }
    }
    return n;
  }, [data, admin]);

  const myActive = data?.bookings.find(
    (b) =>
      b.positionKey === positionKey &&
      (b.status === "pending" || b.status === "confirmed") &&
      tokens[String(b.id)],
  );

  function chooseTz(next: TzMode) {
    setTz(next);
    storage.setTz(next);
  }

  function choosePosition(key: PositionKey) {
    setPositionKey(key);
    setSelectedSlot(null);
    storage.setPosition(key);
  }

  function handleBooked(b: PublicBooking, token: string, profile: Profile) {
    const next = { ...tokens, [String(b.id)]: token };
    setTokens(next);
    storage.setTokens(next);
    storage.setProfile(profile);
    if (dateUtc) {
      setNotice(
        `Request sent for ${slotRange(dateUtc, b.slot, tz)} ${tz === "utc" ? "UTC" : `(${zoneName})`}. It stays pending until an admin confirms it.`,
      );
    }
    void refresh();
  }

  function handleWithdrawn(id: number) {
    const next = { ...tokens };
    delete next[String(id)];
    setTokens(next);
    storage.setTokens(next);
    setNotice("Request withdrawn.");
    void refresh();
  }

  function handleAdminChanged(message?: string) {
    if (message) setNotice(message);
    void refresh();
  }

  const selected = selectedSlot !== null && views && dateUtc ? views[selectedSlot] : null;

  return (
    <div className="board">
      <header className="masthead">
        <h1 className="masthead__title">Minister appointments</h1>
        <p className="masthead__sub">
          Server {SERVER_NUMBER}, SvS preparation
          {data ? `, week of ${formatUtcDate(data.mondayUtc)}` : ""}
          {admin ? ". Admin view." : "."}
        </p>
      </header>

      {admin && data && (
        <AdminToolbar
          key={data.mondayUtc}
          mondayUtc={data.mondayUtc}
          totalBookings={data.bookings.length}
          uncontested={uncontested}
          onChanged={handleAdminChanged}
        />
      )}

      <div className="controls">
        <div className="tabs" role="tablist" aria-label="Minister position">
          {POSITIONS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={p.key === positionKey}
              data-day={p.key}
              className="tab"
              onClick={() => choosePosition(p.key)}
            >
              <span className="tab__day">
                {p.dayName}
                {data && ` ${formatUtcDateShort(addDays(data.mondayUtc, p.dayOffset))}`}
              </span>
              <span className="tab__role">{p.title}</span>
              <span className="tab__buff">{p.buff} buff</span>
            </button>
          ))}
        </div>
        <TimezoneToggle mode={tz} zoneName={zoneName} onChange={chooseTz} />
      </div>

      <div className="legend" aria-label="Legend">
        <span className="legend__item"><i className="swatch swatch--free" />Free</span>
        <span className="legend__item"><i className="swatch swatch--pending" />Pending, one request</span>
        <span className="legend__item"><i className="swatch swatch--contested" />Contested, several requests</span>
        <span className="legend__item"><i className="swatch swatch--taken" />Taken, confirmed</span>
        <span className="legend__item"><s>Name</s>Rejected</span>
      </div>

      <p className="summary">
        {data
          ? `${counts.free} free, ${counts.pending} pending, ${counts.contested} contested, ${counts.taken} taken. Big numbers are UTC hours; each slot shows its start time in ${tz === "utc" ? "UTC" : "your time"}.`
          : "Loading slots."}
      </p>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {error && !data && (
        <p className="error" role="alert">
          Could not load the bookings. Retrying automatically.
        </p>
      )}

      {views && dateUtc && (
        <div
          className="panel"
          data-day={position.key}
          role="tabpanel"
          aria-label={`${position.title}, ${position.buff} buff`}
        >
          <header className="panel__head">
            <h2 className="panel__day">{formatUtcDate(dateUtc).replace(/ \d{4}$/, "")}</h2>
            <p className="panel__role">
              {position.title}, {position.buff} buff
            </p>
          </header>
          <div className="ladder">
          {[0, 12].map((start) => (
            <section key={start} className="ladder__col">
              <h2 className="sr-only">
                UTC hours {hourLabel(start)} to {hourLabel(start + 11)}
              </h2>
              {HOURS.slice(start, start + 12).map((h) => (
                <div key={h} className="ladder__row">
                  <div className="ladder__hour" aria-hidden="true">{hourLabel(h)}</div>
                  {[h * 2, h * 2 + 1].map((slot) => {
                    const { list, view } = views[slot];
                    return (
                      <SlotCell
                        key={slot}
                        dateUtc={dateUtc}
                        slot={slot}
                        view={view}
                        mode={tz}
                        admin={admin}
                        mine={list.some((b) => tokens[String(b.id)] !== undefined)}
                        onOpen={setSelectedSlot}
                      />
                    );
                  })}
                </div>
              ))}
            </section>
          ))}
          </div>
        </div>
      )}

      {selected && dateUtc && selectedSlot !== null && selectedSlot < SLOTS_PER_DAY &&
        (admin ? (
          <AdminDialog
            open
            onClose={() => setSelectedSlot(null)}
            position={position}
            dateUtc={dateUtc}
            slot={selectedSlot}
            slotBookings={selected.list as AdminBooking[]}
            tz={tz}
            zoneName={zoneName}
            onChanged={handleAdminChanged}
          />
        ) : (
          <BookingDialog
            open
            onClose={() => setSelectedSlot(null)}
            position={position}
            dateUtc={dateUtc}
            slot={selectedSlot}
            slotBookings={selected.list}
            myActive={myActive}
            tokens={tokens}
            zoneName={zoneName}
            onBooked={handleBooked}
            onWithdrawn={handleWithdrawn}
          />
        ))}
    </div>
  );
}
