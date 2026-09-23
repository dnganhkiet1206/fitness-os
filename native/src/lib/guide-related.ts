import { equipmentMatchKey } from './equipment';
import { exerciseKey } from './exercise-key';
import { muscleArtKeysFor, muscleGroupLabel, type MuscleArtKey } from './muscle-group';

/**
 * "Còn bài nào nữa" — hai câu hỏi, cùng một thư viện, KHÔNG một truy vấn mới.
 *
 * ── ba tab sau cùng của màn hướng dẫn hỏi gì ──
 *
 *     Cơ tác động   bài này đánh vào đâu      → `muscleKeys`, đã có sẵn
 *     Thiết bị      cần gì, và còn bài nào    → `sameEquipment` ở đây
 *     Liên quan     bài nào cùng nhóm cơ      → `sameMuscle` ở đây
 *
 * Đặt hàng nói thẳng về chuyện KHÔNG được bịa: *"Do not create fake screens
 * merely to make the tab clickable… Do not invent content that does not
 * exist."* Nên hai danh sách dưới đây không có một chữ nào do màn hình nghĩ
 * ra — chúng là những dòng CÓ THẬT trong `exercises`, lọc lại.
 *
 * ── vì sao là một tệp thuần, tách khỏi màn hình ──
 *
 * Cùng lý do với `exercise-media.ts` và `guide-content.ts`: không React, không
 * Supabase, không theme, nên `tools/guide-related.mjs` biên dịch rồi CHẠY THẬT
 * hàm này với dữ liệu thật của thư viện. Một luật dò chuỗi không trả lời được
 * "bài đang mở có tự xuất hiện trong danh sách của chính nó không" — câu hỏi
 * đúng là câu hỏi về GIÁ TRỊ TRẢ VỀ.
 *
 * ── và vì sao không có truy vấn nào ở đây ──
 *
 * `useExercises()` là truy vấn màn Plan ĐÃ chạy sẵn (qua `useExerciseInsights`),
 * và nó đã select đủ: `id, name, muscle_group, equipment`. Nên ba tab này đọc
 * lại đúng cache ấy. Một truy vấn "bài liên quan" riêng sẽ là lượt mạng thứ hai
 * cho dữ liệu đang nằm sẵn trong bộ nhớ, và `tools/exercise-guide.mjs` luật 3
 * cấm cách chữa sai — nới câu select của `useExercises()` để nó mang thêm cột.
 */

/** Hai thứ tiếng app chạy. Khai tại chỗ để tệp này không phải import gì thêm. */
export type Lang = 'vi' | 'en';

/** Một dòng thư viện, đúng những cột `useExercises()` đã select. */
export interface LibraryRow {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
}

/**
 * Bài đang mở, ĐÃ phân giải.
 *
 * Không mang tên cột nào của cơ sở dữ liệu, và không mang nhãn nào của ngôn
 * ngữ đang bật: `muscleKeys` và `equipmentKey` là KHOÁ. Một nhãn không so sánh
 * được — thư viện lưu `Chest`, `Ngực` và `Bắp tay trước` lẫn lộn, xem
 * `muscle-group.ts`.
 */
export interface GuideSubject {
  id: string | null;
  name: string;
  muscleKeys: readonly MuscleArtKey[];
  equipmentKey: string | null;
}

export interface RelatedItem {
  id: string;
  name: string;
  /** nhóm cơ của bài ấy, dạng KHOÁ — để so sánh và để kiểm */
  muscleKeys: MuscleArtKey[];
  /**
   * Cùng thông tin ấy, ĐÃ DỊCH sang ngôn ngữ đang bật — màn hình in thẳng.
   *
   * Dịch ở đây chứ không ở màn hình vì `tools/guide-content.mjs` luật 18 canh
   * một điều có giá: đúng MỘT nơi biết rằng cột ấy lưu khoá chứ không lưu
   * nhãn. Hai nơi cùng dịch là hai nơi sẽ lệch — và chỗ lệch sẽ in `chest` ra
   * cho người đọc mà không gì bắt được.
   *
   * Chuỗi rỗng khi thư viện không nhận ra giá trị đang lưu; màn hình đã có
   * `numberOfLines` và một dòng rỗng thì không chiếm chỗ.
   */
  muscleLabel: string;
  /** bao nhiêu nhóm cơ trùng với bài đang mở */
  shared: number;
}

/**
 * Tám.
 *
 * Ba tab này nằm trong một pageSheet đã có hình dẫn cao 3:4 ở trên; danh sách
 * dài hơn thế biến một tab tra cứu thành một màn thư viện thứ hai, mà thư viện
 * đã có màn riêng (`/exercises`). Cắt ở đây chứ không ở màn hình để phép cắt
 * cũng chạy được trong luật kiểm.
 */
