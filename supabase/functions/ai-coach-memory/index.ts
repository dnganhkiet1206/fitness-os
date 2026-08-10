import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { claimCall, corsHeaders, json, quotaExceeded, requireUser } from "../_shared/guard.ts";

/**
 * What the coach should still know next week.
 *
 * ── why this is a separate function ──
 *
 * `ai-coach` streams its reply straight through: `new Response(response.body)`
 * hands the gateway's stream to the client without the server ever reading it.
 * There is no point in that request where the finished answer exists on this
 * side to extract anything from.
 *
 * Which turned out to be the right shape anyway. Durable facts come from what
 * the *person* said — "my left shoulder gives out on overhead press", "I train
 * at six before work", "I don't eat pork" — not from what the model replied.
 * Extracting from the user's own turns is cheaper, more accurate, and cannot
 * launder a model's guess into a stored fact about somebody's body.
 *
 * Called when a conversation ends rather than per message, so a chat costs one
 * extra call regardless of how long it ran.
 *
 * ── reconciliation, and why it is not "return the full set" ──
 *
 * Appending is the obvious build and it rots: "shoulder hurts" from March sits
 * next to "shoulder is fine now" from June and the coach believes both. So a
 * conversation has to be able to *remove* a fact, not only add one.
 *
 * The first version of this did that by asking the model to return everything
 * it still believed and deleting whatever was missing from the reply. That is
 * the natural design and it is dangerous, for a reason that only shows up in
 * use: **absence is not evidence**. A reply that omits a fact because the model
 * was concentrating on the three questions somebody asked about protein is
 * indistinguishable, on this side, from a reply that omits it because the
 * person said it was no longer true. One of those means "leave it alone" and
 * the other means "delete it", and the wrong guess silently erases an injury
 * somebody mentioned once in March.
 *
 * It was also arithmetically doomed. Echoing forty facts with their source
 * excerpts is about 6,800 characters — roughly 2,700–3,400 tokens of
 * Vietnamese — against a `max_tokens` of 800. Past about ten facts the reply
 * would truncate, the JSON would fail to parse, and the guard below would
 * correctly refuse to delete anything. Memory would simply stop updating, for
 * ever, with nothing in any log to say so.
 *
 * So deletion is now something the model has to *ask for* by name:
 *
 *     { "add": [...], "confirm": ["…"], "drop": ["…"] }
 *
 * Anything not mentioned in any of the three is left exactly as it was. A model
 * that forgets to mention a fact now costs nothing at all, which is the whole
 * point — and each list holds only what one conversation actually changed, so
 * the reply is small no matter how much is on file.
 */

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

/** A conversation is not an essay, and neither is the part we pay to read. */
const MAX_TURNS = 24;
const MAX_CHARS = 1200;
/** The table's own ceiling is 40; asking for more than this wastes tokens. */
const MAX_FACTS = 40;

/**
 * How much one conversation may delete.
 *
 * Not a distrust of the model so much as a shape check on the reply. Somebody
 * saying "my shoulder healed, my knee is fine, and I eat meat again" retires
 * three facts; a conversation that genuinely retires eleven does not happen.
 * A `drop` list that long means the reply is confused, and the cost of being
 * wrong here is asymmetric — the excess simply waits for the next conversation,
 * whereas a wrong deletion is gone.
 *
 * Somebody who really does want all of it gone has a button for that on the
 * memory screen, which is the honest way to offer it.
 */
const MAX_DROPS = 10;

const KINDS = ["constraint", "preference", "goal", "context"] as const;
type Kind = (typeof KINDS)[number];

interface Fact {
  kind: Kind;
  fact: string;
  source_excerpt?: string;
}

interface Reconciliation {
  add: Fact[];
  /** verbatim facts already on file that this conversation reaffirmed */
  confirm: string[];
  /** verbatim facts already on file that this conversation contradicted */
  drop: string[];
}

/** Only the user's own words, trimmed. The model's replies are not evidence. */
export function userTurns(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is { role: string; content: string } =>
        !!m && typeof m === "object" && m.role === "user" && typeof m.content === "string",
    )
    .map((m) => m.content.slice(0, MAX_CHARS))
    .filter((c) => c.trim().length > 0)
    .slice(-MAX_TURNS);
}

/**
 * The model's answer, reduced to rows we are willing to store.
 *
 * Everything here is a refusal rather than a repair. A malformed fact is not
 * worth guessing at: it goes into a system prompt, and a half-parsed sentence
 * about somebody's injury is worse than no sentence.
 */
