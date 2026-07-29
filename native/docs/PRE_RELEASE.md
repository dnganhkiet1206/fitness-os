# Pre-release checklist — things that are fine in test and wrong in production

Written 2026-07-29 from a read of the real configuration, not from memory.
Every claim below has a file and a line so the next person can re-check it
in a minute rather than re-derive it in an hour.

**Status, 2026-07-29 — the code fixes are written; none of them are live.**
§1, §2a, §2b, §2c, §2d and §2e have landed on this branch and are marked
FIXED below. They change nothing in production until the functions are
deployed and the migration applied — see "Deploying the fixes" at the end,
which is the part that still needs doing. §3, §4 and §5 are untouched and
need the user's decision first (rule 12 of the mascot hand-off applies to
the whole branch).

---

## 0. What the backend actually is

Both the AI and the database belong to **Lovable**, and it is worth
knowing which is which before touching either.

| Piece | Where it lives | Evidence |
| --- | --- | --- |
| Supabase project `drqgonxrtmomgrftelih` | created by Lovable, shared by the web app and the native app | `supabase/config.toml:1`; `native/src/integrations/supabase/client.ts:8`; root `.env` |
| 17 migrations named `<timestamp>_<uuid>.sql` | written by Lovable | `supabase/migrations/` |
| The AI | **not** OpenAI or Anthropic — every call goes to Lovable's gateway | `https://ai.gateway.lovable.dev/v1/chat/completions` in all five functions |
| The model behind the gateway | `google/gemini-3-flash-preview`, and `google/gemini-2.5-flash` for vision | `ai-coach:138`, `ai-meal-suggest:77`, `ai-smart-nudges:83`, `ai-weekly-review:79`, `scan-food:122` |
| The credential | `LOVABLE_API_KEY` only — there is no `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` anywhere in the repo | `Deno.env.get("LOVABLE_API_KEY")` at line 13 of each function (49 in `scan-food`) |

So **AI usage is billed as Lovable credits.** The functions already know
this: they translate the gateway's 402 into "Hết credits AI. Vui lòng nạp
thêm." (`ai-coach/index.ts:155`). If the app ever leaves Lovable, five
functions need a new provider and a new key, and nothing else does.

---

## 1. The auth gate on the five AI functions is weaker than it looks — FIXED

**Severity: this one costs money.** Fixed in code; not live until deployed.

Line numbers in this section describe the code **as it was**, so the
reasoning can still be followed against `git show HEAD~1`.

`supabase/config.toml` sets `verify_jwt = false` for all five functions, so
the platform does not check the caller. That by itself is fine — Lovable's
pattern is to check inside the function instead, and each function does:

```ts
const token = authHeader.replace("Bearer ", "");
const { data: claimsData, error: authErr } = await supabase.auth.getClaims(token);
if (authErr || !claimsData?.claims) return 401;
const userId = claimsData.claims.sub;
```

(`ai-coach:31`, `ai-meal-suggest:30`, `ai-smart-nudges:30`,
`ai-weekly-review:30`, `scan-food:32`.)

The gate asks only *"is this a validly-signed token for this project?"* —
and **the publishable anon key is exactly that.** It is a project-signed
JWT whose claims are `{iss, ref, role: "anon", iat, exp}`. `getClaims`
verifies it, returns those claims, and the check passes. There is no
`sub` in an anon key, so `userId` becomes `undefined`.

What happens next is the problem. Every function reads its context and
then calls the gateway **with no early return in between** — in `ai-coach`
the queries are lines 46–52, the profile is allowed to be `null` at line
61, and the gateway call is line 131. The user queries come back empty
(`.eq("user_id", undefined)`), so no data leaks; the AI request goes out
anyway. Anyone holding the anon key can spend Lovable credits.

And the anon key is public by design: it ships in the app binary and it is
hard-coded as the fallback at `native/src/integrations/supabase/client.ts:11`.

### What was done

The gate now lives in one place — `supabase/functions/_shared/guard.ts` —
and asks the two further questions:

```ts
if (error || !claims?.sub || claims.role !== "authenticated") {
  return json({ error: "Unauthorized" }, 401);
}
```

