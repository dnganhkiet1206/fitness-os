import type { AppLang } from '@/lib/i18n';

/**
 * Localized titles/descriptions for awards and weekly challenges, keyed
 * by the stable award_key / challenge_key. The keys are the source of
 * truth — DB rows keep an English title for reference/history, but
 * every native surface renders through these tables so the language
 * follows the user's setting instead of whatever was stored at grant
 * time. Unknown keys fall back to the stored text.
 */

type Bi = { en: string; vi: string };

export const AWARD_TEXT: Record<string, { title: Bi; desc: Bi }> = {
  streak_3: {
    title: { en: 'First Spark', vi: 'Khởi Đầu' },
    desc: { en: 'Log 3 days in a row', vi: 'Ghi log 3 ngày liên tiếp' },
  },
  streak_7: {
    title: { en: 'Golden Week', vi: 'Tuần Vàng' },
    desc: { en: 'Log 7 days in a row', vi: 'Ghi log 7 ngày liên tiếp' },
  },
  streak_14: {
    title: { en: 'Persistent', vi: 'Kiên Trì' },
    desc: { en: 'Log 14 days in a row', vi: 'Ghi log 14 ngày liên tiếp' },
  },
  streak_30: {
    title: { en: 'Forged in Steel', vi: 'Thép Đã Tôi' },
    desc: { en: 'Log 30 days in a row', vi: 'Ghi log 30 ngày liên tiếp' },
  },
  streak_60: {
    title: { en: 'Two Months Deep', vi: 'Hai Tháng Ròng' },
    desc: { en: 'Log 60 days in a row', vi: 'Ghi log 60 ngày liên tiếp' },
  },
  streak_100: {
    title: { en: 'Hundred Days', vi: 'Trăm Ngày' },
    desc: { en: 'Log 100 days in a row', vi: 'Ghi log 100 ngày liên tiếp' },
  },
  streak_180: {
    title: { en: 'Half a Year', vi: 'Nửa Năm' },
    desc: { en: 'Log 180 days in a row', vi: 'Ghi log 180 ngày liên tiếp' },
  },
  streak_365: {
    title: { en: 'A Full Year', vi: 'Trọn Một Năm' },
    desc: { en: 'Log 365 days in a row', vi: 'Ghi log 365 ngày liên tiếp' },
  },
  first_workout: {
    title: { en: 'First Step', vi: 'Bước Đầu' },
    desc: { en: 'Complete your first workout', vi: 'Hoàn thành buổi tập đầu tiên' },
  },
  workouts_10: {
    title: { en: '10 Workouts', vi: '10 Buổi Tập' },
    desc: { en: 'Complete 10 workouts', vi: 'Hoàn thành 10 buổi tập' },
  },
  workouts_50: {
    title: { en: '50 Workouts', vi: '50 Buổi Tập' },
    desc: { en: 'Complete 50 workouts', vi: 'Hoàn thành 50 buổi tập' },
  },
  workouts_100: {
    title: { en: 'Centurion', vi: 'Centurion' },
    desc: { en: 'Complete 100 workouts', vi: 'Hoàn thành 100 buổi tập' },
  },
  first_pr: {
    title: { en: 'New Record!', vi: 'Kỷ Lục Mới!' },
    desc: { en: 'Hit your first PR', vi: 'Đạt PR đầu tiên' },
  },
  pr_5: {
    title: { en: '5x PR', vi: '5x PR' },
    desc: { en: 'Hit 5 personal records', vi: 'Đạt 5 PR' },
  },
  steps_10k: {
    title: { en: '10K Steps', vi: '10K Steps' },
    desc: { en: 'Hit 10,000 steps in a day', vi: 'Đạt 10,000 bước trong 1 ngày' },
  },
  steps_15k: {
    title: { en: 'Long Way', vi: 'Đường Dài' },
    desc: { en: 'Hit 15,000 steps in a day', vi: 'Đạt 15.000 bước trong 1 ngày' },
  },
  steps_20k: {
    title: { en: 'Twenty Thousand', vi: 'Hai Vạn Bước' },
    desc: { en: 'Hit 20,000 steps in a day', vi: 'Đạt 20.000 bước trong 1 ngày' },
  },

  /* Bốn miền mới. Mô tả nói ĐÚNG điều kiện được kiểm, không nói điều kiện nghe
     hay hơn: "ghi 7 ngày có uống nước" chứ không phải "uống đủ nước 7 ngày",
     vì thứ hệ thống đếm là ngày CÓ GHI, không phải ngày đạt mục tiêu. Một mô
     tả hứa nhiều hơn thứ được kiểm là một lời nói dối chờ người dùng phát
     hiện. */
  first_meal: {
    title: { en: 'First Plate', vi: 'Bữa Đầu Tiên' },
    desc: { en: 'Log your first meal', vi: 'Ghi bữa ăn đầu tiên' },
  },
  meals_50: {
    title: { en: 'Fifty Plates', vi: 'Năm Mươi Bữa' },
    desc: { en: 'Log 50 meals', vi: 'Ghi 50 bữa ăn' },
  },
  meals_250: {
    title: { en: 'Kitchen Regular', vi: 'Khách Quen Của Bếp' },
    desc: { en: 'Log 250 meals', vi: 'Ghi 250 bữa ăn' },
  },
  water_7: {
    title: { en: 'Seven Springs', vi: 'Bảy Ngày Nước' },
    desc: { en: 'Log water on 7 days', vi: 'Ghi nước uống trong 7 ngày' },
  },
  water_30: {
    title: { en: 'Steady Current', vi: 'Dòng Chảy Đều' },
    desc: { en: 'Log water on 30 days', vi: 'Ghi nước uống trong 30 ngày' },
  },
  water_100: {
    title: { en: 'Hundred Days of Water', vi: 'Trăm Ngày Nước' },
    desc: { en: 'Log water on 100 days', vi: 'Ghi nước uống trong 100 ngày' },
  },
  sleep_7: {
    title: { en: 'Seven Nights', vi: 'Bảy Đêm' },
    desc: { en: 'Log 7 nights of sleep', vi: 'Ghi 7 đêm ngủ' },
  },
  sleep_30: {
    title: { en: 'Month of Rest', vi: 'Tháng Yên Giấc' },
    desc: { en: 'Log 30 nights of sleep', vi: 'Ghi 30 đêm ngủ' },
  },
  sleep_100: {
    title: { en: 'Hundred Nights', vi: 'Trăm Đêm' },
    desc: { en: 'Log 100 nights of sleep', vi: 'Ghi 100 đêm ngủ' },
  },
  weigh_10: {
    title: { en: 'Ten Readings', vi: 'Mười Lần Cân' },
    desc: { en: 'Log 10 weigh-ins', vi: 'Ghi 10 lần cân' },
  },
  weigh_50: {
    title: { en: 'Steady Hand', vi: 'Tay Đều' },
    desc: { en: 'Log 50 weigh-ins', vi: 'Ghi 50 lần cân' },
  },
  weigh_200: {
    title: { en: 'Two Hundred Marks', vi: 'Hai Trăm Vạch' },
    desc: { en: 'Log 200 weigh-ins', vi: 'Ghi 200 lần cân' },
  },
};

