import type { AppLang } from '@/lib/i18n';

/**
 * Localized titles/descriptions for awards and weekly challenges, keyed
 * by the stable award_key / challenge_key. The keys are the source of
 * truth — DB rows keep an English title for reference/history, but
 * every native surface renders through these tables so the language
 * follows the user's setting instead of whatever was stored at grant
 * time. Unknown keys fall back to the stored text.
 */

type Bi = { en: string; vi: string; es: string };

export const AWARD_TEXT: Record<string, { title: Bi; desc: Bi }> = {
  streak_3: {
    title: { en: 'First Spark', vi: 'Khởi Đầu', es: 'Primera Chispa' },
    desc: { en: 'Log 3 days in a row', vi: 'Ghi log 3 ngày liên tiếp', es: 'Registra 3 días seguidos' },
  },
  streak_7: {
    title: { en: 'Golden Week', vi: 'Tuần Vàng', es: 'Semana Dorada' },
    desc: { en: 'Log 7 days in a row', vi: 'Ghi log 7 ngày liên tiếp', es: 'Registra 7 días seguidos' },
  },
  streak_14: {
    title: { en: 'Persistent', vi: 'Kiên Trì', es: 'Persistente' },
    desc: { en: 'Log 14 days in a row', vi: 'Ghi log 14 ngày liên tiếp', es: 'Registra 14 días seguidos' },
  },
  streak_30: {
    title: { en: 'Forged in Steel', vi: 'Thép Đã Tôi', es: 'Forjado en Acero' },
    desc: { en: 'Log 30 days in a row', vi: 'Ghi log 30 ngày liên tiếp', es: 'Registra 30 días seguidos' },
  },
  streak_60: {
    title: { en: 'Two Months Deep', vi: 'Hai Tháng Ròng', es: 'Dos Meses Seguidos' },
    desc: { en: 'Log 60 days in a row', vi: 'Ghi log 60 ngày liên tiếp', es: 'Registra 60 días seguidos' },
  },
  streak_100: {
    title: { en: 'Hundred Days', vi: 'Trăm Ngày', es: 'Cien Días' },
    desc: { en: 'Log 100 days in a row', vi: 'Ghi log 100 ngày liên tiếp', es: 'Registra 100 días seguidos' },
  },
  streak_180: {
    title: { en: 'Half a Year', vi: 'Nửa Năm', es: 'Medio Año' },
    desc: { en: 'Log 180 days in a row', vi: 'Ghi log 180 ngày liên tiếp', es: 'Registra 180 días seguidos' },
  },
  streak_365: {
    title: { en: 'A Full Year', vi: 'Trọn Một Năm', es: 'Un Año Completo' },
    desc: { en: 'Log 365 days in a row', vi: 'Ghi log 365 ngày liên tiếp', es: 'Registra 365 días seguidos' },
  },
  first_workout: {
    title: { en: 'First Step', vi: 'Bước Đầu', es: 'Primer Paso' },
    desc: { en: 'Complete your first workout', vi: 'Hoàn thành buổi tập đầu tiên', es: 'Completa tu primer entrenamiento' },
  },
  workouts_10: {
    title: { en: '10 Workouts', vi: '10 Buổi Tập', es: '10 Entrenamientos' },
    desc: { en: 'Complete 10 workouts', vi: 'Hoàn thành 10 buổi tập', es: 'Completa 10 entrenamientos' },
  },
  workouts_50: {
    title: { en: '50 Workouts', vi: '50 Buổi Tập', es: '50 Entrenamientos' },
    desc: { en: 'Complete 50 workouts', vi: 'Hoàn thành 50 buổi tập', es: 'Completa 50 entrenamientos' },
  },
  workouts_100: {
    title: { en: 'Centurion', vi: 'Centurion', es: 'Centurión' },
    desc: { en: 'Complete 100 workouts', vi: 'Hoàn thành 100 buổi tập', es: 'Completa 100 entrenamientos' },
  },
  first_pr: {
    title: { en: 'New Record!', vi: 'Kỷ Lục Mới!', es: '¡Nuevo Récord!' },
    desc: { en: 'Hit your first PR', vi: 'Đạt PR đầu tiên', es: 'Logra tu primer PR' },
  },
  pr_5: {
    title: { en: '5x PR', vi: '5x PR', es: '5x PR' },
    desc: { en: 'Hit 5 personal records', vi: 'Đạt 5 PR', es: 'Logra 5 récords personales' },
  },
  steps_10k: {
    title: { en: '10K Steps', vi: '10K Steps', es: '10K Pasos' },
    desc: { en: 'Hit 10,000 steps in a day', vi: 'Đạt 10,000 bước trong 1 ngày', es: 'Alcanza 10,000 pasos en un día' },
  },
  steps_15k: {
    title: { en: 'Long Way', vi: 'Đường Dài', es: 'Largo Camino' },
    desc: { en: 'Hit 15,000 steps in a day', vi: 'Đạt 15.000 bước trong 1 ngày', es: 'Alcanza 15,000 pasos en un día' },
  },
  steps_20k: {
    title: { en: 'Twenty Thousand', vi: 'Hai Vạn Bước', es: 'Veinte Mil' },
    desc: { en: 'Hit 20,000 steps in a day', vi: 'Đạt 20.000 bước trong 1 ngày', es: 'Alcanza 20,000 pasos en un día' },
  },

  /* Bốn miền mới. Mô tả nói ĐÚNG điều kiện được kiểm, không nói điều kiện nghe
     hay hơn: "ghi 7 ngày có uống nước" chứ không phải "uống đủ nước 7 ngày",
     vì thứ hệ thống đếm là ngày CÓ GHI, không phải ngày đạt mục tiêu. Một mô
     tả hứa nhiều hơn thứ được kiểm là một lời nói dối chờ người dùng phát
     hiện. */
  first_meal: {
    title: { en: 'First Plate', vi: 'Bữa Đầu Tiên', es: 'Primer Plato' },
    desc: { en: 'Log your first meal', vi: 'Ghi bữa ăn đầu tiên', es: 'Registra tu primera comida' },
  },
  meals_50: {
    title: { en: 'Fifty Plates', vi: 'Năm Mươi Bữa', es: 'Cincuenta Platos' },
    desc: { en: 'Log 50 meals', vi: 'Ghi 50 bữa ăn', es: 'Registra 50 comidas' },
  },
  meals_250: {
    title: { en: 'Kitchen Regular', vi: 'Khách Quen Của Bếp', es: 'Habitual de la Cocina' },
    desc: { en: 'Log 250 meals', vi: 'Ghi 250 bữa ăn', es: 'Registra 250 comidas' },
  },
  water_7: {
    title: { en: 'Seven Springs', vi: 'Bảy Ngày Nước', es: 'Siete Manantiales' },
    desc: { en: 'Log water on 7 days', vi: 'Ghi nước uống trong 7 ngày', es: 'Registra agua durante 7 días' },
  },
  water_30: {
    title: { en: 'Steady Current', vi: 'Dòng Chảy Đều', es: 'Corriente Constante' },
    desc: { en: 'Log water on 30 days', vi: 'Ghi nước uống trong 30 ngày', es: 'Registra agua durante 30 días' },
  },
  water_100: {
    /* 'Water Century', không phải 'Hundred Days of Water': tên dài bị cắt thành
       "Hundred Days of Wa…" trên thẻ nửa bề ngang — thấy trên ảnh chụp, không
       thấy trong tsc. Tên huy chương phải vừa một dòng ở nửa bề ngang màn 402. */
    title: { en: 'Water Century', vi: 'Trăm Ngày Nước', es: 'Siglo del Agua' },
    desc: { en: 'Log water on 100 days', vi: 'Ghi nước uống trong 100 ngày', es: 'Registra agua durante 100 días' },
  },
  sleep_7: {
    title: { en: 'Seven Nights', vi: 'Bảy Đêm', es: 'Siete Noches' },
    desc: { en: 'Log 7 nights of sleep', vi: 'Ghi 7 đêm ngủ', es: 'Registra 7 noches de sueño' },
  },
  sleep_30: {
    title: { en: 'Month of Rest', vi: 'Tháng Yên Giấc', es: 'Mes de Descanso' },
    desc: { en: 'Log 30 nights of sleep', vi: 'Ghi 30 đêm ngủ', es: 'Registra 30 noches de sueño' },
  },
  sleep_100: {
    title: { en: 'Hundred Nights', vi: 'Trăm Đêm', es: 'Cien Noches' },
    desc: { en: 'Log 100 nights of sleep', vi: 'Ghi 100 đêm ngủ', es: 'Registra 100 noches de sueño' },
  },
  weigh_10: {
    title: { en: 'Ten Readings', vi: 'Mười Lần Cân', es: 'Diez Mediciones' },
    desc: { en: 'Log 10 weigh-ins', vi: 'Ghi 10 lần cân', es: 'Registra 10 pesajes' },
  },
  weigh_50: {
    title: { en: 'Steady Hand', vi: 'Tay Đều', es: 'Mano Firme' },
    desc: { en: 'Log 50 weigh-ins', vi: 'Ghi 50 lần cân', es: 'Registra 50 pesajes' },
  },
  weigh_200: {
    title: { en: 'Two Hundred Marks', vi: 'Hai Trăm Vạch', es: 'Doscientas Marcas' },
    desc: { en: 'Log 200 weigh-ins', vi: 'Ghi 200 lần cân', es: 'Registra 200 pesajes' },
  },
};

