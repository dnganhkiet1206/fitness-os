import { exerciseKey } from '@/lib/personal-record';
import { routineIndex } from '@/lib/local-date';

/**
 * Which movements the person is actually training, according to their own plan.
 *
 * ── the problem this exists for ──
 *
 * The insight list showed every movement logged in ninety days. A routine with
 * twelve exercises on a day and five training days is sixty cards, and the
 * screen stopped answering "how is my bench going" and started being a
 * catalogue somebody had to search.
 *
 * The app already knows which ones matter and did not use it: `routine_days`
 * says which template runs on which weekday, and a template carries its
 * exercises. That is a list nobody has to maintain, that is never out of date,
 * and that shrinks "today" to about a dozen.
 *
 * ── keyed by name, like everything else here ──
 *
 * A template row carries `exerciseName` and, most of the time, no id — the same
 * reason `personal-record.ts` matches on the name and the reason
 * `exercise-kind.ts` cannot rely on a declaration. `exerciseKey` is the one
 * matching rule and this uses it rather than a second one.
 */

export interface RoutineDayRow {
  day_of_week?: number | null;
  is_rest?: boolean | null;
  template_id?: string | null;
}

export interface TemplateRow {
  id?: string | null;
  exercises?: unknown;
}

/** Every `exerciseKey` a template holds. Free JSONB, so everything is coerced. */
function keysOfTemplate(t: TemplateRow | undefined): string[] {
  if (!t || !Array.isArray(t.exercises)) return [];
  const out: string[] = [];
  for (const row of t.exercises as { exerciseName?: unknown }[]) {
    if (!row || typeof row !== 'object') continue;
    const key = exerciseKey(typeof row.exerciseName === 'string' ? row.exerciseName : '');
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

export type PlanScope = 'today' | 'week' | 'all';

/**
 * The keys in scope, or `null` for "everything".
 *
 * `null` and an empty set are different answers and the caller has to tell them
 * apart: `null` is "no filter", an empty set is "your plan has nothing on it
 * today", and showing every exercise for the second one would be answering a
 * question nobody asked.
 */
export function planKeys(
  scope: PlanScope,
  days: readonly RoutineDayRow[],
  templates: readonly TemplateRow[],
  now: Date = new Date(),
): Set<string> | null {
  if (scope === 'all') return null;

  const byId = new Map<string, TemplateRow>();
  for (const t of templates) if (typeof t?.id === 'string') byId.set(t.id, t);

  const wanted =
    scope === 'today'
      ? days.filter((d) => d?.day_of_week === routineIndex(now))
      : [...days];

  const out = new Set<string>();
  for (const d of wanted) {
    /* A rest day contributes nothing, including on a week view: an exercise is
       in scope because it is scheduled, and a rest day schedules nothing. */
    if (d?.is_rest) continue;
    if (typeof d?.template_id !== 'string') continue;
    for (const k of keysOfTemplate(byId.get(d.template_id))) out.add(k);
  }
  return out;
}