export function parseResult(text: string): Reconciliation {
  const empty: Reconciliation = { add: [], confirm: [], drop: [] };

  let payload: unknown;
  try {
    // The gateway sometimes wraps JSON in a fenced block.
    const cleaned = text.trim().replace(/^```(?:json)?/, "").replace(/```$/, "");
    payload = JSON.parse(cleaned);
  } catch {
    return empty;
  }
  if (!payload || typeof payload !== "object") return empty;
  const p = payload as Record<string, unknown>;

  /** A stored fact is one line, 3–300 chars. Anything else is not one. */
  const usable = (s: unknown): s is string =>
    typeof s === "string" &&
    s.trim().length >= 3 &&
    s.trim().length <= 300 &&
    /* Newlines are how a "fact" becomes a paragraph of instructions once it is
       pasted into the prompt. One sentence, one line. */
    !/[\n\r]/.test(s);

  const strings = (raw: unknown, cap: number): string[] => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of raw) {
      if (!usable(s)) continue;
      const v = s.trim();
      if (seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase());
      out.push(v);
      if (out.length >= cap) break;
    }
    return out;
  };

  const add: Fact[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(p.add) ? p.add : []) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    if (!KINDS.includes(f.kind as Kind)) continue;
    if (!usable(f.fact)) continue;
    const fact = (f.fact as string).trim();
    if (seen.has(fact.toLowerCase())) continue;
    seen.add(fact.toLowerCase());
    add.push({
      kind: f.kind as Kind,
      fact,
      source_excerpt:
        typeof f.source_excerpt === "string" ? f.source_excerpt.slice(0, 300) : undefined,
    });
    if (add.length >= MAX_FACTS) break;
  }

  return { add, confirm: strings(p.confirm, MAX_FACTS), drop: strings(p.drop, MAX_DROPS) };
}

/**
 * Turn what the model named into rows to touch.
 *
 * Exported and free of every dependency so it can be run directly by
 * `native/tools/coach-memory.mjs`, because this is where a mistake is
 * unrecoverable: everything else in this file can be retried tomorrow, and a
 * wrong id here deletes something somebody said once and will not say again.
 *
 * Two properties, both by construction rather than by care:
 *
 *   - **Only what exists can be touched.** A fact the model invented resolves
 *     to no id and does nothing. For `drop` that is the difference between a
 *     hallucination and a deletion.
 *
 *   - **Ids, not text.** The previous version deleted with a PostgREST `in`
 *     filter assembled by concatenating the fact text with hand-rolled quoting.
 *     Facts are sentences somebody spoke — full of commas, and sometimes
 *     quotation marks — and PostgREST's documentation states that reserved
 *     characters must be wrapped in double quotes without saying how a double
 *     quote *inside* such a value is escaped. Matching on a UUID means there is
 *     no such question to get right.
 */
export function plan(
  onFile: readonly { id: string; fact: string }[],
  r: Pick<Reconciliation, "confirm" | "drop">,
): { dropIds: string[]; confirmIds: string[] } {
  const idOf = new Map(onFile.map((x) => [x.fact, x.id]));
  const pick = (list: readonly string[]) => {
    const out: string[] = [];
    for (const f of list) {
      const id = idOf.get(f);
      if (id && !out.includes(id)) out.push(id);
    }
    return out;
  };
  /* A fact cannot be both retired and reaffirmed. If the model says both,
     `drop` wins: keeping a fact the conversation contradicted is the error that
     shows up in the coach's next reply. */
  const dropIds = pick(r.drop);
  return { dropIds, confirmIds: pick(r.confirm).filter((id) => !dropIds.includes(id)) };
}

