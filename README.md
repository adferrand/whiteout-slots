# Whiteout Survival: minister slot booking

Players request 30-minute slots for three minister positions during the SvS
preparation week. Admins resolve conflicts, confirm bookings, export the result
and reset the site for the next event.

| Day | Position | Buff |
|---|---|---|
| Monday | Vice President | Construction |
| Tuesday | Vice President | Research |
| Thursday | Minister of Education | Training |

Each day has 48 slots (00:00 UTC to 00:00 UTC next day). UTC is the working zone;
a toggle displays every time in the visitor's own zone.

## Stack

Next.js (App Router) on Vercel, Postgres on Neon (Vercel Marketplace, free plan),
Drizzle ORM for schema and migrations, SWR for polling, `jose` for the admin session.

## Deploy on Vercel

1. Push this folder to a Git repository and import it in Vercel.
2. In the Vercel project: Storage, Marketplace, Neon, then connect it to the project.
   Vercel injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. Add environment variables: `ADMIN_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 32`),
   and optionally `NEXT_PUBLIC_SERVER_NUMBER` (default 1460).
4. Deploy. The `vercel-build` script applies the migrations, then builds.
5. Open `/admin/login`, log in, and set the event week (the Monday, UTC).

Preview deployments also run the migrations against whatever database their
environment points to. Scope the Neon variables to Production only if you want
previews to stay away from it.

## Local development

```bash
npm install
cp .env.example .env.local        # or: vercel env pull .env.local
npm run db:migrate                # needs DATABASE_URL(_UNPOOLED) in the environment
npm run dev
```

`db:migrate` does not read `.env.local` by itself:
`set -a; . ./.env.local; set +a; npm run db:migrate`.

## Tests

```bash
npm test
```

Runs the SQL invariants against PGlite (Postgres compiled to WASM) using the same
migration file and the same query functions as the API, plus time zone, validation
and export tests. Nothing to install or configure.

## Reusing the site for the next event

Admin view, Export, then Reset event. Reset is unlocked once an export has been
downloaded in the session, asks for the new Monday and for the word `RESET`, and
deletes all bookings and sets the new week in a single statement.

## Design decisions worth knowing

**One confirmed booking per slot is enforced by the database**, through a partial
unique index. Conflict resolution is a single atomic statement: the winner becomes
`confirmed` and every other `pending` booking on that slot becomes `rejected`.

**One active booking per player per position**: partial unique index on
`(position, game_id)` for `pending` and `confirmed`. Rejected and withdrawn bookings
do not count, so rejected players can rebook immediately.

**Statuses**: `pending`, `confirmed`, `rejected` (stays visible, struck through),
`withdrawn` (player cancelled, hidden). Admins can reject, restore a rejected booking
to pending (undo a wrong decision) and delete permanently (spam).

**Admin registration**: in the admin view, open any slot and use "Register a player on this
slot" (players who asked outside the site, or late). The player is created as `confirmed`
and every pending request on the slot is rejected, in one statement. It is refused when the
slot already has a confirmed booking (reject that one first) or when the game ID already has
an active booking for the position (confirm or delete that one instead). These bookings are
tagged "Registered by admin" and flagged in the full-log export. Nobody holds their edit
token, so only an admin can remove them.

**Day colours**: each day has its own colour (Monday teal, Tuesday violet, Thursday magenta),
kept distinct from the status colours. It appears as a bar on the tab, as the border and
heading of the panel that holds the slots, and as the top edge of the booking dialogs, so a
slot always visibly belongs to the day selected above it.

**Nothing confirms itself.** The admin view offers "Confirm N uncontested" to confirm
every pending booking that is alone on a free slot.

**Admin-only data** (`game_id`, speedup days) never appears in public responses: the
public queries list their columns explicitly and the tests assert it.

**Withdrawal without accounts**: the browser receives a random edit token when a
booking is created; only its hash is stored. Losing it (other device, cleared storage)
means an admin removes the booking.

**Positions are code** (`src/lib/config.ts`), not a table. Only the Monday date is data.

**No Next.js middleware**: `/admin` checks the session in the server component and every
admin API handler checks it again, plus a same-origin check and `SameSite=Strict`.
Changing `ADMIN_PASSWORD` invalidates existing admin sessions.

**Rate limiting** is per hashed IP, counted in the database (10 bookings per 10 minutes),
so it works across serverless instances. Players sharing one network share the budget.

**Polling with a short CDN cache**: the public overview is cached 5 s at the edge, and a
client bypasses the cache right after its own write.

## Known limits

- The "export before reset" lock is a client-side guard, not a server rule.
- One shared admin password, no per-admin audit trail.
- Game ID format (numeric, 6 to 12 digits) is an assumption: adjust `GAME_ID_REGEX`
  in `src/lib/config.ts` if real IDs differ.
- Speedups are entered in days.
