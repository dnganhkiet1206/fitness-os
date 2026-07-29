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

## 2. `TEST_UNLOCK_ALL` must be false, and turning it off is not free

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

## 3. Two shop items are sold and never render

`medal` (300 coins) and `belt` (250 coins) draw on the five hand-drawn
companions but not on Koa, because `KOA_ITEMS` has no `neck` or `waist`
slot and no art for either. Full working in
`MASCOT_SYSTEM_HANDOFF.md` §6.2. It needs a decision from the user — new
art, or pull them from the shop and refund — and it should not ship as it
is.

---

## 4. Smaller things, same pass

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
```