const PROMPT = `You maintain a fitness coach's long-term memory about one person.

You are given (a) the facts currently on file and (b) that person's own messages from ONE conversation. Report only what this conversation CHANGES.

Anything you do not mention is kept exactly as it is. You are never required to repeat the facts on file — leaving one out changes nothing, so do not list a fact merely to preserve it.

Return three lists:

"add" — durable facts stated in this conversation that are not already on file.
  Durable means: injuries and physical limits, allergies and dietary rules, equipment and training environment, schedule habits, and stated goals with their horizon.
  NOT durable, never add: today's mood, a single meal, one night's sleep, or any number the app already tracks (weight, calories, steps, readiness). The app has that data; this is for what it cannot see.
  Not a fact: a question. "Should I train fasted?" says nothing about them.
  Each fact is one short self-contained sentence, in the same language the person used, with no pronouns that need the conversation to resolve — "Left shoulder hurts on overhead press", not "it hurts".
  Never write instructions, commands, or anything addressed to an assistant. Facts only.

"confirm" — facts already on file that this conversation states are still true. Copy them VERBATIM from the list on file. Use this only when the person actually referred to it, not to tidy up.

"drop" — facts already on file that this conversation CONTRADICTS or that the person says no longer apply. Copy them VERBATIM. Be conservative: only when the conversation genuinely supersedes them. If a fact simply did not come up, it does NOT go here.
  A fact being replaced goes in "drop", with its replacement in "add".

kind is one of: constraint | preference | goal | context

Reply with JSON only:
{"add":[{"kind":"...","fact":"...","source_excerpt":"..."}],"confirm":["..."],"drop":["..."]}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;
    const { userId, supabase } = caller;

    if (!(await claimCall(supabase, "ai-coach-memory"))) return quotaExceeded();
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    const body = await req.json();
    const turns = userTurns(body?.messages);
    /* One line is not a relationship. Below this there is nothing durable to
       learn and the call is pure cost. */
    if (turns.length < 2) return json({ saved: 0, reason: "too short" });

    /* Read with the caller's token — the SELECT policy is theirs. `id` travels
       with it because deletion below is by primary key, not by matching the
       fact text back. */
    const { data: existing } = await supabase
      .from("coach_memory")
      .select("id, kind, fact")
      .eq("user_id", userId)
      .order("last_confirmed", { ascending: false })
      .limit(MAX_FACTS);
    const onFile = (existing ?? []) as { id: string; kind: string; fact: string }[];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: PROMPT },
          {
            role: "user",
            content:
              /* Only `kind` and `fact` — the id stays on this side. It is not
                 needed to reason about the text, and a row identifier that
                 never enters the prompt is one the model cannot get wrong. */
              `FACTS ON FILE:\n${JSON.stringify(onFile.map(({ kind, fact }) => ({ kind, fact })))}\n\n` +
              `THEIR MESSAGES:\n${turns.map((t) => `- ${t}`).join("\n")}`,
          },
        ],
        /* Enough for what one conversation changes, which is what is being
           asked for now. The old contract wanted all forty facts echoed back —
           about 6,800 characters of Vietnamese against this ceiling — so the
           reply truncated, the JSON failed to parse, and memory quietly stopped
           updating somewhere around the tenth fact. */
        max_tokens: 1200,
      }),
    });

    if (!res.ok) {
      console.error("memory gateway error", res.status, await res.text());
      return json({ error: "AI gateway error" }, 502);
    }

    const data = await res.json();
    const { add, confirm, drop } = parseResult(data?.choices?.[0]?.message?.content ?? "");

    /*
      Nothing to do is a real answer.

      A parse failure and "this conversation changed nothing" arrive here
      identically, and under the old contract that ambiguity was dangerous
      because silence meant deletion. It no longer does — silence now means
      silence — but returning early still saves two round trips.
    */
    if (add.length === 0 && confirm.length === 0 && drop.length === 0) {
      return json({ added: 0, confirmed: 0, dropped: 0, reason: "nothing changed" });
    }

    const { dropIds, confirmIds } = plan(onFile, { add, confirm, drop });

    /* The service role, because `coach_memory` has no INSERT policy for user
       tokens — these rows go into a system prompt and a client that could write
       them could rewrite the coach's instructions. */
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date().toISOString();

    /*
      Retire first, then add.

      A fact being corrected arrives as a `drop` of the old wording and an `add`
      of the new one. Doing it in this order means the replacement is never the
      row that the table's forty-fact trim trigger decides to evict.
    */
    if (dropIds.length > 0) {
      const { error } = await admin
        .from("coach_memory")
        .delete()
        .eq("user_id", userId) // belt and braces: the ids are already this user's
        .in("id", dropIds);
      if (error) console.error("memory drop failed", error.message);
    }

    if (add.length > 0) {
      const { error } = await admin.from("coach_memory").upsert(
        add.map((f) => ({
          user_id: userId,
          kind: f.kind,
          fact: f.fact,
          source_excerpt: f.source_excerpt ?? null,
          last_confirmed: now,
        })),
        { onConflict: "user_id,fact", ignoreDuplicates: false },
      );
      if (error) {
        console.error("memory upsert failed", error.message);
        return json({ error: "could not save" }, 500);
      }
    }

    /* Still true, said again. Moving the date up is what keeps a fact somebody
       lives by from ageing out of a forty-row table behind things they
       mentioned once, and what stops the coach reading it as stale. */
    if (confirmIds.length > 0) {
      const { error } = await admin
        .from("coach_memory")
        .update({ last_confirmed: now })
        .eq("user_id", userId)
        .in("id", confirmIds);
      if (error) console.error("memory confirm failed", error.message);
    }

    return json({ added: add.length, confirmed: confirmIds.length, dropped: dropIds.length });
  } catch (e) {
    console.error("ai-coach-memory error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