`sub` is what an anon key lacks; `role` is what separates a user token from
a project one. All five functions now open with the same three lines:

```ts
const caller = await requireUser(req);
if (caller instanceof Response) return caller;
const { userId, supabase } = caller;
```

Two notes on what did *not* change, and why:

- **`verify_jwt = false` stays.** The functions read the header themselves
  so they can forward the caller's token to PostgREST and keep RLS in
  force inside the function. Turning the platform gate on would duplicate
  `requireUser`, not replace it. The client is still built on the anon key
  with the caller's token attached — never `service_role`.
- **`Access-Control-Allow-Origin: "*"` stays**, for now. The native app
  does not use CORS at all and the web app is dead, so there is no correct
  origin to name yet. Narrow it when the web app's fate is decided; until
  then the auth gate is what stands between a hostile page and the
  gateway. Worth revisiting, not urgent.

---

## 2. Nothing caps what the AI functions can spend — FIXED

**Severity: this is the one that can produce a bill overnight.** §1 was the
open door; this is what was behind it. All five parts are fixed in code and
none are live until deployed. Line numbers describe the code as it was.

### 2a. No output cap anywhere

Not one of the five gateway calls sets `max_tokens` or
`max_completion_tokens` — grep the whole `supabase/functions` tree and the
count is zero. Every request is free to generate until the model stops on
its own. `ai-coach` additionally sets `stream: true` (`ai-coach:143`) and
returns `response.body` untouched (`ai-coach:166`), so it streams whatever
comes.

**Fixed.** Each function declares its own `MAX_TOKENS` next to the reason
for it and passes it to the gateway: 1024 for the chat, 1500 for the food
scan's JSON, 1200 for the weekly review, 900 for meal suggestions, 700 for
the nudges. Sized to what each reply actually is, so a ceiling being hit
means something has gone wrong rather than a user being cut off.

### 2b. `ai-coach` is an open general-purpose LLM proxy

The client's message array is forwarded to Gemini **verbatim**:

```ts
const { messages, lang = "vi" } = await req.json();   // ai-coach:40
...
messages: [ { role: "system", content: systemPrompt }, ...messages ],   // :140-142
```

Nothing validates it. Not the number of messages, not the size of any
message, not even the `role` field. Put together with §1 — where the
public anon key satisfies the gate — this endpoint is a **free Gemini
proxy that bills to this project's Lovable credits**, and it will answer
about anything, not just fitness. A caller can also inject their own
`{ role: "system", ... }` after ours, so the medical-safety rules written
at `ai-coach:122-129` (never diagnose, never give medical advice) are not
enforced against a crafted client. That is a liability question as much
as a cost one.

**Fixed.** `sanitize()` in `ai-coach/index.ts` is now the only way a client
message reaches the gateway. It keeps the last `MAX_MESSAGES` (20) turns,
truncates each to `MAX_CHARS` (4000), and drops anything whose role is not
`user` or `assistant` — so an injected second `system` message no longer
exists by the time the array is spread. An empty result is a 400 rather
than a request. `lang` is narrowed to `"en" | "vi"` in the same pass.

### 2c. The chat resends its whole history every turn

`ai-coach.tsx:121` builds `newMessages = [...messages, userMsg]` and
`:160` sends all of it. `loadConversation` (`:92-100`) reads the entire
stored conversation with **no `limit`**. So turn *n* pays for all *n*
turns, and the cost of one long conversation grows with the square of its
length.

**Fixed.** `SEND_WINDOW = 20` in `ai-coach.tsx`: the request now sends
`newMessages.slice(-SEND_WINDOW)`. `loadConversation` takes
`HISTORY_LIMIT = 60` newest-first and reverses, so opening an old
conversation no longer drags all of it into the next request. The screen
still shows what it loaded; only what travels is bounded. The server clamp
in 2b is the one that matters — this saves the upload and is what a real
user actually hits.

### 2d. `scan-food` takes an image of any size

