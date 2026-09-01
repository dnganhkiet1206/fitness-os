/**
 * Which muscle diagram a stored `muscle_group` refers to.
 *
 * ── why this is a file and not two helpers in the component ──
 *
 * This mapping is the only thing standing between the library grid and a lie. A
 * group name that misses the table produces a tile reading "0 bài" over a shelf
 * that has exercises on it, and nothing about that looks broken: it is a number,
 * it is plausible, and the exercises are still reachable through the full list,
 * so nobody reports it.
 *
 * Next to the images it could only be checked by reading, because the component
 * imports React Native and that will not load in Node. Out here,
 * `tools/muscle-map.mjs` compiles this and runs the real function against the
 * real strings — the same reason `curve.ts` and `water-scale.ts` sit apart from
 * what uses them.
 *
 * ── why the lookup is so forgiving ──
 *
 * `exercises.muscle_group` is free text and three different things write it.
 * The builder (`workout-builder.tsx:30`) stores English — "Chest", "Quads". The
 * library (`exercises.tsx:25`) stores whatever `useI18n()` returned, so a
 * Vietnamese user's exercises are filed under "Ngực" and "Chân trước". And the
 * seed migration stores a third set again: "Bắp tay trước" where the picker says
 * "Tay trước", "Hamstring" where it says "Hamstrings", and "Lưng/Chân" — two
 * groups in one field.
 *
 * One library therefore holds several spellings of the same shelf. That is a
 * real defect in the data model rather than something this file invents a
 * workaround for; it is simply the data that exists.
 */

/**
 * The ten diagrams there is art for.
 *
 * Declared here rather than derived from the image registry so the lookup has
 * no reason to import React Native — which is what lets `tools/muscle-map.mjs`
 * compile this file and run the real function against the real group names.
 * `muscle-art.tsx` satisfies this type, so a key without a file fails to build.
 */
export type MuscleArtKey =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'glutes'
  | 'calves'
  | 'abs'
  | 'cardio';

/**
 * Every spelling of every group that the two writers can produce, folded to a
 * key. Written out rather than derived from `useI18n()` so that a change to a
 * label does not silently orphan art for exercises already filed under the old
 * one — the old spelling stays in this table and keeps working.
 */
const ALIASES: Record<string, MuscleArtKey> = {
  // English, as `workout-builder.tsx` writes it
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  quads: 'legs',
  hamstrings: 'legs',
  legs: 'legs',
  calves: 'calves',
  glutes: 'glutes',
  abs: 'abs',
  core: 'abs',
  'full body': 'cardio',
  fullbody: 'cardio',
  cardio: 'cardio',
  // Vietnamese, as `exercises.tsx` writes it via `useI18n()`
  nguc: 'chest',
  lung: 'back',
  vai: 'shoulders',
  'tay truoc': 'biceps',
  'tay sau': 'triceps',
  'chan truoc': 'legs',
  'chan sau': 'legs',
  chan: 'legs',
  'bap chan': 'calves',
  // the seed migration's own spellings — `20260212040248_…sql:358`
  'bap tay truoc': 'biceps',
  'bap tay sau': 'triceps',
  hamstring: 'legs',
  mong: 'glutes',
  bung: 'abs',
  'toan than': 'cardio',
  'tim mach': 'cardio',
};

/** lower-case, strip Vietnamese diacritics, squeeze spaces */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Aliases longest-first, for the containment pass below.
 *
 * Order is the whole correctness of that pass: "bắp chân" *contains* "chân", so
 * checking short keys first files calves under legs. Longest wins, always.
 */
const BY_LENGTH = Object.keys(ALIASES).sort((a, b) => b.length - a.length);

/**
 * Every diagram a stored group name refers to.
 *
 * ── why a list ──
 *
 * The seed data has `Lưng/Chân` on the deadlift, which is two groups and is
 * also true. Returning one key would file it under whichever half was written
 * first and hide it from the other; someone browsing legs should find the
 * deadlift.
 *
 * The counts across the tiles therefore add up to more than the library holds.
 * That is right: a tile says how many exercises work that muscle, not how many
 * belong to it exclusively.
 *
 * ── why containment, and why longest-first ──
 *
 * An exact table would need every spelling anyone ever writes. The real data
 * already breaks it three ways: the seed says `Bắp tay trước` where the picker
 * says `Tay trước`, and `Hamstring` where the picker says `Hamstrings`. So an
 * exact match is tried first, and then the longest alias *contained* in the
 * string wins.
 *
 * Longest-first is not a tidiness preference. "bắp chân" contains "chân", so
 * checking the short one first would file calves under legs — and it would look
 * fine, because legs would simply have one more exercise than it should.
 */
export function muscleArtKeysFor(group: string | null | undefined): MuscleArtKey[] {
  if (!group) return [];
  const out = new Set<MuscleArtKey>();
  // `/`, `,`, `+`, `&` all appear in hand-written group names
  for (const part of group.split(/[/,+&]/)) {
    const f = fold(part);
    if (!f) continue;
    const exact = ALIASES[f];
    if (exact) {
      out.add(exact);
      continue;
    }
    const near = BY_LENGTH.find((k) => f.includes(k));
    if (near) out.add(ALIASES[near]);
  }
  return [...out];
}

/**
 * Which diagram belongs to a stored group name, or none.
 *
 * `null` rather than a fallback picture. A group with no art gets no art; giving
 * every unknown string the running figure would quietly file "Forearms" under
 * cardio and there would be nothing on screen to say so.
 */
export function muscleArtFor(group: string | null | undefined): MuscleArtKey | null {
  return muscleArtKeysFor(group)[0] ?? null;
}

/**
 * Tên tiếng người của mỗi nhóm cơ.
 *
 * Ở đây chứ không ở màn nào, vì hai chỗ cần nó: lưới cơ trên tab Tập luyện, và
 * dòng "buổi này đánh vào đâu" trên mặt thẻ mẫu tập. Bảng nhãn đứng cạnh
 * `MuscleArtKey` thì thêm một nhóm cơ là sửa một tệp; để nhãn trong màn thì
 * thêm một nhóm là sửa hai tệp và quên một.
 */
export const MUSCLE_LABEL: Record<MuscleArtKey, { vi: string; en: string }> = {
  chest: { vi: 'Ngực', en: 'Chest' },
  back: { vi: 'Lưng', en: 'Back' },
  legs: { vi: 'Chân', en: 'Legs' },
  shoulders: { vi: 'Vai', en: 'Shoulders' },
  biceps: { vi: 'Tay trước', en: 'Biceps' },
  triceps: { vi: 'Tay sau', en: 'Triceps' },
  abs: { vi: 'Bụng', en: 'Abs' },
  glutes: { vi: 'Mông', en: 'Glutes' },
  calves: { vi: 'Bắp chân', en: 'Calves' },
  cardio: { vi: 'Tim mạch', en: 'Cardio' },
};
