# Pre-release checklist — things that are fine in test and wrong in production

Written 2026-07-29 from a read of the real configuration, not from memory.
Every claim below has a file and a line so the next person can re-check it
in a minute rather than re-derive it in an hour.

Nothing in this file has been fixed. It is a list of what to fix, and none
of it should be changed without asking the user first (rule 12 of the
mascot hand-off applies to the whole branch).

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

## 1. The auth gate on the five AI functions is weaker than it looks

**Severity: this one costs money.** Fix before any public build.

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

**The fix is one line per function** — require a real end user, not just a
valid token:

```ts
const userId = claimsData?.claims?.sub;
if (authErr || !userId || claimsData.claims.role !== "authenticated") return 401;
```

Two things worth doing at the same time:

- `Access-Control-Allow-Origin: "*"` on all five (`ai-coach:5` and the
  same block in the others). The native app does not need CORS at all;
  the web app needs one origin. A wildcard means any page on the internet
  can drive these endpoints from a logged-in user's browser.
- There is no per-user rate limit in the functions. The gateway's own 429
  is handled (`ai-coach:150`), but that is Lovable protecting Lovable, not
  the project protecting its credits.

---

## 2. Nothing caps what the AI functions can spend

**Severity: this is the one that can produce a bill overnight.** §1 is the
open door; this is what is behind it.

### 2a. No output cap anywhere

Not one of the five gateway calls sets `max_tokens` or
`max_completion_tokens` — grep the whole `supabase/functions` tree and the
count is zero. Every request is free to generate until the model stops on
its own. `ai-coach` additionally sets `stream: true` (`ai-coach:143`) and
returns `response.body` untouched (`ai-coach:166`), so it streams whatever
comes.

Add a ceiling to each of the five. Even a generous one — 1024 for the
chat, a few hundred for the nudges — turns an unbounded worst case into a
known one.

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

Minimum guards, all cheap:

- cap the array (last ~20 messages) and each message's length
- reject any role that is not `user` or `assistant`
- cap the total characters forwarded

### 2c. The chat resends its whole history every turn

`ai-coach.tsx:121` builds `newMessages = [...messages, userMsg]` and
`:160` sends all of it. `loadConversation` (`:92-100`) reads the entire
stored conversation with **no `limit`**. So turn *n* pays for all *n*
turns, and the cost of one long conversation grows with the square of its
length. Truncating to a window on the client and clamping again on the
server fixes both this and part of 2b.

### 2d. `scan-food` takes an image of any size

`const { image_base64, lang, mode } = await req.json();` (`scan-food:41`)
checks only that it is non-empty, then embeds it in a data URL
(`:129-131`). No byte limit. Vision cost scales with the image, so an
uncapped image is an uncapped bill.

The app itself is reasonable — `takePictureAsync({ base64: true, quality: 0.5 })`
(`scan-food.tsx:68-70`) — but there is no resize, so a full-resolution
phone photo still arrives as a couple of megabytes of base64 on every
scan. And the server cannot rely on the app being the caller anyway.
Cap the decoded size server-side, and downscale on the client before
sending.

### 2e. No per-user rate limit

The gateway's own 429 is handled (`ai-coach:150`), but that is Lovable
protecting Lovable. Nothing here limits how often one user — or one
script holding the anon key — may call. A counter keyed on the user id
with a daily ceiling would do.

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

# no output cap, and no input validation (both should print nothing)
grep -rn "max_tokens\|max_completion_tokens" supabase/functions/
grep -rn "messages.slice\|messages.length" supabase/functions/ai-coach/

# RLS: the two lists must match, and the third must be empty
grep -ho "CREATE TABLE[^(]*" supabase/migrations/*.sql | sed 's/.*public\.//;s/ *$//' | sort -u
grep -ho "ALTER TABLE[^;]*ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql | sed 's/.*public\.//;s/ ENABLE.*//' | sort -u
grep -rn "USING (true)\|WITH CHECK (true)" supabase/migrations/
```

---

## Suggested order, if the user asks for fixes

1. §1 — the auth gate. One line per function, no behaviour change for
   real users.
2. §2a — `max_tokens` on all five. One line per function.
3. §2b — validate and clamp `messages`. A dozen lines in `ai-coach`.
4. §2d — a byte cap on `image_base64`, and a client-side downscale.
5. §2e — a per-user daily counter.
6. §4 — `TEST_UNLOCK_ALL`, once the economy migration is confirmed live.
7. §3 — move the economy server-side, before any paid tier.

§5 and the `.env` habit need a decision from the user rather than code.