`const { image_base64, lang, mode } = await req.json();` (`scan-food:41`)
checks only that it is non-empty, then embeds it in a data URL
(`:129-131`). No byte limit. Vision cost scales with the image, so an
uncapped image is an uncapped bill.

The app itself is reasonable — `takePictureAsync({ base64: true, quality: 0.5 })`
(`scan-food.tsx:68-70`) — but there is no resize, so a full-resolution
phone photo still arrives as a couple of megabytes of base64 on every
scan. And the server cannot rely on the app being the caller anyway.

**Fixed server-side.** `MAX_IMAGE_CHARS = 4_000_000` — about 4 MB of
base64, a little under 3 MB of JPEG, comfortably above what the camera
sends at `quality: 0.5`. Over it is a 413. `mode` is now checked against
the three the function actually implements instead of being interpolated
straight into the prompt, and `lang` is narrowed the same way as in
`ai-coach`.

**The client-side downscale is not done.** It needs
`expo-image-manipulator`, which is not in `package.json`, and adding a
dependency is the user's call. Worth doing — it would cut both the upload
and the vision cost on every scan — but the server cap is what closes the
hole, and that is in.

### 2e. No per-user rate limit

The gateway's own 429 is handled (`ai-coach:150`), but that is Lovable
protecting Lovable. Nothing here limits how often one user — or one
script holding the anon key — may call.

**Fixed, and this is the one part that needs a migration.**
`supabase/migrations/20260729120000_ai_usage_quota.sql` adds
`public.ai_usage` (a `user_id / day / kind` counter) and
`public.claim_ai_call(p_kind)`, which takes one call off the day's
allowance and returns false when it is spent. Each function calls it right
after the auth gate.

Three design points worth knowing before changing it:

- **The ceilings live in the SQL function, not in its arguments** — 60 a
  day for the chat, 40 scans, 30 meal suggestions, 30 nudge refreshes, 10
  weekly reviews. Passing the limit in from the edge function would have
  let anyone call the RPC directly with their own number. As written,
  invoking it by hand only burns the caller's own quota.
- **`ai_usage` has a SELECT policy and no write policy.** All writes go
  through the `SECURITY DEFINER` function, so a client cannot reset its
  own counter. `search_path` is pinned, as on `handle_new_user`.
- **`claimCall` fails open if the RPC is missing.** An unapplied migration
  must not take the AI offline, and the §1 gate is what stops the
  anonymous case regardless. The consequence is that **the quota does
  nothing until the migration is applied** — it will log
  `claim_ai_call unavailable` and allow the call. Confirm it on the live
  project, or this section is fixed on paper only.

---

## 3. The mascot economy trusts the client completely

`supabase/migrations/20260718120000_mascot_economy.sql` — the RLS is
written correctly for *ownership* and not at all for *value*:

```sql
CREATE POLICY "Users can insert own mascot transactions" ON public.mascot_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

`amount` is an unconstrained `INTEGER` the client supplies. Any signed-in
user can insert `{ amount: 999999, ref_key: 'anything' }` and have that
many coins, because the balance is `SUM(amount)`. The
`UNIQUE(user_id, ref_key)` makes a *repeat* of the same key a no-op; it
says nothing about the first one being honest. `mascot_inventory` is the
same: insert a row and you own the item, no debit required, no check that
the key is even in the shop.

Today this costs nothing real — `mascots.ts:122` reads
`if (m.pro) return false; // paid tier not live yet`. **It stops being
free the moment that line changes.** Before any paid tier ships, earning
and spending have to move behind something the client cannot forge: a
`SECURITY DEFINER` function that derives the amount from `ref_key`
server-side and refuses a purchase the balance cannot cover, with the
direct INSERT policy dropped. Note that `xpForRefKey` already knows the
value of each key on the client — that logic is what needs to live in the
database instead.

Not urgent, but it must not be discovered after money is involved.

---

## 4. `TEST_UNLOCK_ALL` must be false, and turning it off is not free

`native/src/lib/dev-flags.ts` — `export const TEST_UNLOCK_ALL = true;`

While true:

- every mascot character is unlocked, including the paid ones
- everything in the mascot-room shop is free, no coins deducted
- unlock celebrations are suppressed
- **the whole mascot economy runs in AsyncStorage on the device and never
  touches Supabase** (`native/src/hooks/use-mascot-room.ts:10-15`)

That last point is the trap. Flipping the flag switches every hook back to
`mascot_transactions` / `mascot_inventory`. The migration for those tables
exists in the repo — `supabase/migrations/20260718120000_mascot_economy.sql`,
with RLS policies and a `UNIQUE(user_id, ref_key)` that makes each earn or
spend idempotent — but **whether it has been applied to the live project
cannot be determined from the repo**, and the comment in the hook says it
had not been. Note the filename: it does not follow Lovable's
`<timestamp>_<uuid>` pattern, because it was written here rather than by
Lovable, which is precisely why it may never have been pushed.

Order of operations, before flipping the flag:

1. confirm on the live project that `mascot_transactions` and
   `mascot_inventory` exist, with RLS on
2. flip `TEST_UNLOCK_ALL` to false
3. re-test buy / equip / claim end to end — the on-device balance does not
   migrate, so a test account starts from zero coins

Also decide what happens to anything bought while the flag was on: those
purchases live only in AsyncStorage and disappear the moment the flag
flips.

---

## 5. Two shop items are sold and never render

`medal` (300 coins) and `belt` (250 coins) draw on the five hand-drawn
companions but not on Koa, because `KOA_ITEMS` has no `neck` or `waist`
slot and no art for either. Full working in
`MASCOT_SYSTEM_HANDOFF.md` §6.2. It needs a decision from the user — new
art, or pull them from the shop and refund — and it should not ship as it
is.

---

## 6. Smaller things, same pass

- **The `progress-photos` bucket has no size or type limit.** It is
  created with `INSERT INTO storage.buckets (id, name, public)` and
  nothing else (`20260212045102_…sql:60`); no `file_size_limit`, no
  `allowed_mime_types` anywhere in the migrations. Storage and egress are
  billed, and the per-user policies do not care how large the file is.
  (The bucket was created `public = true` and made private in a later
  migration, `20260212183020_…sql` — correct now, but a fresh `db reset`
  passes through a public state.)
- **`.env` is committed to git** — `git ls-files .env` finds it, and
  `.gitignore` has no rule for it. It holds only publishable values
  today, so nothing is leaked; the danger is the habit. The next person
  who adds a real secret to that file will publish it without noticing.
- **The anon key is hard-coded as a fallback** (`client.ts:11`). It is
  safe to ship — RLS governs access — but if it is ever rotated, a build
  without `EXPO_PUBLIC_SUPABASE_KEY` set will silently use the dead one.
  Consider making the env var required at release.
- **The root web app is dead on purpose** and is kept only for
  side-by-side comparison. The user's plan is one final cleanup pass
  before merging to `main`. It still carries Lovable's README and `.env`,
  so it must go before the repo is public.
- **`ai-coach.tsx:38` hard-codes the function URL** rather than using
  `supabase.functions.invoke`, because it needs SSE streaming. If the
  project ref ever changes, that line will not follow the client.

---

## 7. Checked on 2026-07-29 and clean — do not re-audit these

Written down so the next pass spends its time somewhere new. Each was
looked at specifically, not assumed.

- **RLS covers every table.** 30 tables are created across the
  migrations and all 30 get `ENABLE ROW LEVEL SECURITY`. The two lists
  match exactly.
- **No permissive policy.** No `USING (true)` or `WITH CHECK (true)`
  anywhere. Every policy keys on `auth.uid() = user_id`.
- **`UPDATE` policies without `WITH CHECK` are fine here.** Postgres
  reuses the `USING` expression as the check when it is omitted, so a
  user cannot reassign a row to someone else's `user_id`.
- **`ai_messages` has no `user_id` and is still safe** — its policy
  proves ownership through a subquery on `ai_conversations`
  (`20260212060013_…sql:29-40`), on both `USING` and `WITH CHECK`.
