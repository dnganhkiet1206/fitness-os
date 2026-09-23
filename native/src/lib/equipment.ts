/**
 * What a movement is done with — as a KEY, not as a word on a screen.
 *
 * ── the defect this is the answer to ──
 *
 * `exercises.equipment` was free text with nothing around it: no picker, no
 * vocabulary, no normaliser, and the Guide printed it verbatim. The seeded
 * library happened to be tidy — five values, spelled one way each — but
 * nothing kept it that way, so `Dumbbell`, `dumbbells`, `DB` and `Tạ đơn`
 * were all one keystroke apart and all meant the same shelf.
 *
 * A key fixes the half of that which is a data problem: the database stores
 * `dumbbell` whatever language the person is using, and the screen decides
 * what that word looks like. The other half — how somebody enters it — is a
 * picker, and a picker is a screen change this phase is told not to make.
 *
 * ── why five and not fifty ──
 *
 * These five are the entire vocabulary the app has ever had: exactly the
 * values the seed migration writes. Anything larger would be a taxonomy
 * invented here rather than one the product already means, and every entry in
 * it would be a claim that some typed word maps onto it.
 *
 * So a value that is not one of these five is NOT a key and is not treated as
 * one. `canonicalEquipment` returns null for it, the write path stores what
 * the person typed, and `equipmentLabel` prints that text back. Somebody's
 * `Kettlebell` survives this file untouched — it is just not translated,
 * which is the truth about it.
 *
 * ── no imports, on purpose ──
 *
 * Same reason as `muscle-group.ts`: a detector compiles this file on its own
 * with `tsc --ignoreConfig` and runs the real functions against the real
 * strings. A path alias in here would break that, and a rule that cannot run
 * is a rule that cannot fail.
 */

/** The whole vocabulary. Five, because five is what the library has. */
export type EquipmentKey = 'barbell' | 'bodyweight' | 'cable' | 'dumbbell' | 'machine';

export const EQUIPMENT_KEYS: readonly EquipmentKey[] = [
  'barbell',
  'bodyweight',
  'cable',
  'dumbbell',
  'machine',
];

/**
 * What each key is called, in each language the app renders.
 *
 * `bodyweight` is `Không tạ` rather than a literal translation of "body
 * weight", because that is what this app already calls it in Vietnamese —
 * `nRdBodyweight` in `native-strings.ts`. Two names for one idea inside one
 * product is the thing this file exists to stop.
 */
export const EQUIPMENT_LABEL: Record<EquipmentKey, { vi: string; en: string }> = {
  barbell: { vi: 'Tạ đòn', en: 'Barbell' },
  bodyweight: { vi: 'Không tạ', en: 'Bodyweight' },
  cable: { vi: 'Cáp', en: 'Cable' },
  dumbbell: { vi: 'Tạ đơn', en: 'Dumbbell' },
  machine: { vi: 'Máy tập', en: 'Machine' },
};

/*
  The spellings that mean one of the five.

  Deliberately short. Each entry is either the key itself, or a form free text
  actually produces for it — a plural, the two-letter gym shorthand, the
  spaced spelling — and each is matched WHOLE, never as a substring. `db` is
  safe to include for that reason: as a whole trimmed value it is dumbbell,
  and as part of a longer word it is never consulted.

  This table is the same one the migration carries in SQL. Two copies is one
  more than ideal; the alternative is the client asking the database what a
  word means before it can draw a label.
*/
const ALIASES: Record<string, EquipmentKey> = {
  barbell: 'barbell',
  bodyweight: 'bodyweight',
  'body weight': 'bodyweight',
  cable: 'cable',
  dumbbell: 'dumbbell',
  dumbbells: 'dumbbell',
  db: 'dumbbell',
  machine: 'machine',
};

/** Case and spacing only. No diacritic folding: every alias above is ASCII. */
const fold = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The key a stored (or typed) equipment value means, or `null` when it means
 * something this app has no word for.
 *
 * `null` is a real answer and the callers treat it as one: the write path
 * keeps the original text, and the display path prints it.
 */
export function canonicalEquipment(raw: string | null | undefined): EquipmentKey | null {
  const f = fold(raw ?? '');
  return f ? (ALIASES[f] ?? null) : null;
}

/**
 * What to show for a stored value.
 *
 * A recognised key becomes the label for the current language. Anything else
 * comes back as the person wrote it — trimmed, and otherwise untouched. An
 * empty value produces an empty string, and callers already treat that as
 * "nothing to show" rather than printing a dash.
 */
export function equipmentLabel(
  stored: string | null | undefined,
  lang: 'vi' | 'en',
): string {
  const key = canonicalEquipment(stored);
  if (key) return EQUIPMENT_LABEL[key][lang];
  return (stored ?? '').trim();
}

/**
 * Khoá để hỏi "hai bài này có dùng CÙNG một dụng cụ không".
 *
 * `canonicalEquipment` trả `null` cho mọi thứ ngoài năm từ vựng — `Kettlebell`,
 * `Resistance band`, `TRX`. Dùng nó một mình để so sánh thì mọi dụng cụ lạ
 * thành "không biết", và hai bài kettlebell của cùng một người không tìm thấy
 * nhau mặc dù cột ấy ghi y hệt.
 *
 * Nên: nhận ra được thì khoá là KHOÁ (`dumbbell` khớp `Dumbbells` và `db`);
 * không nhận ra thì khoá là chính chữ ấy sau khi gấp hoa/thường và khoảng
 * trắng, mang tiền tố `raw:` để nó không bao giờ đụng vào một trong năm khoá.
 *
 * `null` vẫn là một câu trả lời thật, và nó chỉ có một nghĩa duy nhất: cột ấy
 * TRỐNG. Bài chưa ghi dụng cụ thì không có bài nào "cùng dụng cụ" với nó —
 * không phải "cùng không có".
 */
export function equipmentMatchKey(raw: string | null | undefined): string | null {
  const key = canonicalEquipment(raw);
  if (key) return key;
  const f = fold(raw ?? '');
  return f ? `raw:${f}` : null;
}