export const CHALLENGE_TEXT: Record<string, { title: Bi; desc: Bi; reward: Bi }> = {
  workouts_5: {
    title: { en: '5 Workouts', vi: '5 Buổi Tập' },
    desc: { en: 'Complete 5 workouts this week', vi: 'Hoàn thành 5 buổi tập trong tuần' },
    reward: { en: 'Weekly Warrior', vi: 'Chiến Binh Tuần' },
  },
  workouts_3: {
    title: { en: '3 Workouts', vi: '3 Buổi Tập' },
    desc: { en: 'Complete 3 workouts this week', vi: 'Hoàn thành 3 buổi tập trong tuần' },
    reward: { en: 'Week Starter', vi: 'Bước Đầu Tuần' },
  },
  protein_7: {
    title: { en: 'Protein 7/7', vi: 'Protein 7/7' },
    desc: { en: 'Hit your protein target 7 days', vi: 'Đạt mục tiêu protein 7 ngày' },
    reward: { en: 'Protein Master', vi: 'Protein Master' },
  },
  steps_50k: {
    title: { en: '50K Steps', vi: '50K Bước' },
    desc: { en: 'Walk 50,000 steps this week', vi: 'Đi 50,000 bước trong tuần' },
    reward: { en: 'Iron Legs', vi: 'Chân Thép' },
  },
  sleep_7: {
    title: { en: 'Sleep 7/7', vi: 'Ngủ Đủ 7/7' },
    desc: { en: 'Sleep enough 7 days in a row', vi: 'Ngủ đủ giấc 7 ngày liên tiếp' },
    reward: { en: 'Golden Sleep', vi: 'Giấc Ngủ Vàng' },
  },
  log_7: {
    title: { en: 'Log 7/7', vi: 'Log 7/7' },
    desc: { en: 'Log fully all 7 days this week', vi: 'Ghi log đầy đủ 7 ngày trong tuần' },
    reward: { en: 'Iron Discipline', vi: 'Kỷ Luật Sắt' },
  },
  calories_5: {
    title: { en: 'On-Target Calories 5/7', vi: 'Đúng Calo 5/7' },
    desc: { en: 'Hit your calorie target 5 days', vi: 'Đạt mục tiêu calories 5 ngày' },
    reward: { en: 'Clean Eater', vi: 'Ăn Chuẩn' },
  },
  water_7: {
    title: { en: 'Hydrated 7/7', vi: 'Uống Đủ Nước 7/7' },
    desc: { en: 'Hit your water target 7 days', vi: 'Đạt mục tiêu nước 7 ngày' },
    reward: { en: 'Hydro Pro', vi: 'Hydro Pro' },
  },
};

/** Localized award title/desc by key, with stored text as fallback */
export function awardText(
  key: string | null | undefined,
  lang: AppLang,
  fallback?: { title?: string | null; desc?: string | null },
): { title: string; desc: string } {
  const entry = key ? AWARD_TEXT[key] : undefined;
  return {
    title: entry ? entry.title[lang] : fallback?.title ?? '',
    desc: entry ? entry.desc[lang] : fallback?.desc ?? '',
  };
}

/** Localized challenge title/desc/reward by key, with stored text fallback */
export function challengeText(
  key: string | null | undefined,
  lang: AppLang,
  fallback?: { title?: string | null; desc?: string | null },
): { title: string; desc: string } {
  const entry = key ? CHALLENGE_TEXT[key] : undefined;
  return {
    title: entry ? entry.title[lang] : fallback?.title ?? '',
    desc: entry ? entry.desc[lang] : fallback?.desc ?? '',
  };
}
