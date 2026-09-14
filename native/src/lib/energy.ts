/**
 * Calo TIÊU HAO của một buổi tập đã ghi — ước lượng, và nói rõ là ước lượng.
 *
 * ── vì sao phải có tệp này ──
 *
 * `workout_sessions` không có cột calo nào, và `daily_logs.active_kcal` thì
 * CHỈ `use-health-sync` ghi. Nên trên một máy không nối Apple Health — kể cả
 * bản dựng `EXPO_FREE_TEST=1`, vốn gỡ hẳn HealthKit — người dùng tập xong,
 * ghi đủ set, mà vòng Move vẫn đứng ở 0 mãi mãi.
 *
 * Và Apple Health một mình cũng không cứu được: đo được rằng iPhone KHÔNG tự
 * sinh ra năng lượng hoạt động cho một buổi tập tạ. Active Energy trên máy
 * không đồng hồ đến từ bộ đồng xử lý chuyển động, tức từ bước chân — mà nâng
 * tạ gần như không đẻ ra bước nào. Muốn Apple Health biết buổi tập gym thì
 * phải có Apple Watch (nó ước lượng theo nhịp tim) hoặc phải có ai đó GHI một
 * `HKWorkout` vào Health. ASCND ghi buổi tập vào cơ sở dữ liệu của chính nó,
 * nên Health không hề biết.
 *
 * ── công thức, và vì sao KHÔNG dùng hằng số 3,5 ──
 *
 * Cách phổ thông là `kcal = MET × 3,5 × kg / 200`. Hằng số 3,5 ml/kg/phút là
 * một mức chuyển hoá nghỉ TRUNG BÌNH của dân số, và chính nhóm tác giả
 * Compendium chỉ ra nó sai lệch có hệ thống: người nặng hơn, nhiều tuổi hơn
 * hoặc ít cơ hơn có mức nghỉ THẤP hơn 3,5, nên công thức ấy thổi phồng con số
 * đúng ở nhóm vốn đã ít vận động nhất. Cách sửa của họ ("corrected METs",
 * Kozey và cộng sự) là biểu diễn MET theo mức nghỉ của CHÍNH người đó.
 *
 * App này đã có sẵn mức nghỉ ấy: `calcBMR` là Mifflin-St Jeor, tính từ cân
 * nặng, chiều cao, tuổi và giới — và chính nó là gốc của mục tiêu calo mà
 * `nutrition-explainer` đang giải thích cho người dùng. Nên ở đây dùng luôn
 * nó, không dựng thêm một đường tính thứ hai cho cùng một đại lượng. (Kozey
 * dùng Harris-Benedict; Mifflin-St Jeor ra đời sau và chính xác hơn trên dân
 * số hiện nay, nên đây là thay thế tốt hơn chứ không phải đi chệch.)
 *
 *     kcal nghỉ mỗi phút = BMR / 1440
 *     calo HOẠT ĐỘNG     = (MET − 1) × kcal nghỉ mỗi phút × số phút
 *
 * ── vì sao là `MET − 1` chứ không phải `MET` ──
 *
 * Vòng Move của iOS, và cột `active_kcal` mà app đang đọc, đều là năng lượng
 * TRÊN MỨC NGHỈ. `MET × …` là tổng, đã bao gồm phần nghỉ. Lấy tổng mà đem
 * cộng vào một chỗ vốn chỉ chứa phần vượt là đếm hai lần đúng phần BMR — mà
 * BMR thì mục tiêu calo hằng ngày đã tính rồi. Một buổi 45 phút ở MET 5 chênh
 * nhau 68 kcal giữa hai cách, và cái sai ấy đi thẳng vào mục tiêu ăn.
 *
 * ── MET lấy ở đâu ──
 *
 * 2024 Adult Compendium of Physical Activities, mục Conditioning Exercise —
 * bản cập nhật thứ ba, 1.114 hoạt động, 82% có MET ĐO ĐƯỢC chứ không ước
 * lượng. Mã và số nguyên văn ở `RT_MET` bên dưới.
 */
import { trainingMinutes } from '@/lib/activity';
import { calcAge, restingKcalPerMin, type Sex } from '@/lib/fitness-calc';

/**
 * MET của tập kháng lực, 2024 Adult Compendium, mục Conditioning Exercise.
 * Giữ nguyên mã hoạt động để ai cũng tra ngược được — một con số không tra
 * được nguồn là một con số sẽ bị ai đó chỉnh cho "hợp lý hơn".
 */
export const RT_MET = {
  /** 02054 — kháng lực, nhiều bài, 8–15 lần ở các mức tạ khác nhau */
  light: 3.5,
  /** 02052 — kháng lực, squat/deadlift, chậm hoặc bung sức */
  moderate: 5.0,
  /** 02050 — tạ tự do/máy, powerlifting hoặc thể hình, gắng sức mạnh */
  vigorous: 6.0,
  /** 02056 — bài dùng trọng lượng cơ thể (squat, lunge, chống đẩy, gập bụng) */
  bodyweight: 3.0,
  /** 02057 — bài trọng lượng cơ thể, cường độ cao */
  bodyweightHard: 6.5,
} as const;

/** Một set như nó nằm trong `workout_sessions.sets` (JSONB tự do). */
export interface EnergySet {
  reps?: number | null;
  weight?: number | null;
}

export interface EnergyProfile {
  weight_kg: number;
  height_cm: number;
  age: number;
  sex: Sex;
}