export const CHALLENGE_TEXT: Record<string, { title: Bi; desc: Bi; reward: Bi }> = {
  workouts_5: {
    title: { en: '5 Workouts', vi: '5 Buổi Tập', es: '5 Entrenamientos' },
    desc: { en: 'Complete 5 workouts this week', vi: 'Hoàn thành 5 buổi tập trong tuần', es: 'Completa 5 entrenamientos esta semana' },
    reward: { en: 'Weekly Warrior', vi: 'Chiến Binh Tuần', es: 'Guerrero Semanal' },
  },
  workouts_3: {
    title: { en: '3 Workouts', vi: '3 Buổi Tập', es: '3 Entrenamientos' },
    desc: { en: 'Complete 3 workouts this week', vi: 'Hoàn thành 3 buổi tập trong tuần', es: 'Completa 3 entrenamientos esta semana' },
    reward: { en: 'Week Starter', vi: 'Bước Đầu Tuần', es: 'Inicio de Semana' },
  },
  protein_7: {
    title: { en: 'Protein 7/7', vi: 'Protein 7/7', es: 'Proteína 7/7' },
    desc: { en: 'Hit your protein target 7 days', vi: 'Đạt mục tiêu protein 7 ngày', es: 'Alcanza tu objetivo de proteína 7 días' },
    reward: { en: 'Protein Master', vi: 'Protein Master', es: 'Maestro de la Proteína' },
  },
  steps_50k: {
    title: { en: '50K Steps', vi: '50K Bước', es: '50K Pasos' },
    desc: { en: 'Walk 50,000 steps this week', vi: 'Đi 50,000 bước trong tuần', es: 'Camina 50,000 pasos esta semana' },
    reward: { en: 'Iron Legs', vi: 'Chân Thép', es: 'Piernas de Hierro' },
  },
  sleep_7: {
    title: { en: 'Sleep 7/7', vi: 'Ngủ Đủ 7/7', es: 'Sueño 7/7' },
    desc: { en: 'Sleep enough 7 days in a row', vi: 'Ngủ đủ giấc 7 ngày liên tiếp', es: 'Duerme lo suficiente 7 días seguidos' },
    reward: { en: 'Golden Sleep', vi: 'Giấc Ngủ Vàng', es: 'Sueño Dorado' },
  },
  log_7: {
    title: { en: 'Log 7/7', vi: 'Log 7/7', es: 'Registro 7/7' },
    desc: { en: 'Log fully all 7 days this week', vi: 'Ghi log đầy đủ 7 ngày trong tuần', es: 'Registra todo los 7 días de esta semana' },
    reward: { en: 'Iron Discipline', vi: 'Kỷ Luật Sắt', es: 'Disciplina de Hierro' },
  },
  calories_5: {
    title: { en: 'On-Target Calories 5/7', vi: 'Đúng Calo 5/7', es: 'Calorías en Objetivo 5/7' },
    desc: { en: 'Hit your calorie target 5 days', vi: 'Đạt mục tiêu calories 5 ngày', es: 'Alcanza tu objetivo de calorías 5 días' },
    reward: { en: 'Clean Eater', vi: 'Ăn Chuẩn', es: 'Comedor Saludable' },
  },
  water_7: {
    title: { en: 'Hydrated 7/7', vi: 'Uống Đủ Nước 7/7', es: 'Hidratado 7/7' },
    desc: { en: 'Hit your water target 7 days', vi: 'Đạt mục tiêu nước 7 ngày', es: 'Alcanza tu objetivo de agua 7 días' },
    reward: { en: 'Hydro Pro', vi: 'Hydro Pro', es: 'Hydro Pro' },
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
