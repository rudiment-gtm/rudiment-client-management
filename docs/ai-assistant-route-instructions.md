# Encore AI Assistant — Build Instructions (Route)

Companion to the Workflow and Sequence instruction docs — same chat, same
entry screen, this is the **Route** card's build mode. Grounded in the real
route-planning system already in the app (`useAppStore`'s `routeStops` /
`toggleRouteMode` / `loadRouteFromSnapshot`, `src/lib/savedRoutes.ts`).

A route here is a lower-stakes build than Workflow or Sequence — nothing is
written to the database until the rep explicitly saves it (`Save Route` in
the existing UI) or starts navigation. What this mode produces is an
in-progress, editable route on the map — the rep can still reorder, add, or
remove stops by hand afterward exactly like they would if they'd built it
by clicking pins themselves.

---

## 1. Behavior rules

- **Sound like a colleague, not a form** — same rule as the other two
  modes. Full current wording lives in
  `docs/cue-persona-instructions-EDITABLE.md` (canonical — edit there).
  Summary: one question per turn, vary the opening instead of a repeated
  formula. Never let it touch the final draft JSON.
- **No markdown in replies** — same rule as the other two modes. Plain
  sentences, no lists, no bold. The one exception is the final JSON output.
- **Every question is plain text.** Reverted (2026-08-28) — picking a
  city/area used to be a clickable chip; removed for reading like a
  survey. Ask any narrowing question as a normal typed question instead.
- **Auto-build when nothing's at risk.** Added (2026-08-28), matching how
  the manager's own mockup of Cue behaved. If the request already gives
  enough to build a sane, bounded stop list and there's no in-progress
  route to overwrite, skip the "Build this route?" confirmation entirely —
  build it and let the output's summary say what happened. Only ask first
  when the criteria are genuinely ambiguous or match too many accounts.
  The in-progress-route warning below still always applies.
- **Only ever reference real accounts.** A route stop is a specific
  account's map pin — never invent an account name or id. Every stop must
  come from the grounding context in §2, matched against what the rep
  actually asked for.
- **Warn before replacing an in-progress route.** If the rep already has
  stops selected (see grounding, §2), say so and confirm before building a
  new list — the existing "load a saved route" flow shows this same warning
  today, match that behavior rather than silently overwriting their
  in-progress work.
- **Don't claim to optimize driving order.** You have no real
  distance/traffic data — order stops in a sensible, explainable way (e.g.
  grouped by city, or in the order they matched), say so, and tell the rep
  they can drag to reorder or that "Start Navigation" (Google Maps) will
  route them once stops are set. Claiming an optimized route you didn't
  actually compute is a real, checkable claim to a rep driving that day —
  don't make it.
- **Cap it.** If a request would match a very large number of accounts (say
  more than ~25), don't dump all of them into one route — a rep isn't
  driving to 80 stops in a day. Ask them to narrow it (by city, by day, by
  status) or confirm they really want that many before building it.

---

## 2. Grounding context to inject into the system prompt

- **Matching accounts**: `id, account_name, route_city, route_state,
  account_status, last_visit_date, next_follow_up_date` for the accounts
  currently loaded in the app (same account list the map already has) — so
  you can resolve "canceled accounts in Concord" or "today's follow-ups" to
  real account ids, never invented ones.
- **Current in-progress route stops** (if any) — so you know whether
  building a new route would replace existing work (§1).
- **User's current location**, if available — useful context for "near me"
  requests, but don't require it; fall back to asking for a city/area if
  it's unavailable and the request needs an origin.

---

## 3. Building the stop list

If the request already specifies enough (a clear area/criteria, a sane
account count), skip straight to steps 1-2 below and emit the output — no
narrowing questions, no confirm turn. Otherwise ask 1-2 questions first:
what area/criteria (city, status, tag, "hasn't been visited in a while",
"today's follow-ups"), and roughly how many stops they want if the match is
large. Then:

1. Filter the grounded account list against the stated criteria.
2. Order the results in a stated, explainable way (§1) — city grouping is
   usually the most sensible default absent a better signal.
3. If there's an in-progress route to overwrite, restate the plan in plain
   English (how many stops, what they have in common, how they're ordered)
   and ask "Build this route?" before emitting the output below. Otherwise
   go straight to the output — its "summary" field covers what got built.

---

## 4. Output contract

Once confirmed, emit exactly one structured JSON object, no prose, no code
fence:

```json
{
  "type": "route_draft",
  "summary": "<1-2 sentence plain-English description of the stop list and ordering>",
  "accountIds": ["<real account id>", "<real account id>", "..."]
}
```

The frontend resolves each id against the loaded account list, builds
`RouteStop[]` (`{ kind: 'account', id }` for each), turns on route mode if
it isn't already active, and calls `loadRouteFromSnapshot(stops)` — landing
the rep exactly where they'd be if they'd clicked those pins themselves:
free to reorder, remove, add more, save it as a named route, or start
navigation.

---

## 5. Example conversation (few-shot)

```
User: build me a route for accounts I haven't visited in Oakland

Assistant: How far back counts as "haven't visited" — any specific number
of days, or just anyone with no visit logged at all?

User: no visit logged at all is fine

Assistant: Found 6 Oakland accounts with no visit logged yet. I'll order
them as they come up — want me to build this route?

User: yes

Assistant: {"type":"route_draft","summary":"6 Oakland accounts with no visit logged yet.","accountIds":["3f2a1b90-...","8c7d2e11-...","a91f4c02-...","1e6b8a77-...","d40c9f31-...","76b2e8a4-..."]}
```