export const RELATED_LIMIT = 8;

const named = (r: LibraryRow): boolean => !!(r?.name ?? '').trim();

/**
 * Bỏ chính nó ra, và bỏ theo CẢ HAI đường.
 *
 * Theo `id` là hiển nhiên. Theo TÊN thì không, và nó bắt buộc: thư viện giữ
 * dòng hạt giống (`user_id` null) và bản người dùng tự sửa cùng tên, và
 * `use-exercise-guide.ts` đã chọn một trong hai. Chỉ lọc theo id thì bản còn
 * lại hiện ra trong danh sách "bài liên quan" của chính nó — một lời nói dối
 * trông rất hợp lý, vì nó đúng là một dòng có thật.
 */
const others = (rows: readonly LibraryRow[], subject: GuideSubject): LibraryRow[] => {
  const selfKey = exerciseKey(subject.name);
  const seen = new Set<string>();
  const out: LibraryRow[] = [];
  for (const r of rows ?? []) {
    if (!r || !named(r)) continue;
    if (subject.id && r.id === subject.id) continue;
    const k = exerciseKey(r.name);
    if (selfKey && k === selfKey) continue;
    /* Cùng tên = cùng bài, dù hai dòng. Dòng đầu thắng; thứ tự đã tất định vì
       `others` được gọi trên một mảng đã sắp, xem `sorted` bên dưới. */
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    out.push(r);
  }
  return out;
};

/** Tất định ở mọi máy: `exerciseKey` đã gấp hoa/thường và khoảng trắng, và so
    chuỗi bằng `<` không phụ thuộc bảng đối chiếu của hệ điều hành như
    `localeCompare` — thứ đã cho hai thứ tự khác nhau giữa Node và Hermes. */
const byName = (a: LibraryRow, b: LibraryRow): number => {
  const x = exerciseKey(a.name);
  const y = exerciseKey(b.name);
  return x === y ? 0 : x < y ? -1 : 1;
};

const item = (r: LibraryRow, subject: GuideSubject, lang: Lang): RelatedItem => {
  const keys = muscleArtKeysFor(r.muscle_group);
  const mine = new Set<string>(subject.muscleKeys);
  return {
    id: r.id,
    name: r.name.trim(),
    muscleKeys: keys,
    muscleLabel: muscleGroupLabel(r.muscle_group, lang),
    shared: keys.filter((k) => mine.has(k)).length,
  };
};

/**
 * Bài khác dùng CÙNG dụng cụ.
 *
 * `equipmentKey` rỗng → danh sách rỗng, và đó không phải một thiếu sót: bài
 * chưa ghi dụng cụ thì không có bài nào "cùng dụng cụ" với nó. Gộp mọi bài
 * trống thành một nhóm sẽ nói rằng chống đẩy và squat dùng chung một thiết bị.
 */
export function sameEquipment(
  rows: readonly LibraryRow[] | null | undefined,
  subject: GuideSubject,
  lang: Lang = 'vi',
  limit: number = RELATED_LIMIT,
): RelatedItem[] {
  if (!subject.equipmentKey) return [];
  return others(rows ?? [], subject)
    .filter((r) => equipmentMatchKey(r.equipment) === subject.equipmentKey)
    .sort(byName)
    .slice(0, Math.max(0, limit))
    .map((r) => item(r, subject, lang));
}

/**
 * Bài khác đánh vào ÍT NHẤT MỘT nhóm cơ chung.
 *
 * Trùng nhiều nhóm hơn thì đứng trước: deadlift (`Lưng/Chân`) liên quan tới
 * một bài lưng-và-chân khác nhiều hơn tới một bài chỉ có chân. Hoà thì theo
 * tên, để hai lần mở cùng một bài ra cùng một thứ tự.
 */
export function sameMuscle(
  rows: readonly LibraryRow[] | null | undefined,
  subject: GuideSubject,
  lang: Lang = 'vi',
  limit: number = RELATED_LIMIT,
): RelatedItem[] {
  if (!subject.muscleKeys.length) return [];
  return others(rows ?? [], subject)
    .sort(byName)
    .map((r) => item(r, subject, lang))
    .filter((r) => r.shared > 0)
    /* Sắp theo tên TRƯỚC rồi mới theo số nhóm cơ trùng: `Array.sort` ổn định
       theo đặc tả từ ES2019 (V8 và Hermes đều vậy), nên hai bài trùng bằng
       nhau vẫn ra theo tên. Không dựa vào phép so sánh nào tự nhớ cả hai vế. */
    .sort((a, b) => b.shared - a.shared)
    .slice(0, Math.max(0, limit));
}