- **The shared libraries cannot be polluted.** `food_items` and
  `exercises` let anyone *read* rows with `user_id IS NULL`, but INSERT
  requires `auth.uid() = user_id`, and `NULL = auth.uid()` is not true —
  so no user can write into the shared set.
- **No `service_role` key anywhere** in the repo or in the functions;
  they use `SUPABASE_ANON_KEY` and forward the caller's token, which is
  what keeps RLS in force inside the functions.
- **`handle_new_user` is the only `SECURITY DEFINER` function** and it is
  written correctly, with `SET search_path = public`
  (`20260212040248_…sql:44`).
- **No cron, no `pg_net`, nothing on a timer** that could call a paid
  endpoint unattended.
- **No AI call fires on its own.** The nudges card only calls after a tap
  (`today-widgets.tsx:279-283`); the AI screens are opened deliberately.
  `retry: 2` in `query-client.ts:29` sits under `queries`, not
  `mutations`, so a failed AI call does not retry itself.
- **The one `setInterval` in the app is free** — `use-mascot-emotion.tsx:113`
  re-renders on a 60 s tick to age Koa's mood; it touches no network.

---

## How to re-verify this file

```bash
# who the AI belongs to
grep -rn "ai.gateway.lovable.dev\|LOVABLE_API_KEY" supabase/functions/

# the auth gate
grep -rn "getClaims\|claims.sub" supabase/functions/

# the platform-level gate
cat supabase/config.toml

# the test flag and what it switches off
cat native/src/lib/dev-flags.ts
sed -n '1,20p' native/src/hooks/use-mascot-room.ts

# the guards are in place (each should print five, five, five)
grep -rln "requireUser" supabase/functions/*/index.ts
grep -rln "claimCall" supabase/functions/*/index.ts
grep -rln "max_tokens" supabase/functions/*/index.ts

# and the old weak gate is gone everywhere except the note explaining it
grep -rn "getClaims" supabase/functions/*/index.ts

# RLS: the two lists must match, and the third must be empty
grep -ho "CREATE TABLE[^(]*" supabase/migrations/*.sql | sed 's/.*public\.//;s/ *$//' | sort -u
grep -ho "ALTER TABLE[^;]*ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql | sed 's/.*public\.//;s/ ENABLE.*//' | sort -u
grep -rn "USING (true)\|WITH CHECK (true)" supabase/migrations/
```

---

## Deploying the fixes — none of §1 or §2 is live until this is done

The code is on the branch. The running project still has the old
functions, so **the hole in §1 is open until these are pushed**:

```bash
supabase link --project-ref drqgonxrtmomgrftelih     # once
supabase db push                                     # applies 20260729120000_ai_usage_quota
supabase functions deploy ai-coach ai-meal-suggest ai-smart-nudges ai-weekly-review scan-food
```

`db push` will also try to apply `20260718120000_mascot_economy` if that
has never been applied — see §4, and decide there first.

Order matters slightly: deploy the migration before the functions, so
quota is enforced from the first request rather than failing open for a
window.

Then check it actually took, from a signed-out shell — this used to
return a token stream and must now return 401:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://drqgonxrtmomgrftelih.supabase.co/functions/v1/ai-coach \
  -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
```

And confirm a signed-in user still gets an answer, in the app, on all
five features — the gate is the kind of change that is silent when it
works and total when it does not.

---

## What is left

1. **Deploy** — the block above. Nothing in §1 or §2 protects anything
   until then.
2. **§4 `TEST_UNLOCK_ALL`**, once the economy migration is confirmed on
   the live project. Needs the user's go-ahead on what happens to items
   bought while the flag was on.
3. **§3 the economy server-side**, before any paid tier. Design work, not
   a patch.
4. **§5 `medal` / `belt`** — art, or remove and refund. The user's call.
5. **§2d client downscale** — needs `expo-image-manipulator` added.
6. **§6 smaller things** — bucket limits, `.env` in git, the hard-coded
   URL in `ai-coach.tsx`.

Verified on the branch: `npx tsc --noEmit` in `native/` is clean. ESLint
could not be run here — the root config wants `@eslint/js`, which the
install churn described in the mascot hand-off keeps removing.
