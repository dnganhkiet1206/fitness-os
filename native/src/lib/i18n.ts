export type AppLang = 'vi' | 'en' | 'es';
export type CurrencyCode = 'VND' | 'USD' | 'EUR' | 'GBP' | 'KRW';

export const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: 'VND', symbol: '₫', label: 'VND (₫)' },
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'KRW', symbol: '₩', label: 'KRW (₩)' },
];

export const LANGUAGES: { code: AppLang; label: string; flag: string }[] = [
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];

export function formatPrice(value: number, currency: CurrencyCode): string {
  const cur = CURRENCIES.find(c => c.code === currency);
  if (!cur) return `${value}`;
  if (currency === 'VND') return `${Math.round(value).toLocaleString()}${cur.symbol}`;
  if (currency === 'KRW') return `${cur.symbol}${Math.round(value).toLocaleString()}`;
  return `${cur.symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getLocale(lang: AppLang): string {
  const map: Record<AppLang, string> = { vi: 'vi-VN', en: 'en-US', es: 'es-ES' };
  return map[lang];
}

// ── Translation keys ──
interface Translations {
  // Common
  loading: string;
  save: string;
  saving: string;
  cancel: string;
  delete: string;
  deleted: string;
  add: string;
  edit: string;
  close: string;
  search: string;
  back: string;
  next: string;
  previous: string;
  confirm: string;
  error: string;
  success: string;
  noData: string;
  today: string;
  target: string;
  all: string;
  other: string;
  settings: string;
  

  // Auth
  authForgotPassword: string;
  authResetPassword: string;
  authResetSent: string;
  authBackToLogin: string;

  // Sidebar / Nav
  navToday: string;
  navNutrition: string;
  navWorkouts: string;
  navProgress: string;
  navSmartGoals: string;

  // Dashboard
  dashReadiness: string;
  dashReadinessMsg: string;
  logBioBaselineNote: string;
  logSleepReplaceGone: string;
  sleepNoteAlignedGood: string;
  sleepNoteAlignedPoor: string;
  sleepNoteFeltWorse: string;
  sleepNoteFeltBetter: string;
  sleepNoteScoreIsDuration: string;
  dashNutrition: string;
  dashNutritionMsg: string;
  dashSleep: string;
  dashSleepMsg: string;

  // Workout Status
  workoutStatusTitle: string;
  workoutStatusDone: string;
  workoutStatusNotYet: string;

  // Settings
  settingsTitle: string;
  settingsTheme: string;
  settingsThemeLight: string;
  settingsThemeDark: string;
  settingsThemeSystem: string;
  settingsLanguage: string;
  settingsLanguageDesc: string;
  settingsLanguageSheetTitle: string;
  settingsLanguageSheetSubtitle: string;
  settingsLangSystem: string;
  settingsLangSystemDesc: string;
  settingsCancel: string;
  settingsThemeSheetTitle: string;
  settingsThemeSheetSubtitle: string;
  settingsThemeLightDesc: string;
  settingsThemeDarkDesc: string;
  settingsThemeSystemDesc: string;
  settingsPersonalInfo: string;
  settingsName: string;
  settingsDob: string;
  settingsSex: string;
  settingsSexMale: string;
  settingsSexFemale: string;
  settingsSexOther: string;
  settingsHeight: string;
  settingsWeight: string;
  settingsActivityLevel: string;
  settingsGoal: string;
  settingsWaterTarget: string;
  settingsSleepTarget: string;
  settingsSleepHours: string;
  settingsBedtime: string;
  settingsWakeTime: string;
  settingsExportData: string;
  settingsExportDesc: string;
  settingsChangePassword: string;
  settingsNewPassword: string;
  settingsConfirmPassword: string;
  settingsPasswordChanged: string;
  settingsPasswordMismatch: string;
  settingsRecalcTargets: string;
  settingsRecalcDone: string;

  // Activity levels
  activitySedentary: string;
  activityLight: string;
  activityModerate: string;
  activityHigh: string;
  activityAthlete: string;
  /* How often you train, appended to each activity chip. The multipliers
     1.2/1.375/1.55/1.725/1.9 have these standard definitions, and the app was
     showing the five bare adjectives without them — so nothing on screen said
     whether "Ít vận động" was about your job or your training. */
  activityFreqSedentary: string;
  activityFreqLight: string;
  activityFreqModerate: string;
  activityFreqHigh: string;
  activityFreqAthlete: string;
  /** The sentence that answers "why did my calories not go up after training". */
  activityIncludesTraining: string;

  // Goals
  goalBulk: string;
  goalCut: string;
  goalMaintain: string;
  goalRecomp: string;
  goalStrength: string;
  goalEndurance: string;

  // Nutrition page
  nutritionTitle: string;
  nutritionFoods: string;
  nutritionMealPlan: string;
  nutritionSearchFood: string;
  nutritionRecent: string;
  nutritionCreatePlan: string;
  nutritionPlanName: string;
  nutritionMealsPerDay: string;

  // Meal plan
  mealPlanTitle: string;
  mealBreakfast: string;
  mealLunch: string;
  mealDinner: string;
  mealSnack: string;
  mealType: string;

  // Supplements
  supplementsAddTitle: string;
  supplementsName: string;
  supplementsDose: string;
  supplementsTiming: string;
  supplementsTimMorning: string;
  supplementsTimPreWorkout: string;
  supplementsTimPostWorkout: string;
  supplementsTimWithMeal: string;
  supplementsTimBeforeBed: string;

  // Sleep
  sleepTitle: string;
  sleepAvgQuality: string;
  sleepAvgDeep: string;
  sleepDebt: string;
  sleepInsights: string;
  sleepNoData: string;
  sleepNoDataMsg: string;
  sleepOk: string;
  sleepDeep: string;

  // Workouts
  workoutsTitle: string;
  workoutsExercises: string;
  workoutsCreateNew: string;
  workoutsNoTemplates: string;
  workoutsExercisesAdded: string;
  workoutsVolume: string;

  // Exercise Library
  exercisesAdd: string;
  exercisesAddTitle: string;
  exercisesSearch: string;
  exercisesName: string;
  exercisesMuscleGroup: string;
  exercisesEquipment: string;
  exercisesAddBtn: string;

  // Progress
  progressWeight: string;
  progressMeasurements: string;
  progressPhotos: string;
  progressCurrent: string;
  progressChange: string;
  progressRecords: string;
  progressWeightChart: string;
  progressMeasurementTrend: string;
  progressMeasurementHistory: string;
  progressDeleteMeasurement: string;
  progressDeleteMeasurementBody: string;
  progressAddMeasurement: string;
  progressDate: string;
  progressNoMeasurements: string;
  progressNoPhotos: string;
  progressSaved: string;

  // Biometrics
  biometricsTitle: string;
  biometricsManual: string;
  biometricsNoData: string;
  biometricsNoDataMsg: string;
  biometricsHeartRate: string;
  biometricsBreathRate: string;
  biometricsBloodOxygen: string;
  /** đơn vị nhịp thở — "rpm" là vòng/phút của động cơ, không phải hơi thở */
  biometricsBreathUnit: string;
  biometricsDisclaimer1: string;

  // Log Biometrics Dialog
  logBioTitle: string;
  logBioHR: string;
  logBioHRV: string;
  logBioSpO2: string;
  logBioVO2: string;
  logBioResp: string;
  logBioSaved: string;
  /** Ghi chú dưới các ô mà Apple Health đã điền sẵn. */
  healthOwnedNote: string;
  /* Morning check-in (P0-1): optional soreness scale + illness toggle. */
  nCxLogBioSoreness: string;
  nCxLogBioSorenessHint: string;
  nCxLogBioIllness: string;
  /* Widget payloads (P0-2): pushed to iOS widgets via widget-data.ts. */
  nCxWidgetRestDay: string;
  nCxWidgetDone: string;
  nCxWidgetNoWorkout: string;
  /* Lần tập gần nhất của mẫu tập — hiện trên thẻ template. */
  nCxLastTrained: string;
  nCxTrainedToday: string;
  nCxTrainedYesterday: string;
  /** `{n}` là số ngày. */
  nCxTrainedDaysAgo: string;
  nCxNeverTrained: string;
  /** Tiêu đề hộp thoại khi người dùng sửa một số của Apple Health. */
  healthOverrideTitle: string;
  /** Thân hộp thoại ấy. `{n}` là số chỉ số đang bị đổi. */
  healthOverrideMsg: string;
  /** Nút xác nhận trong hộp thoại ấy. */
  healthOverrideConfirm: string;
  /** Shown under a field whose value is outside anything a body produces. Carries {min}, {max}, {unit}. */
  outOfRange: string;
  /** Refusing to work out a plan for a body nobody has described yet. */
  statsRequired: string;
  /** Sleep stages adding up to more than the night itself. Carries {sum}, {total}. */
  sleepStagesOverrun: string;

  // Log Meal Dialog
  logMealSaved: string;
  logMealQueued: string;

  // Log Workout Dialog
  logWorkoutSaved: string;

  // Log Sleep Dialog
  logSleepDeep: string;
  logSleepREM: string;
  logSleepLight: string;
  logSleepSaved: string;
  logSleepMinutes: string;

  // Awards
  awardsTitle: string;
  awardsEarned: string;
  awardsOf: string;

  // Weekly Review
  weeklyReviewTitle: string;
  weeklyReviewAvgCalories: string;
  weeklyReviewAvgProtein: string;
  weeklyReviewAvgSleep: string;
  weeklyReviewVolume: string;
  weeklyReviewReadiness: string;
  weeklyReviewDailyNutrition: string;
  weeklyReviewSleepChart: string;
  nCxWeeklyReviewVolumeLoad: string;
  weeklyReviewReadinessChart: string;
  weeklyReviewRecommendations: string;
  weeklyReviewSessions: string;

  // Smart Goals
  smartGoalsTitle: string;
  smartGoalsWeightTrend: string;
  smartGoalsOnTrack: string;
  smartGoalsOffTrack: string;
  smartGoalsCalorieSuggestion: string;
  smartGoalsMeasured: string;
  smartGoalsNeedData: string;
  smartGoalsNeedDataMsg: string;
  smartGoalsProteinCoach: string;
  smartGoalsPerDay: string;
  smartGoalsPerMeal: string;
  smartGoalsLowDays: string;
  smartGoalsProteinSplit: string;
  smartGoalsNoNutritionData: string;

  // AI Coach
  aiCoachTitle: string;
  aiCoachHello: string;
  aiCoachIntro: string;
  aiCoachPlaceholder: string;
  aiCoachHistory: string;
  aiCoachNoHistory: string;

  // Grocery
  grocerySubtitle: string;

  /* ── onboarding 13 màn (Giai đoạn 3) ── */
  obBack: string;
  obNext: string;
  obDragHint: string;
  obStart: string;
  obIntentionQ: string;
  obIntentionWhy: string;
  obBranchBody: string;
  obBranchBodyDesc: string;
  obBranchCapacity: string;
  obBranchCapacityDesc: string;
  obBranchMaintain: string;
  obBranchMaintainDesc: string;
  obGoalQ: string;
  obGoalBulk: string;
  obGoalBulkDesc: string;
  obGoalCut: string;
  obGoalCutDesc: string;
  obGoalRecomp: string;
  obGoalRecompDesc: string;
  obGoalStrength: string;
  obGoalStrengthDesc: string;
  obGoalEndurance: string;
  obGoalEnduranceDesc: string;
  obSexQ: string;
  obSexWhy: string;
  obSexMale: string;
  obSexFemale: string;
  obSexOther: string;
  obDobQ: string;
  obDobWhy: string;
  obDobBad: string;
  obHeightQ: string;
  obHeightWhy: string;
  obWeightQ: string;
  obActivityQ: string;
  obActivityWhy: string;
  obActSedentary: string;
  obActSedentaryDesc: string;
  obActLight: string;
  obActLightDesc: string;
  obActModerate: string;
  obActModerateDesc: string;
  obActHigh: string;
  obActHighDesc: string;
  obActAthlete: string;
  obActAthleteDesc: string;
  obExpQ: string;
  obExpWhy: string;
  obExpNew: string;
  obExpNewDesc: string;
  obExpSteady: string;
  obExpSteadyDesc: string;
  obExpDeep: string;
  obExpDeepDesc: string;
  obPlanEyebrow: string;
  obPlanFor: string;
  obPlanMacros: string;
  obPlanWater: string;
  obPlanSleep: string;
  obPlanRank: string;
  obHealthQ: string;
  obHealthChart: string;
  obHealthRead1: string;
  obHealthRead2: string;
  obHealthRead3: string;
  obHealthRead4: string;
  obHealthConnect: string;
  obHealthLater: string;
  obHealthLegal: string;
  obReadyEyebrow: string;
  obReadyLine: string;
  obReadyCta: string;
  obReadyLegal: string;

  /*
    Mười hai khoá mang tiền tố `onboarding` mà onboarding gần như không dựng:
    `onboardingHealthWhy` là của màn 12, mười một khoá còn lại là nhãn của
    **Sửa hồ sơ**. Cái tên nói dối, và nó nói dối vì luồng bảy màn cũ đã sinh
    ra chúng — luồng ấy bị thay, còn chỗ dựng chúng thì không.

    Không đổi tên trong lượt này, có chủ ý: một cú đổi tên chạm hai cột từ
    điển và hai màn, mà không sửa một lỗi nào người dùng nhìn thấy được. Ghi
    lại ở đây để người sau đọc `onboarding*` còn biết tiền tố ấy KHÔNG phải
    một lời hứa về nơi khoá được dựng.
  */
  onboardingHealthWhy: string;
  onboardingTrainingLevel: string;
  onboardingBeginner: string;
  onboardingIntermediate: string;
  onboardingAdvanced: string;
  onboardingDiet: string;
  onboardingAllergies: string;
  onboardingDislikedFoods: string;
  onboardingDietOmnivore: string;
  onboardingDietVegetarian: string;
  onboardingDietHalal: string;
  onboardingDislikedFoodsPlaceholder: string;

  // Muscle groups
  muscleChest: string;
  muscleBack: string;
  muscleShoulders: string;
  muscleBiceps: string;
  muscleTriceps: string;
  muscleQuads: string;
  muscleHamstrings: string;
  muscleGlutes: string;
  muscleAbs: string;
  muscleFullBody: string;
  muscleCardio: string;

  // Measurements
  measureNeck: string;
  measureShoulders: string;
  measureChest: string;
  measureWaist: string;
  measureHips: string;
  measureBicepL: string;
  measureBicepR: string;
  measureThighL: string;
  measureThighR: string;
  measureCalfL: string;
  measureCalfR: string;
  measureBodyFat: string;

  // Dashboard components
  dcActivity: string;
  dcActivityMove: string;
  dcActivityExercise: string;
  dcActivitySteps: string;
  dcActivityKcal: string;
  dcActivityMin: string;
  dcActivityStepsUnit: string;
  dcActivityEmpty: string;
  dcActivityEstimated: string;
  dcNutritionTitle: string;
  dcNutritionTarget: string;
  dcNutritionRemaining: string;
  /** macro tiles, tapped: still to eat / exactly met / eaten past */
  dcMacroLeft: string;
  dcMacroDone: string;
  dcMacroOver: string;
  dcMacroEaten: string;
  /** eaten past the target */
  dcNutritionSurplus: string;
  /** still under the target — the same number as "remaining", named for the diet */
  /** exactly on target, so neither word applies */
  dcNutritionOnTarget: string;
  dcSleepTitle: string;
  dcSleepTarget: string;
  dcSleepQuality: string;
  dcBioTitle: string;
  dcBioNotConnected: string;
  /** nhóm thứ hai của thẻ: VO₂max là năng lực thể lực, không phải dấu hiệu sinh tồn */
  dcBioFitness: string;
  dcReadinessTitle: string;
  dcReadinessTrain: string;
  dcReadinessModerate: string;
  dcReadinessRecover: string;
  dcTrainingTitle: string;
  dcRecentAwards: string;
  dcViewAll: string;

  // Food Item CRUD
  foodAddTitle: string;
  foodEditTitle: string;
  foodName: string;
  foodNamePlaceholder: string;
  foodBrand: string;
  foodBrandPlaceholder: string;
  foodServing: string;
  foodCalories: string;
  foodAutoCalc: string;
  foodProtein: string;
  foodCarbs: string;
  foodFat: string;
  foodFiber: string;
  foodAdded: string;
  foodUpdated: string;
  foodDeleted: string;
  foodAddCustom: string;

  // Steps
  stepsGoal: string;
}

/* Từ điển tiếng Tây Ban Nha (es).
   ĐẶT Ở ĐÂY (ngay trước dict vi), KHÔNG di chuyển: gate `native/tools/i18n.mjs`
   đọc block từ điển bằng cách cắt từ marker vi đến marker en và từ marker en
   đến hết file — nếu dict es nằm giữa vi/en hoặc sau en, gate sẽ đọc nhầm
   block và báo sai. Khi thêm key mới, thêm vào cả ba dict vi/en/es. */
const es: Translations = {
  // Common
  loading: 'Cargando...',
  save: 'Guardar',
  saving: 'Guardando...',
  cancel: 'Cancelar',
  delete: 'Eliminar',
  deleted: 'Eliminado',
  add: 'Añadir',
  edit: 'Editar',
  close: 'Cerrar',
  search: 'Buscar',
  back: 'Atrás',
  next: 'Siguiente',
  previous: 'Anterior',
  confirm: 'Confirmar',
  error: 'Error',
  success: 'Éxito',
  noData: 'Sin datos todavía',
  today: 'Hoy',
  target: 'Objetivo',
  all: 'Todo',
  other: 'Otro',
  settings: 'Ajustes',

  // Auth
  authForgotPassword: '¿Olvidaste tu contraseña?',
  authResetPassword: 'Restablecer contraseña',
  authResetSent: '¡Revisa tu correo para restablecer tu contraseña!',
  authBackToLogin: 'Volver al inicio de sesión',

  // Sidebar / Nav
  navToday: 'Hoy',
  navNutrition: 'Nutrición',
  navWorkouts: 'Entrenamientos',
  navProgress: 'Progreso',
  navSmartGoals: 'Calibración de objetivos',

  // Dashboard
  dashReadiness: 'Preparación',
  /* Bốn nhận xét, mỗi cái đứng trên HAI con số cùng lúc — xem các mục tiếng
     Việt. Không cái nào chẩn đoán gì. */
  sleepNoteAlignedGood: 'Horas suficientes y te sentiste bien — ambas coinciden.',
  sleepNoteAlignedPoor:
    '{short} {short:minuto|minutos} menos de tu objetivo, y lo notaste — ambas coinciden. Acuéstate más temprano esta noche.',
  sleepNoteFeltWorse:
    'Horas suficientes, pero aun así te sentiste cansado. La duración no es lo único que hace una buena noche; vale la pena notarlo si se repite.',
  sleepNoteFeltBetter:
    'Te sentiste bien, aunque anoche dormiste {short} {short:minuto|minutos} menos. La puntuación del sueño se basa en la DURACIÓN, así que sale más baja de lo que sientes.',
  sleepNoteScoreIsDuration: 'Tu propia valoración de calidad no forma parte de la puntuación — solo genera este comentario.',
  logSleepReplaceGone:
    'No se pudo actualizar esta noche — quizá se eliminó en otro dispositivo. Cierra y regístrala de nuevo.',
  logBioBaselineNote:
    'La FC en reposo y la HRV se puntúan contra tu propia base, así que se necesitan 5 lecturas en 28 días antes de que aparezcan en la tarjeta de preparación. Ingresarlas a mano cuenta igual que Apple Health — no necesitas reloj.',
  /* Xem mục tiếng Việt để biết vì sao "3+ days" là ba khẳng định sai trong một
     dòng. Vẫn ba cánh cửa, vẫn những con số ấy, do `tools/readiness-copy.mjs`
     đối chiếu với engine và gate. */
  dashReadinessMsg:
    'Aún no hay datos suficientes. UNA de estas tres cosas te da una puntuación: un entrenamiento con series registradas, una noche de sueño registrada o 5 lecturas de FC en reposo/HRV en 28 días. Las comidas y las calorías no forman parte de esta puntuación.',
  dashNutrition: 'Nutrición',
  dashNutritionMsg: 'No hay comidas registradas hoy. Toca para abrir tu diario.',
  dashSleep: 'Sueño',
  dashSleepMsg: 'No hay sueño registrado. Toca para registrarlo.',

  // Workout Status
  workoutStatusTitle: 'Entrenamientos de hoy',
  workoutStatusDone: '¡Completado!',
  workoutStatusNotYet: 'Sin empezar',

  // Settings
  settingsTitle: 'Ajustes',
  settingsTheme: 'Apariencia',
  settingsThemeLight: 'Claro',
  settingsThemeDark: 'Oscuro',
  settingsThemeSystem: 'Sistema',
  settingsLanguage: 'Idioma',
  settingsLanguageDesc: 'Idioma de visualización de ASCND',
  settingsLanguageSheetTitle: 'Idioma',
  settingsLanguageSheetSubtitle: 'Elige el idioma de visualización de ASCND',
  settingsLangSystem: 'Sistema',
  settingsLangSystemDesc: 'Usar el idioma del iPhone',
  settingsCancel: 'Cancelar',
  settingsThemeSheetTitle: 'Apariencia',
  settingsThemeSheetSubtitle: 'Elige la apariencia de ASCND',
  settingsThemeLightDesc: 'Interfaz clara, ideal con mucha luz',
  settingsThemeDarkDesc: 'Interfaz oscura, más cómoda en la oscuridad',
  settingsThemeSystemDesc: 'Cambia automáticamente con el dispositivo',
  settingsPersonalInfo: 'Información personal',
  settingsName: 'Nombre',
  settingsDob: 'Fecha de nacimiento',
  settingsSex: 'Sexo',
  settingsSexMale: 'Masculino',
  settingsSexFemale: 'Femenino',
  settingsSexOther: 'Otro',
  settingsHeight: 'Estatura',
  settingsWeight: 'Peso',
  settingsActivityLevel: 'Nivel de actividad',
  settingsGoal: 'Objetivo',
  settingsWaterTarget: 'Objetivo de agua',
  settingsSleepTarget: 'Objetivo de sueño',
  settingsSleepHours: 'Horas objetivo',
  settingsBedtime: 'Hora de acostarse',
  settingsWakeTime: 'Hora de despertarse',
  settingsExportData: 'Exportar datos',
  settingsExportDesc: 'Descarga todos tus datos de peso, nutrición, entrenamientos y sueño.',
  settingsChangePassword: 'Cambiar contraseña',
  settingsNewPassword: 'Nueva contraseña',
  settingsConfirmPassword: 'Confirmar nueva contraseña',
  settingsPasswordChanged: '¡Contraseña cambiada con éxito!',
  settingsPasswordMismatch: 'Las contraseñas no coinciden',
  settingsRecalcTargets: 'Recalcular según mis datos',
  settingsRecalcDone: 'Objetivos recalculados según tus datos',

  // Activity levels
  activitySedentary: 'Sedentario',
  activityLight: 'Ligero',
  activityModerate: 'Moderado',
  activityHigh: 'Alto',
  activityAthlete: 'Atleta',
  activityFreqSedentary: '0–1 sesiones/sem',
  activityFreqLight: '1–3 sesiones/sem',
  activityFreqModerate: '3–5 sesiones/sem',
  activityFreqHigh: '6–7 sesiones/sem',
  activityFreqAthlete: 'dos veces al día',
  activityIncludesTraining:
    'Esto ya incluye tu entrenamiento, así que la app no suma calorías después de una sesión — hacerlo contaría la misma hora dos veces.',

  // Goals
  goalBulk: 'Volumen',
  goalCut: 'Definición',
  goalMaintain: 'Mantenimiento',
  goalRecomp: 'Recomposición',
  goalStrength: 'Fuerza',
  goalEndurance: 'Resistencia',

  // Nutrition page
  nutritionTitle: 'Nutrición',
  nutritionFoods: 'Alimentos',
  nutritionMealPlan: 'Plan de comidas',
  nutritionSearchFood: 'Buscar alimentos...',
  nutritionRecent: 'Recientes',
  nutritionCreatePlan: 'Crear plan de comidas',
  nutritionPlanName: 'Nombre del plan',
  nutritionMealsPerDay: 'Comidas al día',

  // Meal plan
  mealPlanTitle: 'Plan de comidas',
  mealBreakfast: 'Desayuno',
  mealLunch: 'Almuerzo',
  mealDinner: 'Cena',
  mealSnack: 'Tentempié',
  mealType: 'Tipo de comida',

  // Supplements
  supplementsAddTitle: 'Añadir suplemento',
  supplementsName: 'Nombre',
  supplementsDose: 'Dosis',
  supplementsTiming: 'Momento',
  supplementsTimMorning: 'Mañana',
  supplementsTimPreWorkout: 'Preentreno',
  supplementsTimPostWorkout: 'Postentreno',
  supplementsTimWithMeal: 'Con la comida',
  supplementsTimBeforeBed: 'Antes de acostarse',

  // Sleep
  sleepTitle: 'Sueño — 7 días',
  sleepAvgQuality: 'Calidad prom.',
  sleepAvgDeep: 'Profundo prom.',
  sleepDebt: 'Deuda de sueño',
  sleepInsights: 'Datos',
  sleepNoData: 'Sin datos de sueño',
  sleepNoDataMsg: 'Aún no hay datos de sueño. Regístralo desde el panel.',
  sleepOk: 'Bien',
  sleepDeep: 'Profundo',

  // Workouts
  workoutsTitle: 'Creador de entrenamientos',
  workoutsExercises: 'Ejercicios',
  workoutsCreateNew: 'Crear nuevo',
  workoutsNoTemplates: 'Aún no hay plantillas',
  workoutsExercisesAdded: 'Ejercicios añadidos',
  workoutsVolume: 'Volumen',

  // Exercise Library
  exercisesAdd: 'Añadir ejercicio',
  exercisesAddTitle: 'Añadir ejercicio',
  exercisesSearch: 'Buscar ejercicios...',
  exercisesName: 'Nombre',
  exercisesMuscleGroup: 'Grupo muscular',
  exercisesEquipment: 'Equipo',
  exercisesAddBtn: 'Añadir ejercicio',

  // Progress
  progressWeight: 'Peso',
  progressMeasurements: 'Medidas',
  progressPhotos: 'Fotos de progreso',
  progressCurrent: 'Actual',
  progressChange: 'Cambio',
  progressRecords: 'Récords',
  progressWeightChart: 'Gráfica de peso',
  progressMeasurementTrend: 'Tendencia de medidas',
  progressMeasurementHistory: 'Historial de medidas',
  progressDeleteMeasurement: '¿Eliminar esta medida?',
  progressDeleteMeasurementBody: 'Se elimina toda la fila de esta fecha de la tabla y de la gráfica.',
  progressAddMeasurement: 'Añadir medida',
  progressDate: 'Fecha',
  progressNoMeasurements: 'Aún no hay medidas. Toca arriba para empezar a registrar.',
  progressNoPhotos: 'Aún no hay fotos de progreso',
  progressSaved: '¡Medidas guardadas!',

  // Biometrics
  biometricsTitle: 'Biometría',
  biometricsManual: 'Entrada manual',
  biometricsNoData: 'Sin datos biométricos',
  biometricsNoDataMsg: 'Usa la cámara o la entrada manual para empezar a registrar',
  biometricsHeartRate: 'Frecuencia cardíaca en reposo',
  biometricsBreathRate: 'Frecuencia respiratoria',
  biometricsBloodOxygen: 'Oxígeno en sangre',
  /** đơn vị nhịp thở — "rpm" là vòng/phút của động cơ, không phải hơi thở */
  biometricsBreathUnit: 'resp/min',
  biometricsDisclaimer1: 'Los datos biométricos son solo estimaciones y NO tienen precisión clínica ni médica. No los uses para diagnóstico ni tratamiento.',

  // Log Biometrics Dialog
  logBioTitle: 'Ingresar biometría',
  logBioHR: 'Frecuencia cardíaca en reposo (lpm)',
  logBioHRV: 'HRV RMSSD (ms)',
  logBioSpO2: 'SpO₂ (%)',
  logBioVO2: 'VO₂max (ml/kg/min) — estimado',
  logBioResp: 'Frecuencia respiratoria (rpm)',
  logBioSaved: '¡Biometría guardada!',
  /** Ghi chú dưới các ô mà Apple Health đã điền sẵn. */
  healthOwnedNote: 'Apple Health midió estos valores. Puedes editarlos, pero no añadir nuevos.',
  /* Morning check-in (P0-1): optional soreness scale + illness toggle. */
  nCxLogBioSoreness: 'Dolor muscular hoy (opcional)',
  nCxLogBioSorenessHint: '1 = nada, 10 = máximo',
  nCxLogBioIllness: 'Me siento enfermo hoy',
  /* Widget payloads (P0-2): pushed to iOS widgets via widget-data.ts. */
  nCxWidgetRestDay: 'Día de descanso',
  nCxWidgetDone: 'Hecho',
  nCxWidgetNoWorkout: 'Aún sin entrenamiento',
  nCxLastTrained: 'Último entrenamiento',
  nCxTrainedToday: 'Hoy',
  nCxTrainedYesterday: 'Ayer',
  nCxTrainedDaysAgo: 'hace {n} {n:día|días}',
  nCxNeverTrained: 'Aún no entrenado',
  /** Tiêu đề hộp thoại khi người dùng sửa một số của Apple Health. */
  healthOverrideTitle: '¿Reemplazar la lectura de Apple Health?',
  /** Thân hộp thoại ấy. `{n}` là số chỉ số đang bị đổi. */
  healthOverrideMsg:
    'Estás cambiando {n} lectura(s) que midió Apple Health. Guarda y la app usará las tuyas, y Apple Health no las sobrescribirá de nuevo.',
  /** Nút xác nhận trong hộp thoại ấy. */
  healthOverrideConfirm: 'Usar mis valores',
  /** Shown under a field whose value is outside anything a body produces. Carries {min}, {max}, {unit}. */
  outOfRange: 'Debe estar entre {min} y {max} {unit}',
  /** Refusing to work out a plan for a body nobody has described yet. */
  statsRequired: 'Primero se necesitan estatura, peso y fecha de nacimiento válidos',
  /** Sleep stages adding up to more than the night itself. Carries {sum}, {total}. */
  sleepStagesOverrun: 'Las fases suman {sum} min, más que la noche entera ({total} min)',

  // Log Meal Dialog
  logMealSaved: '¡Comida guardada!',
  logMealQueued: 'Guardado — se sincronizará cuando vuelvas a tener conexión',

  // Log Workout Dialog
  logWorkoutSaved: '¡Entrenamiento guardado!',

  // Log Sleep Dialog
  logSleepDeep: 'Profundo',
  logSleepREM: 'REM',
  logSleepLight: 'Ligero',
  logSleepSaved: '¡Sueño registrado!',
  logSleepMinutes: 'min',

  // Awards
  awardsTitle: 'Logros',
  awardsEarned: 'Conseguidos',
  awardsOf: 'logros',

  // Weekly Review
  weeklyReviewTitle: 'Revisión semanal',
  weeklyReviewAvgCalories: 'Calorías prom.',
  weeklyReviewAvgProtein: 'Proteína prom.',
  weeklyReviewAvgSleep: 'Sueño prom.',
  weeklyReviewVolume: 'Volumen',
  weeklyReviewReadiness: 'Preparación',
  weeklyReviewDailyNutrition: 'Nutrición diaria',
  weeklyReviewSleepChart: 'Sueño',
  nCxWeeklyReviewVolumeLoad: 'Carga de volumen',
  weeklyReviewReadinessChart: 'Preparación',
  weeklyReviewRecommendations: 'Recomendaciones para la próxima semana',
  weeklyReviewSessions: '{n} {n:sesión|sesiones}',

  // Smart Goals
  smartGoalsTitle: 'Calibración de objetivos',
  smartGoalsWeightTrend: 'Tendencia de peso (4 semanas)',
  smartGoalsOnTrack: '¡Vas bien! Mantén tu rutina actual.',
  smartGoalsOffTrack: 'Te has desviado. Mira las sugerencias abajo.',
  smartGoalsCalorieSuggestion: 'Sugerencia de calorías',
  smartGoalsMeasured: 'Medido a partir de tu propia ingesta y tu peso en los últimos {d} {d:día|días}, no de una fórmula.',
  smartGoalsNeedData: 'Se necesitan al menos 3 registros de peso en las últimas 4 semanas',
  smartGoalsNeedDataMsg: 'Registra tu peso a diario en el panel para el análisis.',
  smartGoalsProteinCoach: 'Distribución de proteína',
  smartGoalsPerDay: 'Objetivo/día',
  smartGoalsPerMeal: '/ comida',
  smartGoalsLowDays: 'días bajos/14 días',
  smartGoalsProteinSplit: 'Sugerencia de reparto de proteína',
  smartGoalsNoNutritionData: 'Aún no hay datos de nutrición. Registra comidas para recibir sugerencias.',

  // AI Coach
  aiCoachTitle: 'Entrenador IA',
  aiCoachHello: '¡Hola!',
  aiCoachIntro: 'Soy tu entrenador IA — analizo tus datos de entrenamiento, nutrición, sueño y recuperación para darte consejos personalizados.',
  aiCoachPlaceholder: 'Pregunta sobre nutrición, entrenamiento, recuperación...',
  aiCoachHistory: 'Historial de chat',
  aiCoachNoHistory: 'Aún no hay conversaciones',

  // Grocery
  grocerySubtitle: 'Lista de compras del plan de comidas y lista personalizada',

  /* ── onboarding 13 màn (Giai đoạn 3) ── */
  obBack: 'Atrás',
  obNext: 'Continuar',
  obDragHint: 'Arrastra para ajustar',
  obStart: 'Empezar',
  obIntentionQ: '¿Qué quieres cambiar?',
  obIntentionWhy: 'Esto decide tus calorías y macros cada día.',
  obBranchBody: 'Cuerpo',
  obBranchBodyDesc: 'Gana músculo, pierde grasa o ambas',
  obBranchCapacity: 'Capacidad',
  obBranchCapacityDesc: 'Sé más fuerte o rinde más',
  obBranchMaintain: 'Mantener',
  obBranchMaintainDesc: 'Mantén tu nivel actual',
  obGoalQ: '¿Un poco más específico?',
  obGoalBulk: 'Ganar músculo',
  obGoalBulkDesc: 'Come en superávit, la proteína primero',
  obGoalCut: 'Perder grasa',
  obGoalCutDesc: 'Come en déficit, conserva el músculo',
  obGoalRecomp: 'Ambas a la vez',
  obGoalRecompDesc: 'Más lento, pero consigues ambas',
  obGoalStrength: 'Más fuerza',
  obGoalStrengthDesc: 'Mueve más peso',
  obGoalEndurance: 'Más resistencia',
  obGoalEnduranceDesc: 'Rinde más antes de cansarte',
  obSexQ: '¿Cuál aplica en tu caso?',
  obSexWhy: 'La fórmula de energía en reposo depende de esto.',
  obSexMale: 'Masculino',
  obSexFemale: 'Femenino',
  obSexOther: 'Otro',
  obDobQ: '¿Cuándo naciste?',
  obDobWhy: 'La edad cambia tu energía en reposo.',
  obDobBad: 'Tu fecha de nacimiento debe estar en el pasado y la edad por debajo de 130.',
  obHeightQ: '¿Cuánto mides?',
  obHeightWhy: 'Con tu peso, esto da tu energía en reposo.',
  obWeightQ: '¿Cuánto pesas hoy?',
  obActivityQ: '¿Cómo es un día normal para ti?',
  obActivityWhy: 'Esto ya incluye tu entrenamiento.',
  obActSedentary: 'Sedentario',
  obActSedentaryDesc: 'Sentado la mayor parte del día',
  obActLight: 'Ligero',
  obActLightDesc: 'Un poco de pie',
  obActModerate: 'Moderado',
  obActModerateDesc: 'Entrenas 3–5 veces por semana',
  obActHigh: 'Alto',
  obActHighDesc: 'Entrenamiento duro o trabajo físico',
  obActAthlete: 'Atleta',
  obActAthleteDesc: 'Dos veces al día',
  obExpQ: '¿Desde dónde empiezas?',
  obExpWhy: 'Tu entrenador IA usa esto para elegir cómo hablarte.',
  obExpNew: 'Estoy empezando',
  obExpNewDesc: 'Nunca has entrenado, o vuelves tras un largo descanso',
  obExpSteady: 'Llevo un tiempo en esto',
  obExpSteadyDesc: 'Entre uno y tres años',
  obExpDeep: 'Tengo años de experiencia',
  obExpDeepDesc: 'Entrenando de forma constante más de tres años',
  obPlanEyebrow: 'Tu plan',
  obPlanFor: 'al día, para {goal}',
  obPlanMacros: 'Proteína {p}g · Carbohidratos {c}g · Grasa {f}g',
  obPlanWater: '{v} de agua al día',
  obPlanSleep: '{h} {h:hora|horas} de sueño por noche',
  obPlanRank: 'Nivel {n} — primero de seis',
  obHealthQ: 'ASCND puede ver tu día con más claridad.',
  obHealthChart: 'Cuatro días los registras tú · tres los completa el reloj',
  obHealthRead1: 'Pasos y energía',
  obHealthRead2: 'Sueño',
  obHealthRead3: 'Frecuencia cardíaca en reposo y HRV',
  obHealthRead4: 'Entrenamientos de tu reloj',
  obHealthConnect: 'Conectar Salud',
  obHealthLater: 'Ahora no',
  obHealthLegal: 'Tus datos de salud nunca salen de este dispositivo.',
  obReadyEyebrow: 'Todo está listo',
  obReadyLine: 'Tu primer ascenso empieza aquí.',
  obReadyCta: 'Empezar el viaje',
  obReadyLegal: 'Al empezar aceptas los Términos, la Política de privacidad y el aviso de datos de salud.',

  /*
    Mười hai khoá mang tiền tố `onboarding` mà onboarding gần như không dựng:
    `onboardingHealthWhy` là của màn 12, mười một khoá còn lại là nhãn của
    **Sửa hồ sơ**. Cái tên nói dối, và nó nói dối vì luồng bảy màn cũ đã sinh
    ra chúng — luồng ấy bị thay, còn chỗ dựng chúng thì không.

    Không đổi tên trong lượt này, có chủ ý: một cú đổi tên chạm hai cột từ
    điển và hai màn, mà không sửa một lỗi nào người dùng nhìn thấy được. Ghi
    lại ở đây để người sau đọc `onboarding*` còn biết tiền tố ấy KHÔNG phải
    một lời hứa về nơi khoá được dựng.
  */
  onboardingHealthWhy: 'La actividad, el sueño y las constantes de tu iPhone o Apple Watch mantienen el plan al día con tu semana, en lugar de esperar a que lo escribas cada día.',
  onboardingTrainingLevel: 'Nivel de entrenamiento',
  onboardingBeginner: 'Principiante',
  onboardingIntermediate: 'Intermedio',
  onboardingAdvanced: 'Avanzado',
  onboardingDiet: 'Preferencia alimentaria',
  onboardingAllergies: 'Alergias alimentarias',
  onboardingDislikedFoods: 'Alimentos que no te gustan',
  onboardingDietOmnivore: 'Omnívoro',
  onboardingDietVegetarian: 'Vegetariano',
  onboardingDietHalal: 'Halal',
  onboardingDislikedFoodsPlaceholder: 'p. ej., cebolla, cilantro, casquería',

  // Muscle groups
  muscleChest: 'Pecho',
  muscleBack: 'Espalda',
  muscleShoulders: 'Hombros',
  muscleBiceps: 'Bíceps',
  muscleTriceps: 'Tríceps',
  muscleQuads: 'Cuádriceps',
  muscleHamstrings: 'Isquiotibiales',
  muscleGlutes: 'Glúteos',
  muscleAbs: 'Abdominales',
  muscleFullBody: 'Cuerpo completo',
  muscleCardio: 'Cardio',

  // Measurements
  measureNeck: 'Cuello (cm)',
  measureShoulders: 'Hombros (cm)',
  measureChest: 'Pecho (cm)',
  measureWaist: 'Cintura (cm)',
  measureHips: 'Cadera (cm)',
  measureBicepL: 'Bíceps izq. (cm)',
  measureBicepR: 'Bíceps der. (cm)',
  measureThighL: 'Muslo izq. (cm)',
  measureThighR: 'Muslo der. (cm)',
  measureCalfL: 'Pantorrilla izq. (cm)',
  measureCalfR: 'Pantorrilla der. (cm)',
  measureBodyFat: 'Grasa corporal (%)',

  // Dashboard components
  dcActivity: 'Actividad',
  dcActivityMove: 'Moverse',
  dcActivityExercise: 'Ejercicio',
  dcActivitySteps: 'Pasos',
  dcActivityKcal: 'kcal',
  dcActivityMin: 'min',
  dcActivityStepsUnit: 'pasos',
  dcActivityEmpty: 'Aún no hay actividad hoy. Conecta Apple Health para calorías y pasos, o registra un entrenamiento.',
  dcActivityEstimated: '~ Los números con tilde son estimaciones de los entrenamientos que registraste, no mediciones de un dispositivo.',
  dcNutritionTitle: 'Nutrición',
  dcNutritionTarget: 'Objetivo',
  dcNutritionRemaining: 'Restante',
  /** macro tiles, tapped: still to eat / exactly met / eaten past */
  dcMacroLeft: 'restante',
  dcMacroDone: 'completo',
  dcMacroOver: 'sobre el objetivo',
  dcMacroEaten: 'consumido',
  /** eaten past the target */
  dcNutritionSurplus: 'Superávit',
  /** still under the target — the same number as "remaining", named for the diet */
  /** exactly on target, so neither word applies */
  dcNutritionOnTarget: 'En el objetivo',
  dcSleepTitle: 'Sueño',
  dcSleepTarget: 'Objetivo',
  dcSleepQuality: 'Calidad',
  dcBioTitle: 'Biometría',
  dcBioNotConnected: 'No conectado',
  /** nhóm thứ hai của thẻ: VO₂max là năng lực thể lực, không phải dấu hiệu sinh tồn */
  dcBioFitness: 'Forma física',
  dcReadinessTitle: 'Puntuación de preparación',
  /* A verdict, not a category name — see the Vietnamese entries. */
  dcReadinessTrain: 'LISTO PARA ENTRENAR',
  dcReadinessModerate: 'ENTRENA MODERADO',
  dcReadinessRecover: 'RECUPERA HOY',
  dcTrainingTitle: 'Entrenamiento',
  dcRecentAwards: 'Logros recientes',
  dcViewAll: 'Ver todo',

  // Food Item CRUD
  foodAddTitle: 'Añadir alimento',
  foodEditTitle: 'Editar alimento',
  foodName: 'Nombre del alimento',
  foodNamePlaceholder: 'p. ej., pechuga de pollo, arroz...',
  foodBrand: 'Marca',
  foodBrandPlaceholder: 'p. ej., Kirkland, Optimum...',
  foodServing: 'Tamaño de porción',
  foodCalories: 'Calorías',
  foodAutoCalc: 'Autocalcular',
  foodProtein: 'Proteína',
  foodCarbs: 'Carbohidratos',
  foodFat: 'Grasa',
  foodFiber: 'Fibra',
  foodAdded: '¡Alimento añadido!',
  foodUpdated: '¡Alimento actualizado!',
  foodDeleted: '¡Alimento eliminado!',
  foodAddCustom: 'Añadir alimento',

  // Steps
  stepsGoal: 'Objetivo',
};

const vi: Translations = {
  loading: 'Đang tải...',
  save: 'Lưu',
  saving: 'Đang lưu...',
  cancel: 'Huỷ',
  delete: 'Xoá',
  deleted: 'Đã xoá',
  add: 'Thêm',
  edit: 'Sửa',
  close: 'Đóng',
  search: 'Tìm kiếm',
  back: 'Quay lại',
  next: 'Tiếp',
  previous: 'Trước',
  confirm: 'Xác nhận',
  error: 'Lỗi',
  success: 'Thành công',
  noData: 'Chưa có dữ liệu',
  today: 'Hôm nay',
  target: 'Mục tiêu',
  all: 'Tất cả',
  other: 'Khác',
  settings: 'Cài đặt',

  authForgotPassword: 'Quên mật khẩu?',
  authResetPassword: 'Đặt lại mật khẩu',
  authResetSent: 'Kiểm tra email để đặt lại mật khẩu!',
  authBackToLogin: 'Quay lại đăng nhập',

  navToday: 'Hôm nay',
  navNutrition: 'Dinh dưỡng',
  navWorkouts: 'Tập luyện',
  navProgress: 'Tiến trình',
  navSmartGoals: 'Hiệu chỉnh mục tiêu',

  dashReadiness: 'Sẵn Sàng',
  /*
    Bốn nhận xét về đêm qua, và cả bốn đều đứng trên HAI con số cùng lúc: chất
    lượng bạn tự chấm, và số giờ đo được. Nói lại một mình con số tự chấm thì
    không thêm gì — người dùng vừa gõ nó xong.

    Hai câu ở giữa là hai ca hai con số KHÔNG khớp nhau, và đó mới là thông tin.
    Không câu nào chẩn đoán: "đủ giờ mà vẫn mệt" là quan sát về hai con số, còn
    một cái tên bệnh là câu app không có cơ sở để nói.
  */
  sleepNoteAlignedGood: 'Đủ giờ và bạn thấy khoẻ — cảm giác khớp với số đo.',
  sleepNoteAlignedPoor:
    'Thiếu {short} phút so với mục tiêu, và bạn cũng thấy mệt — hai thứ khớp nhau. Ưu tiên đi ngủ sớm hơn tối nay.',
  sleepNoteFeltWorse:
    'Đủ giờ nhưng bạn thấy mệt. Thời lượng không phải thứ duy nhất quyết định một đêm; nếu lặp lại vài đêm liền thì đáng để ý.',
  sleepNoteFeltBetter:
    'Bạn thấy khoẻ, dù đêm qua thiếu {short} phút so với mục tiêu. Điểm ngủ chấm theo THỜI LƯỢNG nên nó thấp hơn cảm giác của bạn.',
  /* Câu này đứng cạnh mọi nhận xét, và nó là điều kiện để phần trên trung
     thực: chất lượng tự chấm KHÔNG vào công thức, nên nhận xét không được đọc
     ra thành "cảm giác của bạn đã làm điểm đổi". */
  sleepNoteScoreIsDuration: 'Chất lượng bạn tự chấm không tính vào điểm — nó chỉ dùng cho nhận xét này.',
  logSleepReplaceGone:
    'Không sửa được đêm này — có thể nó đã bị xoá ở thiết bị khác. Hãy đóng rồi ghi lại.',
  logBioBaselineNote:
    'Nhịp tim nghỉ và HRV được chấm so với nền của chính bạn, nên cần 5 lần đo trong 28 ngày mới hiện lên thẻ điểm sẵn sàng. Nhập tay tính y như Apple Health — không cần đồng hồ.',
  /*
    Câu này từng ghi "Cần 3+ ngày dữ liệu", và đó là ba câu sai trong một dòng.

    Cổng thật nằm ở `daily-log-service.ts` và là một phép HOẶC, không phải một
    yêu cầu về số ngày: ≥3 lần đo sinh trắc, HOẶC ≥3 đêm ngủ trong 7 ngày, HOẶC
    bất kỳ buổi tập nào có ghi set trong 28 ngày. Một buổi tập duy nhất, ghi
    xong là có điểm ngay — đo được: điểm ra 80/100.

    Và qua được cổng KHÔNG có nghĩa là có điểm: HRV/nhịp nghỉ cần 5 lần đo mới
    dựng nổi baseline (`computeHRVScore`/`computeRHRScore` trả null dưới 5), nên
    đúng 3 lần đo là qua cổng mà vẫn không ra số nào. Câu cũ hứa 3 và sự thật là
    5.

    Nên câu này nói thứ NGƯỜI DÙNG LÀM ĐƯỢC: ba lối vào, mỗi lối một mình đã đủ.
    `tools/readiness-copy.mjs` lấy các con số này ra khỏi chính engine và cổng
    rồi so, nên nó không thể lệch lại lần nữa.

    Câu cuối trả lời đúng câu đã bị hỏi thẳng: bữa ăn không nằm trong
    `ReadinessInput`, nên nó không tính vào điểm này.
  */
  dashReadinessMsg:
    'Chưa đủ dữ liệu để tính điểm sẵn sàng. Chỉ cần MỘT trong ba: một buổi tập có ghi set, một đêm ngủ được ghi, hoặc 5 lần đo nhịp tim nghỉ/HRV trong 28 ngày. Bữa ăn và calo không được tính vào điểm này.',
  dashNutrition: 'Dinh Dưỡng',
  dashNutritionMsg: 'Chưa ghi bữa ăn hôm nay. Nhấn để mở nhật ký.',
  dashSleep: 'Giấc Ngủ',
  dashSleepMsg: 'Chưa ghi giấc ngủ. Nhấn để ghi.',

  workoutStatusTitle: 'Buổi Tập Hôm Nay',
  workoutStatusDone: 'Hoàn thành!',
  workoutStatusNotYet: 'Chưa tập',

  settingsTitle: 'Cài Đặt',
  settingsTheme: 'Giao Diện',
  settingsThemeLight: 'Sáng',
  settingsThemeDark: 'Tối',
  settingsThemeSystem: 'Hệ thống',
  settingsLanguage: 'Ngôn ngữ',
  settingsLanguageDesc: 'Ngôn ngữ hiển thị của ASCND',
  settingsLanguageSheetTitle: 'Ngôn ngữ',
  settingsLanguageSheetSubtitle: 'Chọn ngôn ngữ hiển thị của ASCND',
  settingsLangSystem: 'Theo hệ thống',
  settingsLangSystemDesc: 'Sử dụng ngôn ngữ của iPhone',
  settingsCancel: 'Huỷ',
  settingsThemeSheetTitle: 'Giao diện',
  settingsThemeSheetSubtitle: 'Chọn giao diện của ASCND',
  settingsThemeLightDesc: 'Giao diện sáng, phù hợp môi trường nhiều ánh sáng',
  settingsThemeDarkDesc: 'Giao diện tối, dịu mắt hơn trong môi trường tối',
  settingsThemeSystemDesc: 'Tự động chuyển theo cài đặt của thiết bị',
  settingsPersonalInfo: 'Thông Tin Cá Nhân',
  settingsName: 'Tên',
  settingsDob: 'Ngày sinh',
  settingsSex: 'Giới tính',
  settingsSexMale: 'Nam',
  settingsSexFemale: 'Nữ',
  settingsSexOther: 'Khác',
  settingsHeight: 'Chiều cao',
  settingsWeight: 'Cân nặng',
  settingsActivityLevel: 'Mức hoạt động',
  settingsGoal: 'Mục tiêu',
  settingsWaterTarget: 'Mục Tiêu Nước Uống',
  settingsSleepTarget: 'Mục Tiêu Giấc Ngủ',
  settingsSleepHours: 'Số giờ mục tiêu',
  settingsBedtime: 'Giờ đi ngủ',
  settingsWakeTime: 'Giờ thức dậy',
  settingsExportData: 'Xuất Dữ Liệu',
  settingsExportDesc: 'Tải xuống toàn bộ dữ liệu cân nặng, dinh dưỡng, tập luyện, giấc ngủ.',
  settingsChangePassword: 'Đổi mật khẩu',
  settingsNewPassword: 'Mật khẩu mới',
  settingsConfirmPassword: 'Xác nhận mật khẩu mới',
  settingsPasswordChanged: 'Đổi mật khẩu thành công!',
  settingsPasswordMismatch: 'Mật khẩu xác nhận không khớp',
  settingsRecalcTargets: 'Tính lại theo chỉ số',
  settingsRecalcDone: 'Đã tính lại mục tiêu từ chỉ số của bạn',

  activitySedentary: 'Ít vận động',
  activityLight: 'Nhẹ',
  activityModerate: 'Trung bình',
  activityHigh: 'Cao',
  activityAthlete: 'Vận động viên',
  activityFreqSedentary: '0–1 buổi/tuần',
  activityFreqLight: '1–3 buổi/tuần',
  activityFreqModerate: '3–5 buổi/tuần',
  activityFreqHigh: '6–7 buổi/tuần',
  activityFreqAthlete: '2 buổi/ngày',
  activityIncludesTraining:
    'Mức này đã tính cả việc tập, nên app không cộng thêm calo sau mỗi buổi tập — cộng nữa là tính một giờ hai lần.',

  goalBulk: 'Tăng cân',
  goalCut: 'Giảm cân',
  goalMaintain: 'Duy trì',
  goalRecomp: 'Recomp',
  goalStrength: 'Tăng sức mạnh',
  goalEndurance: 'Tăng sức bền',

  nutritionTitle: 'Dinh Dưỡng',
  nutritionFoods: 'Thực phẩm',
  nutritionMealPlan: 'Kế hoạch ăn',
  nutritionSearchFood: 'Tìm thực phẩm...',
  nutritionRecent: 'Gần đây',
  nutritionCreatePlan: 'Tạo kế hoạch ăn',
  nutritionPlanName: 'Tên kế hoạch ăn',
  nutritionMealsPerDay: 'Số bữa/ngày',

  mealPlanTitle: 'Kế hoạch ăn',
  mealBreakfast: 'Bữa sáng',
  mealLunch: 'Bữa trưa',
  mealDinner: 'Bữa tối',
  mealSnack: 'Bữa phụ',
  mealType: 'Loại bữa',

  supplementsAddTitle: 'Thêm Supplement',
  supplementsName: 'Tên',
  supplementsDose: 'Liều lượng',
  supplementsTiming: 'Thời điểm',
  supplementsTimMorning: 'Sáng',
  supplementsTimPreWorkout: 'Trước tập',
  supplementsTimPostWorkout: 'Sau tập',
  supplementsTimWithMeal: 'Cùng bữa ăn',
  supplementsTimBeforeBed: 'Trước ngủ',

  sleepTitle: 'Giấc Ngủ — 7 Ngày',
  sleepAvgQuality: 'TB Chất lượng',
  sleepAvgDeep: 'TB Deep',
  sleepDebt: 'Nợ ngủ',
  sleepInsights: 'Nhận Xét',
  sleepNoData: 'Chưa có dữ liệu giấc ngủ',
  sleepNoDataMsg: 'Chưa có dữ liệu giấc ngủ. Hãy ghi log giấc ngủ từ dashboard.',
  sleepOk: 'Ổn',
  sleepDeep: 'Deep',

  workoutsTitle: 'Tập luyện',
  workoutsExercises: 'Bài tập',
  workoutsCreateNew: 'Tạo mới',
  workoutsNoTemplates: 'Chưa có template nào',
  workoutsExercisesAdded: 'Bài tập đã thêm',
  workoutsVolume: 'Khối lượng',

  exercisesAdd: 'Thêm bài tập',
  exercisesAddTitle: 'Thêm Bài Tập',
  exercisesSearch: 'Tìm bài tập...',
  exercisesName: 'Tên',
  exercisesMuscleGroup: 'Nhóm cơ',
  exercisesEquipment: 'Dụng cụ',
  exercisesAddBtn: 'Thêm bài tập',

  progressWeight: 'Cân nặng',
  progressMeasurements: 'Số đo',
  progressPhotos: 'Ảnh tiến trình',
  progressCurrent: 'Hiện tại',
  progressChange: 'Thay đổi',
  progressRecords: 'Số bản ghi',
  progressWeightChart: 'Biểu Đồ Cân Nặng',
  progressMeasurementTrend: 'Xu Hướng Số Đo',
  progressMeasurementHistory: 'Lịch Sử Số Đo',
  progressDeleteMeasurement: 'Xoá số đo này?',
  progressDeleteMeasurementBody: 'Cả dòng số đo của ngày này sẽ bị xoá khỏi bảng và biểu đồ.',
  progressAddMeasurement: 'Nhập số đo',
  progressDate: 'Ngày',
  progressNoMeasurements: 'Chưa có số đo. Nhấn nút phía trên để bắt đầu theo dõi.',
  progressNoPhotos: 'Chưa có ảnh tiến trình',
  progressSaved: 'Đã lưu số đo!',

  biometricsTitle: 'Sinh Trắc Học',
  biometricsManual: 'Nhập thủ công',
  biometricsNoData: 'Chưa có dữ liệu sinh trắc học',
  biometricsNoDataMsg: 'Dùng Camera hoặc nhập thủ công để bắt đầu theo dõi',
  biometricsHeartRate: 'Nhịp tim nghỉ',
  biometricsBreathRate: 'Nhịp thở',
  biometricsBloodOxygen: 'Oxy máu',
  biometricsBreathUnit: 'nhịp/phút',
  biometricsDisclaimer1: 'Dữ liệu sinh trắc học chỉ mang tính ước tính, KHÔNG có độ chính xác y khoa. Không sử dụng để chẩn đoán hoặc điều trị bệnh.',

  logBioTitle: 'Nhập Chỉ Số Sinh Trắc',
  logBioHR: 'Nhịp tim nghỉ (bpm)',
  logBioHRV: 'HRV RMSSD (ms)',
  logBioSpO2: 'SpO₂ (%)',
  logBioVO2: 'VO₂max (ml/kg/min) — ước tính',
  logBioResp: 'Nhịp thở (rpm)',
  logBioSaved: 'Đã lưu chỉ số sinh trắc!',
  healthOwnedNote: 'Apple Health đã đo các số này. Bạn sửa được, nhưng không thêm số mới.',
  nCxLogBioSoreness: 'Đau nhức hôm nay (không bắt buộc)',
  nCxLogBioSorenessHint: '1 = không đau, 10 = đau nhất',
  nCxLogBioIllness: 'Hôm nay bị ốm',
  nCxWidgetRestDay: 'Ngày nghỉ',
  nCxWidgetDone: 'Hoàn thành',
  nCxWidgetNoWorkout: 'Chưa có buổi tập',
  nCxLastTrained: 'Lần tập gần nhất',
  nCxTrainedToday: 'Hôm nay',
  nCxTrainedYesterday: 'Hôm qua',
  nCxTrainedDaysAgo: '{n} ngày trước',
  nCxNeverTrained: 'Chưa tập lần nào',
  healthOverrideTitle: 'Thay số của Apple Health?',
  healthOverrideMsg:
    'Bạn đang đổi {n} chỉ số Apple Health đã đo. Lưu xong app dùng số của bạn, và Apple Health sẽ không ghi đè lên nữa.',
  healthOverrideConfirm: 'Dùng số của tôi',
  outOfRange: 'Cần nằm trong khoảng {min}–{max} {unit}',
  statsRequired: 'Cần chiều cao, cân nặng và ngày sinh hợp lệ trước khi tính',
  sleepStagesOverrun: 'Các giai đoạn cộng lại {sum} phút, dài hơn cả đêm ({total} phút)',

  logMealSaved: 'Đã lưu bữa ăn!',
  logMealQueued: 'Đã lưu — sẽ đồng bộ khi có mạng',

  logWorkoutSaved: 'Đã lưu buổi tập!',

  logSleepDeep: 'Deep',
  logSleepREM: 'REM',
  logSleepLight: 'Light',
  logSleepSaved: 'Đã lưu giấc ngủ!',
  logSleepMinutes: 'phút',

  awardsTitle: 'Huy Chương',
  awardsEarned: 'Đã đạt',
  awardsOf: 'huy chương',

  weeklyReviewTitle: 'Tổng kết tuần',
  weeklyReviewAvgCalories: 'TB Calories',
  weeklyReviewAvgProtein: 'TB Protein',
  weeklyReviewAvgSleep: 'TB Giấc ngủ',
  weeklyReviewVolume: 'Khối lượng',
  weeklyReviewReadiness: 'Mức sẵn sàng',
  weeklyReviewDailyNutrition: 'Dinh Dưỡng Hàng Ngày',
  weeklyReviewSleepChart: 'Giấc Ngủ',
  nCxWeeklyReviewVolumeLoad: 'Tổng Khối Lượng',
  weeklyReviewReadinessChart: 'Mức sẵn sàng',
  weeklyReviewRecommendations: 'Khuyến Nghị Tuần Tới',
  weeklyReviewSessions: '{n} buổi',

  smartGoalsTitle: 'Hiệu chỉnh mục tiêu',
  smartGoalsWeightTrend: 'Xu Hướng Cân Nặng (4 Tuần)',
  smartGoalsOnTrack: 'Đang đi đúng hướng! Giữ nguyên chế độ hiện tại.',
  smartGoalsOffTrack: 'Lệch mục tiêu. Xem gợi ý bên dưới.',
  smartGoalsCalorieSuggestion: 'Gợi ý chỉnh Calories',
  smartGoalsMeasured: 'Đo từ lượng ăn và cân nặng {d} ngày qua của bạn, không phải từ công thức chung.',
  smartGoalsNeedData: 'Cần ít nhất 3 ngày ghi cân nặng trong 4 tuần gần nhất',
  smartGoalsNeedDataMsg: 'Ghi cân nặng hàng ngày trên Dashboard để nhận phân tích.',
  smartGoalsProteinCoach: 'Phân bổ đạm trong ngày',
  smartGoalsPerDay: 'Mục tiêu/ngày',
  smartGoalsPerMeal: '/ bữa',
  smartGoalsLowDays: 'ngày thấp/14 ngày',
  smartGoalsProteinSplit: 'Gợi ý chia protein',
  smartGoalsNoNutritionData: 'Chưa có dữ liệu dinh dưỡng. Ghi bữa ăn để nhận gợi ý.',

  aiCoachTitle: 'AI Coach',
  aiCoachHello: 'Xin chào!',
  aiCoachIntro: 'Tôi là AI Coach — tôi phân tích dữ liệu tập luyện, dinh dưỡng, giấc ngủ và phục hồi của bạn để đưa ra lời khuyên cá nhân hoá.',
  aiCoachPlaceholder: 'Hỏi về dinh dưỡng, tập luyện, phục hồi...',
  aiCoachHistory: 'Lịch sử trò chuyện',
  aiCoachNoHistory: 'Chưa có cuộc trò chuyện nào',

  grocerySubtitle: 'Danh sách mua sắm từ kế hoạch ăn & danh sách tuỳ chỉnh',

  /* ── onboarding 13 màn (Giai đoạn 3) ── */
  obBack: 'Quay lại',
  obNext: 'Tiếp',
  obDragHint: 'Kéo để chỉnh',
  obStart: 'Bắt đầu',
  obIntentionQ: 'Bạn muốn thay đổi điều gì?',
  obIntentionWhy: 'Câu trả lời này quyết định calo và macro mỗi ngày của bạn.',
  obBranchBody: 'Hình thể',
  obBranchBodyDesc: 'Tăng cơ, giảm mỡ, hoặc cả hai',
  obBranchCapacity: 'Năng lực',
  obBranchCapacityDesc: 'Khoẻ hơn hoặc bền hơn',
  obBranchMaintain: 'Giữ đều',
  obBranchMaintainDesc: 'Giữ phong độ hiện tại',
  obGoalQ: 'Cụ thể hơn một chút?',
  obGoalBulk: 'Tăng cơ',
  obGoalBulkDesc: 'Ăn dư, ưu tiên đạm',
  obGoalCut: 'Giảm mỡ',
  obGoalCutDesc: 'Ăn thiếu, giữ cơ',
  obGoalRecomp: 'Tăng cơ & giảm mỡ',
  obGoalRecompDesc: 'Chậm hơn, đổi lại được cả hai',
  obGoalStrength: 'Khoẻ hơn',
  obGoalStrengthDesc: 'Nâng được nhiều hơn',
  obGoalEndurance: 'Bền hơn',
  obGoalEnduranceDesc: 'Đi xa hơn, lâu mệt hơn',
  obSexQ: 'Bạn thuộc nhóm nào?',
  obSexWhy: 'Công thức năng lượng nghỉ rẽ theo thông tin này.',
  obSexMale: 'Nam',
  obSexFemale: 'Nữ',
  obSexOther: 'Khác',
  obDobQ: 'Bạn sinh ngày nào?',
  obDobWhy: 'Tuổi đổi mức năng lượng nghỉ của bạn.',
  obDobBad: 'Ngày sinh phải ở quá khứ, và tuổi phải dưới 130.',
  obHeightQ: 'Bạn cao bao nhiêu?',
  obHeightWhy: 'Cùng với cân nặng, nó cho ra mức năng lượng nghỉ.',
  obWeightQ: 'Hôm nay bạn nặng bao nhiêu?',
  obActivityQ: 'Một ngày bình thường của bạn ra sao?',
  obActivityWhy: 'Mức này đã bao gồm cả buổi tập của bạn.',
  obActSedentary: 'Ít vận động',
  obActSedentaryDesc: 'Ngồi gần như cả ngày',
  obActLight: 'Nhẹ',
  obActLightDesc: 'Đi lại chút ít',
  obActModerate: 'Trung bình',
  obActModerateDesc: 'Tập 3–5 buổi mỗi tuần',
  obActHigh: 'Cao',
  obActHighDesc: 'Tập nặng hoặc việc chân tay',
  obActAthlete: 'Vận động viên',
  obActAthleteDesc: 'Hai buổi mỗi ngày',
  obExpQ: 'Bạn đang bắt đầu từ đâu?',
  obExpWhy: 'Huấn luyện viên AI dùng câu này để chọn cách nói với bạn.',
  obExpNew: 'Mình mới bắt đầu',
  obExpNewDesc: 'Chưa tập bao giờ, hoặc nghỉ đã lâu',
  obExpSteady: 'Mình tập đều được một thời gian',
  obExpSteadyDesc: 'Khoảng một tới ba năm',
  obExpDeep: 'Mình có nhiều kinh nghiệm',
  obExpDeepDesc: 'Tập đều trên ba năm',
  obPlanEyebrow: 'Kế hoạch của bạn',
  obPlanFor: 'mỗi ngày, cho mục tiêu {goal}',
  obPlanMacros: 'Đạm {p}g · Tinh bột {c}g · Béo {f}g',
  obPlanWater: 'Nước {v} mỗi ngày',
  obPlanSleep: 'Ngủ {h} giờ mỗi đêm',
  obPlanRank: 'Level {n} — bậc đầu trong sáu',
  obHealthQ: 'ASCND có thể hiểu ngày của bạn rõ hơn.',
  obHealthChart: 'Bốn ngày bạn tự ghi · ba ngày đồng hồ tự điền',
  obHealthRead1: 'Bước chân và năng lượng',
  obHealthRead2: 'Giấc ngủ',
  obHealthRead3: 'Nhịp tim nghỉ và HRV',
  obHealthRead4: 'Buổi tập từ đồng hồ',
  obHealthConnect: 'Kết nối Sức khoẻ',
  obHealthLater: 'Để sau',
  obHealthLegal: 'Số liệu sức khoẻ không rời khỏi máy này.',
  obReadyEyebrow: 'Tất cả đã sẵn sàng',
  obReadyLine: 'Lần Ascend đầu tiên của bạn bắt đầu ở đây.',
  obReadyCta: 'Bắt đầu hành trình',
  obReadyLegal: 'Bắt đầu tức là bạn đồng ý với Điều khoản, Quyền riêng tư và Dữ liệu sức khoẻ.',

  onboardingHealthWhy: 'Hoạt động, giấc ngủ và số liệu từ iPhone hoặc Apple Watch giúp kế hoạch tự cập nhật theo tuần của bạn, thay vì chờ bạn nhập tay từng ngày.',
  onboardingTrainingLevel: 'Trình độ tập luyện',
  onboardingBeginner: 'Người mới',
  onboardingIntermediate: 'Trung cấp',
  onboardingAdvanced: 'Nâng cao',
  onboardingDiet: 'Chế độ ăn',
  onboardingAllergies: 'Dị ứng thực phẩm',
  onboardingDislikedFoods: 'Thực phẩm không thích',
  onboardingDietOmnivore: 'Ăn tất cả',
  onboardingDietVegetarian: 'Ăn chay',
  onboardingDietHalal: 'Halal',
  onboardingDislikedFoodsPlaceholder: 'VD: hành, mùi, nội tạng',

  muscleChest: 'Ngực',
  muscleBack: 'Lưng',
  muscleShoulders: 'Vai',
  muscleBiceps: 'Tay trước',
  muscleTriceps: 'Tay sau',
  muscleQuads: 'Chân trước',
  muscleHamstrings: 'Chân sau',
  muscleGlutes: 'Mông',
  muscleAbs: 'Bụng',
  muscleFullBody: 'Toàn thân',
  muscleCardio: 'Cardio',

  measureNeck: 'Cổ (cm)',
  measureShoulders: 'Vai (cm)',
  measureChest: 'Ngực (cm)',
  measureWaist: 'Eo (cm)',
  measureHips: 'Hông (cm)',
  measureBicepL: 'Bắp tay trái (cm)',
  measureBicepR: 'Bắp tay phải (cm)',
  measureThighL: 'Đùi trái (cm)',
  measureThighR: 'Đùi phải (cm)',
  measureCalfL: 'Bắp chân trái (cm)',
  measureCalfR: 'Bắp chân phải (cm)',
  measureBodyFat: 'Mỡ cơ thể (%)',

  dcActivity: 'Hoạt Động',
  dcActivityMove: 'Vận Động',
  dcActivityExercise: 'Tập Luyện',
  dcActivitySteps: 'Bước Chân',
  dcActivityKcal: 'kcal',
  dcActivityMin: 'phút',
  dcActivityStepsUnit: 'bước',
  dcActivityEmpty: 'Chưa có hoạt động nào hôm nay. Kết nối Apple Health để tự động lấy calo và bước chân, hoặc ghi một buổi tập.',
  dcActivityEstimated: '~ Số có dấu ngã là ước tính từ buổi tập bạn đã ghi, không phải số đo từ thiết bị.',
  dcNutritionTitle: 'Dinh Dưỡng',
  dcNutritionTarget: 'Mục tiêu',
  dcNutritionRemaining: 'Còn lại',
  dcMacroLeft: 'còn lại',
  dcMacroDone: 'đủ',
  dcMacroOver: 'vượt mục tiêu',
  dcMacroEaten: 'đã ăn',
  dcNutritionSurplus: 'Thặng dư',
  dcNutritionOnTarget: 'Vừa đủ mục tiêu',
  dcSleepTitle: 'Giấc Ngủ',
  dcSleepTarget: 'Mục tiêu',
  dcSleepQuality: 'Chất lượng',
  dcBioTitle: 'Sinh Trắc Học',
  dcBioNotConnected: 'Chưa kết nối',
  dcBioFitness: 'Thể lực',
  dcReadinessTitle: 'Điểm Sẵn Sàng',
  /*
    Ba nhãn này là PHÁN QUYẾT của thẻ, không phải tên ba hạng mục.

    Chúng từng là 'TẬP LUYỆN' / 'VỪA PHẢI' / 'PHỤC HỒI', và đã bị báo là đọc
    không hiểu — đúng, vì chúng đứng ngay dưới một con số trong một cái vòng và
    ở vị trí đó một danh từ đọc ra là "đây là mục Tập Luyện". Thẻ này không phân
    loại gì cả; nó trả lời một câu: hôm nay cơ thể bạn chịu được bao nhiêu.

    Nên nhãn phải là câu trả lời của câu ấy. Cùng ba nhãn được dùng ở ba chỗ —
    vòng tròn, hàng chú giải, và bảng ba vùng trong sheet giải thích — nên viết
    thành một mệnh đề thì cả ba chỗ đều đọc thành câu.
  */
  dcReadinessTrain: 'SẴN SÀNG TẬP',
  dcReadinessModerate: 'TẬP VỪA PHẢI',
  dcReadinessRecover: 'NÊN PHỤC HỒI',
  dcTrainingTitle: 'Tập Luyện',
  dcRecentAwards: 'Huy Chương Gần Đây',
  dcViewAll: 'Tất cả',

  foodAddTitle: 'Thêm Thực Phẩm',
  foodEditTitle: 'Chỉnh Sửa Thực Phẩm',
  foodName: 'Tên thực phẩm',
  foodNamePlaceholder: 'VD: Ức gà, Cơm trắng...',
  foodBrand: 'Thương hiệu',
  foodBrandPlaceholder: 'VD: CP, Vinamilk...',
  foodServing: 'Khẩu phần',
  foodCalories: 'Calo',
  foodAutoCalc: 'Tự tính',
  foodProtein: 'Đạm',
  foodCarbs: 'Tinh bột',
  foodFat: 'Béo',
  foodFiber: 'Chất xơ',
  foodAdded: 'Đã thêm thực phẩm!',
  foodUpdated: 'Đã cập nhật!',
  foodDeleted: 'Đã xoá thực phẩm!',
  foodAddCustom: 'Thêm thực phẩm',

  stepsGoal: 'Mục tiêu',
};

const en: Translations = {
  loading: 'Loading...',
  save: 'Save',
  saving: 'Saving...',
  cancel: 'Cancel',
  delete: 'Delete',
  deleted: 'Deleted',
  add: 'Add',
  edit: 'Edit',
  close: 'Close',
  search: 'Search',
  back: 'Back',
  next: 'Next',
  previous: 'Previous',
  confirm: 'Confirm',
  error: 'Error',
  success: 'Success',
  noData: 'No data yet',
  today: 'Today',
  target: 'Target',
  all: 'All',
  other: 'Other',
  settings: 'Settings',

  authForgotPassword: 'Forgot password?',
  authResetPassword: 'Reset password',
  authResetSent: 'Check your email to reset your password!',
  authBackToLogin: 'Back to login',

  navToday: 'Today',
  navNutrition: 'Nutrition',
  navWorkouts: 'Workouts',
  navProgress: 'Progress',
  navSmartGoals: 'Target calibration',

  dashReadiness: 'Readiness',
  /* Four remarks, each standing on TWO numbers at once — see the Vietnamese
     entries. None of them diagnoses anything. */
  sleepNoteAlignedGood: 'Enough hours, and you felt good — the two agree.',
  sleepNoteAlignedPoor:
    '{short} {short:minute|minutes} short of your target, and you felt it — the two agree. Get to bed earlier tonight.',
  sleepNoteFeltWorse:
    'Enough hours, but you still felt tired. Duration is not the only thing that makes a night; worth noticing if it repeats.',
  sleepNoteFeltBetter:
    'You felt good, even though last night was {short} {short:minute|minutes} short. The sleep score is scored on DURATION, so it reads lower than you feel.',
  sleepNoteScoreIsDuration: 'Your own quality rating is not part of the score — it only drives this remark.',
  logSleepReplaceGone:
    'Could not update this night — it may have been deleted on another device. Close and log it again.',
  logBioBaselineNote:
    'Resting HR and HRV are scored against your own baseline, so it takes 5 readings within 28 days before they appear on the readiness card. Entering them by hand counts exactly like Apple Health — no watch needed.',
  /* See the Vietnamese entry for why "3+ days" was three wrong claims in one
     line. Same three doors, same numbers, checked by `tools/readiness-copy.mjs`
     against the engine and the gate themselves. */
  dashReadinessMsg:
    'Not enough data yet. Any ONE of these gives you a score: one workout with sets logged, one night of sleep logged, or 5 resting-HR/HRV readings within 28 days. Meals and calories are not part of this score.',
  dashNutrition: 'Nutrition',
  dashNutritionMsg: 'No meals logged today. Tap to open your diary.',
  dashSleep: 'Sleep',
  dashSleepMsg: 'No sleep logged. Tap to log.',

  workoutStatusTitle: "Today's Workouts",
  workoutStatusDone: 'Complete!',
  workoutStatusNotYet: 'Not started',

  settingsTitle: 'Settings',
  settingsTheme: 'Appearance',
  settingsThemeLight: 'Light',
  settingsThemeDark: 'Dark',
  settingsThemeSystem: 'System',
  settingsLanguage: 'Language',
  settingsLanguageDesc: 'Display language for ASCND',
  settingsLanguageSheetTitle: 'Language',
  settingsLanguageSheetSubtitle: 'Choose ASCND display language',
  settingsLangSystem: 'System',
  settingsLangSystemDesc: 'Use iPhone language',
  settingsCancel: 'Cancel',
  settingsThemeSheetTitle: 'Appearance',
  settingsThemeSheetSubtitle: 'Choose ASCND appearance',
  settingsThemeLightDesc: 'Light interface, good in bright environments',
  settingsThemeDarkDesc: 'Dark interface, easier on the eyes in the dark',
  settingsThemeSystemDesc: 'Automatically follows device settings',
  settingsPersonalInfo: 'Personal Info',
  settingsName: 'Name',
  settingsDob: 'Date of birth',
  settingsSex: 'Sex',
  settingsSexMale: 'Male',
  settingsSexFemale: 'Female',
  settingsSexOther: 'Other',
  settingsHeight: 'Height',
  settingsWeight: 'Weight',
  settingsActivityLevel: 'Activity level',
  settingsGoal: 'Goal',
  settingsWaterTarget: 'Water Target',
  settingsSleepTarget: 'Sleep Target',
  settingsSleepHours: 'Target hours',
  settingsBedtime: 'Bedtime',
  settingsWakeTime: 'Wake time',
  settingsExportData: 'Export Data',
  settingsExportDesc: 'Download all weight, nutrition, workout, and sleep data.',
  settingsChangePassword: 'Change password',
  settingsNewPassword: 'New password',
  settingsConfirmPassword: 'Confirm new password',
  settingsPasswordChanged: 'Password changed successfully!',
  settingsPasswordMismatch: 'Passwords do not match',
  settingsRecalcTargets: 'Recalculate from my stats',
  settingsRecalcDone: 'Targets recalculated from your stats',

  activitySedentary: 'Sedentary',
  activityLight: 'Light',
  activityModerate: 'Moderate',
  activityHigh: 'High',
  activityAthlete: 'Athlete',
  activityFreqSedentary: '0–1 sessions/wk',
  activityFreqLight: '1–3 sessions/wk',
  activityFreqModerate: '3–5 sessions/wk',
  activityFreqHigh: '6–7 sessions/wk',
  activityFreqAthlete: 'twice a day',
  activityIncludesTraining:
    'This already includes your training, so the app does not add calories back after a session — doing that would count the same hour twice.',

  goalBulk: 'Bulk',
  goalCut: 'Cut',
  goalMaintain: 'Maintain',
  goalRecomp: 'Recomp',
  goalStrength: 'Strength',
  goalEndurance: 'Endurance',

  nutritionTitle: 'Nutrition',
  nutritionFoods: 'Foods',
  nutritionMealPlan: 'Meal Plan',
  nutritionSearchFood: 'Search food...',
  nutritionRecent: 'Recent',
  nutritionCreatePlan: 'Create Meal Plan',
  nutritionPlanName: 'Plan name',
  nutritionMealsPerDay: 'Meals per day',

  mealPlanTitle: 'Meal Plan',
  mealBreakfast: 'Breakfast',
  mealLunch: 'Lunch',
  mealDinner: 'Dinner',
  mealSnack: 'Snack',
  mealType: 'Meal type',

  supplementsAddTitle: 'Add Supplement',
  supplementsName: 'Name',
  supplementsDose: 'Dose',
  supplementsTiming: 'Timing',
  supplementsTimMorning: 'Morning',
  supplementsTimPreWorkout: 'Pre-workout',
  supplementsTimPostWorkout: 'Post-workout',
  supplementsTimWithMeal: 'With meal',
  supplementsTimBeforeBed: 'Before bed',

  sleepTitle: 'Sleep — 7 Days',
  sleepAvgQuality: 'Avg Quality',
  sleepAvgDeep: 'Avg Deep',
  sleepDebt: 'Sleep Debt',
  sleepInsights: 'Insights',
  sleepNoData: 'No sleep data',
  sleepNoDataMsg: 'No sleep data yet. Log sleep from the dashboard.',
  sleepOk: 'OK',
  sleepDeep: 'Deep',

  workoutsTitle: 'Workout Builder',
  workoutsExercises: 'Exercises',
  workoutsCreateNew: 'Create new',
  workoutsNoTemplates: 'No templates yet',
  workoutsExercisesAdded: 'Exercises added',
  workoutsVolume: 'Volume',

  exercisesAdd: 'Add exercise',
  exercisesAddTitle: 'Add Exercise',
  exercisesSearch: 'Search exercises...',
  exercisesName: 'Name',
  exercisesMuscleGroup: 'Muscle group',
  exercisesEquipment: 'Equipment',
  exercisesAddBtn: 'Add exercise',

  progressWeight: 'Weight',
  progressMeasurements: 'Measurements',
  progressPhotos: 'Progress photos',
  progressCurrent: 'Current',
  progressChange: 'Change',
  progressRecords: 'Records',
  progressWeightChart: 'Weight Chart',
  progressMeasurementTrend: 'Measurement Trend',
  progressMeasurementHistory: 'Measurement History',
  progressDeleteMeasurement: 'Delete this measurement?',
  progressDeleteMeasurementBody: 'The whole row for this date is removed from the table and the chart.',
  progressAddMeasurement: 'Add measurement',
  progressDate: 'Date',
  progressNoMeasurements: 'No measurements yet. Tap above to start tracking.',
  progressNoPhotos: 'No progress photos yet',
  progressSaved: 'Measurements saved!',

  biometricsTitle: 'Biometrics',
  biometricsManual: 'Manual entry',
  biometricsNoData: 'No biometric data',
  biometricsNoDataMsg: 'Use Camera or manual entry to start tracking',
  biometricsHeartRate: 'Resting heart rate',
  biometricsBreathRate: 'Respiratory rate',
  biometricsBloodOxygen: 'Blood oxygen',
  biometricsBreathUnit: 'breaths/min',
  biometricsDisclaimer1: 'Biometric data is estimated only and does NOT have clinical or medical-grade accuracy. Do not use for diagnosis or treatment.',

  logBioTitle: 'Enter Biometrics',
  logBioHR: 'Resting heart rate (bpm)',
  logBioHRV: 'HRV RMSSD (ms)',
  logBioSpO2: 'SpO₂ (%)',
  logBioVO2: 'VO₂max (ml/kg/min) — estimate',
  logBioResp: 'Respiratory rate (rpm)',
  logBioSaved: 'Biometrics saved!',
  healthOwnedNote: 'Apple Health measured these. You can edit them, but not add new ones.',
  nCxLogBioSoreness: 'Soreness today (optional)',
  nCxLogBioSorenessHint: '1 = none, 10 = worst',
  nCxLogBioIllness: 'Feeling ill today',
  nCxWidgetRestDay: 'Rest day',
  nCxWidgetDone: 'Done',
  nCxWidgetNoWorkout: 'No workout yet',
  nCxLastTrained: 'Last trained',
  nCxTrainedToday: 'Today',
  nCxTrainedYesterday: 'Yesterday',
  nCxTrainedDaysAgo: '{n} {n:day|days} ago',
  nCxNeverTrained: 'Not trained yet',
  healthOverrideTitle: 'Replace the Apple Health reading?',
  healthOverrideMsg:
    'You are changing {n} reading(s) Apple Health measured. Save and the app uses yours, and Apple Health will not overwrite it again.',
  healthOverrideConfirm: 'Use mine',
  outOfRange: 'Must be between {min} and {max} {unit}',
  statsRequired: 'A valid height, weight and date of birth are needed first',
  sleepStagesOverrun: 'Stages add up to {sum} min, longer than the night itself ({total} min)',

  logMealSaved: 'Meal saved!',
  logMealQueued: 'Saved — will sync when you are back online',

  logWorkoutSaved: 'Workout saved!',

  logSleepDeep: 'Deep',
  logSleepREM: 'REM',
  logSleepLight: 'Light',
  logSleepSaved: 'Sleep logged!',
  logSleepMinutes: 'min',

  awardsTitle: 'Awards',
  awardsEarned: 'Earned',
  awardsOf: 'awards',

  weeklyReviewTitle: 'Weekly Review',
  weeklyReviewAvgCalories: 'Avg Calories',
  weeklyReviewAvgProtein: 'Avg Protein',
  weeklyReviewAvgSleep: 'Avg Sleep',
  weeklyReviewVolume: 'Volume',
  weeklyReviewReadiness: 'Readiness',
  weeklyReviewDailyNutrition: 'Daily Nutrition',
  weeklyReviewSleepChart: 'Sleep',
  nCxWeeklyReviewVolumeLoad: 'Volume Load',
  weeklyReviewReadinessChart: 'Readiness',
  weeklyReviewRecommendations: 'Next Week Recommendations',
  weeklyReviewSessions: '{n} {n:session|sessions}',

  smartGoalsTitle: 'Target calibration',
  smartGoalsWeightTrend: 'Weight Trend (4 Weeks)',
  smartGoalsOnTrack: "On track! Keep your current routine.",
  smartGoalsOffTrack: 'Off track. See suggestions below.',
  smartGoalsCalorieSuggestion: 'Calorie Suggestion',
  smartGoalsMeasured: 'Measured from your own intake and weight over the last {d} {d:day|days}, not from a formula.',
  smartGoalsNeedData: 'Need at least 3 weight entries in the last 4 weeks',
  smartGoalsNeedDataMsg: 'Log weight daily on Dashboard for analysis.',
  smartGoalsProteinCoach: 'Protein Distribution Coach',
  smartGoalsPerDay: 'Target/day',
  smartGoalsPerMeal: '/ meal',
  smartGoalsLowDays: 'low days/14 days',
  smartGoalsProteinSplit: 'Protein split suggestion',
  smartGoalsNoNutritionData: 'No nutrition data yet. Log meals for suggestions.',

  aiCoachTitle: 'AI Coach',
  aiCoachHello: 'Hello!',
  aiCoachIntro: "I'm your AI Coach — I analyze your training, nutrition, sleep and recovery data to give personalized advice.",
  aiCoachPlaceholder: 'Ask about nutrition, training, recovery...',
  aiCoachHistory: 'Chat history',
  aiCoachNoHistory: 'No conversations yet',

  grocerySubtitle: 'Shopping list from meal plan & custom list',

  /* ── onboarding 13 màn (Giai đoạn 3) ── */
  obBack: 'Back',
  obNext: 'Continue',
  obDragHint: 'Drag to adjust',
  obStart: 'Get started',
  obIntentionQ: 'What do you want to change?',
  obIntentionWhy: 'This decides your calories and macros every day.',
  obBranchBody: 'Body',
  obBranchBodyDesc: 'Build muscle, lose fat, or both',
  obBranchCapacity: 'Capacity',
  obBranchCapacityDesc: 'Get stronger or last longer',
  obBranchMaintain: 'Hold steady',
  obBranchMaintainDesc: 'Keep where you are',
  obGoalQ: 'A little more specific?',
  obGoalBulk: 'Build muscle',
  obGoalBulkDesc: 'Eat in surplus, protein first',
  obGoalCut: 'Lose fat',
  obGoalCutDesc: 'Eat in deficit, keep the muscle',
  obGoalRecomp: 'Both at once',
  obGoalRecompDesc: 'Slower, but you get both',
  obGoalStrength: 'Stronger',
  obGoalStrengthDesc: 'Move heavier weight',
  obGoalEndurance: 'More endurance',
  obGoalEnduranceDesc: 'Go further before you tire',
  obSexQ: 'Which applies to you?',
  obSexWhy: 'The resting-energy formula branches on this.',
  obSexMale: 'Male',
  obSexFemale: 'Female',
  obSexOther: 'Other',
  obDobQ: 'When were you born?',
  obDobWhy: 'Age changes your resting energy.',
  obDobBad: 'Your date of birth has to be in the past, and the age under 130.',
  obHeightQ: 'How tall are you?',
  obHeightWhy: 'With your weight, this gives your resting energy.',
  obWeightQ: 'What do you weigh today?',
  obActivityQ: 'What does an ordinary day look like?',
  obActivityWhy: 'This already includes your training.',
  obActSedentary: 'Sedentary',
  obActSedentaryDesc: 'Sitting most of the day',
  obActLight: 'Light',
  obActLightDesc: 'On your feet a little',
  obActModerate: 'Moderate',
  obActModerateDesc: 'Training 3–5 times a week',
  obActHigh: 'High',
  obActHighDesc: 'Hard training or physical work',
  obActAthlete: 'Athlete',
  obActAthleteDesc: 'Twice a day',
  obExpQ: 'Where are you starting from?',
  obExpWhy: 'Your AI coach uses this to pick how it talks to you.',
  obExpNew: "I'm just starting",
  obExpNewDesc: 'Never trained, or back after a long break',
  obExpSteady: "I've been at it a while",
  obExpSteadyDesc: 'Somewhere between one and three years',
  obExpDeep: "I've got years behind me",
  obExpDeepDesc: 'Training steadily for more than three years',
  obPlanEyebrow: 'Your plan',
  obPlanFor: 'a day, for {goal}',
  obPlanMacros: 'Protein {p}g · Carbs {c}g · Fat {f}g',
  obPlanWater: '{v} of water a day',
  obPlanSleep: '{h} {h:hour|hours} of sleep a night',
  obPlanRank: 'Level {n} — first of six',
  obHealthQ: 'ASCND can see your day more clearly.',
  obHealthChart: 'Four days you log · three the watch fills in',
  obHealthRead1: 'Steps and energy',
  obHealthRead2: 'Sleep',
  obHealthRead3: 'Resting heart rate and HRV',
  obHealthRead4: 'Workouts from your watch',
  obHealthConnect: 'Connect Health',
  obHealthLater: 'Not now',
  obHealthLegal: 'Health data never leaves this device.',
  obReadyEyebrow: 'Everything is ready',
  obReadyLine: 'Your first ascend starts here.',
  obReadyCta: 'Start the journey',
  obReadyLegal: 'By starting you agree to the Terms, the Privacy Policy and the Health Data notice.',

  onboardingHealthWhy: 'Activity, sleep and vitals from your iPhone or Apple Watch keep the plan current with your week, instead of waiting for you to type each day in.',
  onboardingTrainingLevel: 'Training level',
  onboardingBeginner: 'Beginner',
  onboardingIntermediate: 'Intermediate',
  onboardingAdvanced: 'Advanced',
  onboardingDiet: 'Dietary preference',
  onboardingAllergies: 'Food allergies',
  onboardingDislikedFoods: 'Disliked foods',
  onboardingDietOmnivore: 'Omnivore',
  onboardingDietVegetarian: 'Vegetarian',
  onboardingDietHalal: 'Halal',
  onboardingDislikedFoodsPlaceholder: 'e.g. onion, cilantro, organ meats',

  muscleChest: 'Chest',
  muscleBack: 'Back',
  muscleShoulders: 'Shoulders',
  muscleBiceps: 'Biceps',
  muscleTriceps: 'Triceps',
  muscleQuads: 'Quads',
  muscleHamstrings: 'Hamstrings',
  muscleGlutes: 'Glutes',
  muscleAbs: 'Abs',
  muscleFullBody: 'Full Body',
  muscleCardio: 'Cardio',

  measureNeck: 'Neck (cm)',
  measureShoulders: 'Shoulders (cm)',
  measureChest: 'Chest (cm)',
  measureWaist: 'Waist (cm)',
  measureHips: 'Hips (cm)',
  measureBicepL: 'Left bicep (cm)',
  measureBicepR: 'Right bicep (cm)',
  measureThighL: 'Left thigh (cm)',
  measureThighR: 'Right thigh (cm)',
  measureCalfL: 'Left calf (cm)',
  measureCalfR: 'Right calf (cm)',
  measureBodyFat: 'Body fat (%)',

  dcActivity: 'Activity',
  dcActivityMove: 'Move',
  dcActivityExercise: 'Exercise',
  dcActivitySteps: 'Steps',
  dcActivityKcal: 'kcal',
  dcActivityMin: 'min',
  dcActivityStepsUnit: 'steps',
  dcActivityEmpty: 'No activity today yet. Connect Apple Health for calories and steps, or log a workout.',
  dcActivityEstimated: '~ Tilde numbers are estimated from the workouts you logged, not measured by a device.',
  dcNutritionTitle: 'Nutrition',
  dcNutritionTarget: 'Target',
  dcNutritionRemaining: 'Remaining',
  dcMacroLeft: 'left',
  dcMacroDone: 'done',
  dcMacroOver: 'over goal',
  dcMacroEaten: 'eaten',
  dcNutritionSurplus: 'Surplus',
  dcNutritionOnTarget: 'On target',
  dcSleepTitle: 'Sleep',
  dcSleepTarget: 'Target',
  dcSleepQuality: 'Quality',
  dcBioTitle: 'Biometrics',
  dcBioNotConnected: 'Not connected',
  dcBioFitness: 'Fitness',
  dcReadinessTitle: 'Readiness Score',
  /* A verdict, not a category name — see the Vietnamese entries. */
  dcReadinessTrain: 'READY TO TRAIN',
  dcReadinessModerate: 'TRAIN MODERATELY',
  dcReadinessRecover: 'RECOVER TODAY',
  dcTrainingTitle: 'Training',
  dcRecentAwards: 'Recent Awards',
  dcViewAll: 'View all',

  foodAddTitle: 'Add Food Item',
  foodEditTitle: 'Edit Food Item',
  foodName: 'Food name',
  foodNamePlaceholder: 'e.g. Chicken breast, Rice...',
  foodBrand: 'Brand',
  foodBrandPlaceholder: 'e.g. Kirkland, Optimum...',
  foodServing: 'Serving size',
  foodCalories: 'Calories',
  foodAutoCalc: 'Auto-calc',
  foodProtein: 'Protein',
  foodCarbs: 'Carbs',
  foodFat: 'Fat',
  foodFiber: 'Fiber',
  foodAdded: 'Food item added!',
  foodUpdated: 'Food item updated!',
  foodDeleted: 'Food item deleted!',
  foodAddCustom: 'Add food',

  stepsGoal: 'Goal',
};

const translations: Record<AppLang, Translations> = { vi, en, es };

export function useTranslation(lang: AppLang): Translations {
  return translations[lang];
}

export function t(lang: AppLang): Translations {
  return translations[lang];
}