/**
 * Chọn MET cho một buổi.
 *
 * RPE của buổi (1–10) là thứ DUY NHẤT app có để đọc ra cường độ, và nó đúng
 * là đại lượng dành cho việc đó. Ranh giới đặt ở 5 và 8 vì đó là chỗ thang
 * RPE đổi nghĩa: dưới 5 là còn nhiều lần dự trữ, từ 8 trở lên là gần giới hạn.
 *
 * Buổi KHÔNG có tạ ở set nào thì đi nhánh trọng lượng cơ thể — cùng một RPE
 * nhưng chống đẩy và deadlift không cùng một mức tiêu hao, và Compendium tách
 * hẳn hai mã cho chúng.
 */
export function metForSession(sets: EnergySet[], rpe: number | null | undefined): number {
  const working = sets.filter((s) => Number(s.reps) > 0);
  const loaded = working.some((s) => Number(s.weight) > 0);
  const r = Number(rpe);
  const hard = Number.isFinite(r) && r >= 8;
  if (!loaded) return hard ? RT_MET.bodyweightHard : RT_MET.bodyweight;
  if (!Number.isFinite(r) || r < 5) return RT_MET.light;
  return hard ? RT_MET.vigorous : RT_MET.moderate;
}

/**
 * Calo HOẠT ĐỘNG của một buổi, làm tròn về số nguyên.
 *
 * Trả `null` chứ không trả 0 khi thiếu thứ để tính. Đó là cùng một luật mà
 * `A11` đã bắt app phải theo: `0` là một phép ĐO nói rằng không tiêu hao gì,
 * còn "chưa đủ dữ liệu" là một chuyện khác, và vẽ 0 cho nó là nói sai.
 */
export function sessionActiveKcal(
  sets: EnergySet[],
  rpe: number | null | undefined,
  minutes: number,
  p: EnergyProfile | null | undefined,
): number | null {
  if (!p) return null;
  const { weight_kg, height_cm, age, sex } = p;
  if (!(weight_kg > 0) || !(height_cm > 0) || !(age > 0)) return null;
  if (!(minutes > 0)) return null;
  /* Mức nghỉ lấy từ `fitness-calc`, không tự tính ở đây: `profile-onboarding`
     giữ luật rằng chuỗi "cơ thể → con số" chỉ được sống một chỗ, và lý do là
     hai bản chép tay của nó đã lệch nhau một lần rồi. */
  const rest = restingKcalPerMin({ weight_kg, height_cm, age, sex });
  if (rest == null) return null;
  const met = metForSession(sets, rpe);
  return Math.round((met - 1) * rest * minutes);
}

/*
  ── KHÔNG có hàm "gộp Health với ước lượng" ở đây, và đó là cố ý ──

  Luật "đo trước, ước lượng thay thế, thẻ nói rõ là cái nào" đã sống ở
  `lib/activity.ts` cho vòng Exercise từ trước, kèm lý do viết sẵn. Vòng Move
  nay dùng LẠI đúng luật ấy ở đúng chỗ ấy, chứ không có một bản thứ hai ở đây.

  Hai công thức cho một đại lượng thì trôi, và `trainingMinutes` ngay trong
  tệp ấy đã ghi lại lần trôi đó trông như thế nào: một kế hoạch hứa 45 phút
  còn nhật ký báo 38 cho cùng một buổi tập.
*/

/**
 * Hàng `profiles` → `EnergyProfile`, hoặc `null` khi chưa đủ.
 *
 * Cùng một luật mà `planFromEntry` đã đặt cho mục tiêu calo: thiếu chiều cao,
 * cân nặng hay ngày sinh thì KHÔNG có con số, chứ không phải có một con số
 * dựng từ mặc định. Cả cái chặn tuổi 0–130 cũng lấy y nguyên từ đó — một `dob`
 * năm 2199 ghi thẳng vào cột được, và nó phải chết ở đây chứ không đi tiếp
 * thành một ước lượng âm.
 */
export function energyProfileFrom(
  row:
    | { weight_kg?: number | null; height_cm?: number | null; dob?: string | null; sex?: string | null }
    | null
    | undefined,
): EnergyProfile | null {
  if (!row) return null;
  const weight_kg = Number(row.weight_kg);
  const height_cm = Number(row.height_cm);
  if (!(weight_kg > 0) || !(height_cm > 0) || !row.dob) return null;
  const age = calcAge(row.dob);
  if (!Number.isFinite(age) || age < 0 || age > 130) return null;
  const sex: Sex = row.sex === 'female' ? 'female' : row.sex === 'male' ? 'male' : 'other';
  return { weight_kg, height_cm, age, sex };
}

/**
 * Calo hoạt động của MỘT hàng `workout_sessions`, tính thẳng từ hàng ấy.
 *
 * Tồn tại để chỉ có MỘT chỗ biết cách đi từ một hàng buổi tập tới một con số
 * calo: hook của màn Hôm nay và danh sách buổi tập đều gọi nó. Hai chỗ tự tính
 * là hai công thức cho một đại lượng, và `trainingMinutes` trong `activity.ts`
 * đã ghi lại lần trôi kiểu ấy trông như thế nào.
 *
 * `sets` là JSONB TỰ DO: một hàng có thể chứa bất cứ thứ gì, kể cả không phải
 * mảng. Chỗ này phải tự chặn, đúng như `useTodayTrainingMinutes` đã chặn.
 */
export function sessionKcalOf(
  row: { sets?: unknown; session_rpe?: number | null } | null | undefined,
  p: EnergyProfile | null,
): number | null {
  if (!row || !p) return null;
  const sets = Array.isArray(row.sets) ? (row.sets as EnergySet[]) : [];
  return sessionActiveKcal(sets, row.session_rpe, trainingMinutes(sets), p);
}
