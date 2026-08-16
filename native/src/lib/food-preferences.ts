import type { AppLang } from '@/lib/i18n';

/**
 * The allergy chips, and the one place they are written down.
 *
 * ── why this is a file ──
 *
 * The list lived inside `onboarding-flow.tsx`, which is the only screen that
 * had ever asked the question. Adding a second place to answer it — the profile
 * sheet, so somebody can correct a mistap or a diagnosis that arrived later —
 * would have meant a second copy of eight strings in two languages.
 *
 * This repository has been bitten by exactly that five times now: `streakFrom`,
 * `exerciseKey`, two lists of invalidate keys, `lateHour`, and three separate
 * week-start expressions. A copied list does not fail loudly; it drifts, and the
 * symptom is two screens disagreeing about the same person.
 *
 * ── and why the stored value is the English string ──
 *
 * `allergies` is read by `ai-meal-suggest` and `ai-coach-memory`, which prompt
 * in English. Storing the display label would mean a Vietnamese user's
 * allergies arrive at the model as "Hải sản" while an English user's arrive as
 * "Shellfish" — the same allergy, two tokens, and the model quietly better at
 * avoiding one of them.
 *
 * So the value is stable and the label is translated, which also means changing
 * the app's language does not silently rewrite what somebody is allergic to.
 */
export interface AllergyOption {
  /** what is stored in `profiles.allergies` — never translated */
  value: string;
  label: Record<AppLang, string>;
}

export const COMMON_ALLERGIES: AllergyOption[] = [
  { value: 'Dairy', label: { en: 'Dairy', vi: 'Sữa' } },
  { value: 'Peanuts', label: { en: 'Peanuts', vi: 'Đậu phộng' } },
  { value: 'Tree nuts', label: { en: 'Tree nuts', vi: 'Hạt cây' } },
  { value: 'Eggs', label: { en: 'Eggs', vi: 'Trứng' } },
  { value: 'Soy', label: { en: 'Soy', vi: 'Đậu nành' } },
  { value: 'Wheat', label: { en: 'Wheat', vi: 'Lúa mì' } },
  { value: 'Shellfish', label: { en: 'Shellfish', vi: 'Hải sản' } },
  { value: 'Fish', label: { en: 'Fish', vi: 'Cá' } },
];

/**
 * Show a stored allergy the way this reader writes it.
 *
 * Anything not on the list is shown as stored. Somebody's own word for what
 * makes them ill is not something to hide because it is unrecognised — the
 * profile sheet renders these as extra, already-selected chips so they can at
 * least be seen and removed.
 */
export function allergyLabel(value: string, lang: AppLang): string {
  return COMMON_ALLERGIES.find((a) => a.value === value)?.label[lang] ?? value;
}

/**
 * A stored allergy, mapped back onto the canonical value if it is one of ours.
 *
 * ── the accounts that already exist ──
 *
 * Onboarding used to store the *displayed* string, so a Vietnamese account
 * holds `"Hải sản"` where a English one holds `"Shellfish"` — the same allergy,
 * two tokens, and the AI meal suggester quietly better at avoiding one of them.
 *
 * Without this, the profile sheet would compare `"Hải sản"` against the chip
 * value `"Shellfish"`, find no match, and draw every chip unselected for
 * somebody who had answered the question. Tapping the right chip would then
 * store *both*, and the list would grow a duplicate of an allergy they already
 * had.
 *
 * So a stored value is matched against every label in every language, and the
 * canonical value wins. Anything genuinely unrecognised passes through
 * untouched — deleting a stranger's allergy because it is not on an
 * eight-item list is not a migration, it is data loss.
 */
export function canonicalAllergy(stored: string): string {
  const hit = COMMON_ALLERGIES.find(
    (a) =>
      a.value.toLowerCase() === stored.toLowerCase() ||
      Object.values(a.label).some((l) => l.toLowerCase() === stored.toLowerCase()),
  );
  return hit ? hit.value : stored;
}

/** `"cà tím, mướp đắng"` → `['cà tím', 'mướp đắng']`, and back. */
export const parseDislikes = (text: string): string[] =>
  text.split(',').map((s) => s.trim()).filter(Boolean);

export const dislikesText = (list: string[] | null | undefined): string =>
  (list ?? []).join(', ');
