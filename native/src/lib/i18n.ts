export type AppLang = 'vi' | 'en';
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
];

export function formatPrice(value: number, currency: CurrencyCode): string {
  const cur = CURRENCIES.find(c => c.code === currency);
  if (!cur) return `${value}`;
  if (currency === 'VND') return `${Math.round(value).toLocaleString()}${cur.symbol}`;
  if (currency === 'KRW') return `${cur.symbol}${Math.round(value).toLocaleString()}`;
  return `${cur.symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getLocale(lang: AppLang): string {
  const map: Record<AppLang, string> = { vi: 'vi-VN', en: 'en-US' };
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
  thisWeek: string;
  target: string;
  all: string;
  other: string;
  settings: string;
  
  // Greeting
  goodMorning: string;
  goodAfternoon: string;
  goodEvening: string;

  // Auth
  authLogin: string;
  authSignup: string;
  authEmail: string;
  authPassword: string;
  authName: string;
  authLoginSubtitle: string;
  authSignupSubtitle: string;
  authNoAccount: string;
  authHasAccount: string;
  authCheckEmail: string;
  authProcessing: string;
  authYourName: string;
  authForgotPassword: string;
  authResetPassword: string;
  authResetSent: string;
  authBackToLogin: string;
  authNewPassword: string;
  authUpdatePassword: string;
  authPasswordUpdated: string;

  // Sidebar / Nav
  navToday: string;
  navNutrition: string;
  navWorkouts: string;
  navSupplements: string;
  navSleep: string;
  navWater: string;
  navBiometrics: string;
  navProgress: string;
  navWeeklyReview: string;
  navSmartGoals: string;
  navAwards: string;
  navChallenges: string;
  navGrocery: string;
  navAiCoach: string;
  navSettings: string;
  navMain: string;
  navAnalytics: string;

  // Dashboard
  dashLogMeal: string;
  dashLogWorkout: string;
  dashLogSleep: string;
  dashLogBiometrics: string;
  dashReadiness: string;
  dashReadinessMsg: string;
  logBioBaselineNote: string;
  logSleepReplaceGone: string;
  sleepNoteAlignedGood: string;
  sleepNoteAlignedPoor: string;
  sleepNoteFeltWorse: string;
  sleepNoteFeltBetter: string;
  sleepNoteScoreIsDuration: string;
  dashTrend: string;
  dashTrendMsg: string;
  dashActivity: string;
  dashActivityMsg: string;
  dashBiometrics: string;
  dashBiometricsMsg: string;
  dashTraining: string;
  dashTrainingMsg: string;
  dashNutrition: string;
  dashNutritionMsg: string;
  dashSleep: string;
  dashSleepMsg: string;
  dashSupplements: string;
  dashSupplementsMsg: string;
  dashEnterBiometrics: string;
  dashLogWorkoutAction: string;
  dashLogMealAction: string;
  dashLogSleepAction: string;

  // Weight Checkin
  weightTitle: string;
  weightSave: string;
  weightNotLogged: string;

  // Workout Status
  workoutStatusTitle: string;
  workoutStatusDone: string;
  workoutStatusNotYet: string;

  // Supplement Checklist
  supplementTodayTitle: string;

  // Settings
  settingsTitle: string;
  settingsGeneral: string;
  settingsProfile: string;
  settingsNutrition: string;
  settingsSleep: string;
  settingsSupplements: string;
  settingsData: string;
  settingsTheme: string;
  settingsThemeLight: string;
  settingsThemeDark: string;
  settingsThemeSystem: string;
  settingsLanguage: string;
  settingsCurrency: string;
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
  settingsUnits: string;
  settingsCaloriesMacros: string;
  settingsWaterTarget: string;
  settingsWaterRecommend: string;
  settingsSleepTarget: string;
  settingsSleepHours: string;
  settingsBedtime: string;
  settingsWakeTime: string;
  settingsSleepGoalSummary: string;
  settingsSupplementStack: string;
  settingsExportData: string;
  settingsExportDesc: string;
  settingsPrivacyLock: string;
  settingsPinSet: string;
  settingsPinSetDesc: string;
  settingsPinRemove: string;
  settingsPinSetup: string;
  settingsPinSetupDesc: string;
  settingsPinPlaceholder: string;
  settingsPinInstall: string;
  settingsMacroDistribution: string;
  settingsTotal: string;
  settingsSavedSuccess: string;
  settingsLogout: string;
  settingsChangePassword: string;
  settingsCurrentPassword: string;
  settingsNewPassword: string;
  settingsConfirmPassword: string;
  settingsPasswordChanged: string;
  settingsPasswordMismatch: string;
  settingsRecalcTargets: string;
  settingsRecalcDone: string;
  settings2FA: string;
  settings2FADesc: string;
  settings2FAEnabled: string;
  settings2FADisabled: string;
  settings2FASetup: string;
  settings2FAEnterCode: string;
  settings2FAVerify: string;
  settings2FARemove: string;
  settings2FARemoved: string;
  settings2FAVerified: string;
  settings2FAScanQR: string;
  settings2FABackupHint: string;
  settingsErrorSaving: string;
  settingsPinMinLength: string;
  settingsPinDone: string;
  settingsPinRemoved: string;
  settingsExported: string;
  settingsSupNameEmpty: string;
  settingsSupAdded: string;
  settingsSupDeleted: string;
  settingsNoSup: string;
  settingsNoSupHint: string;

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
  nutritionShopping: string;
  nutritionSearchFood: string;
  nutritionFavorites: string;
  nutritionRecent: string;
  nutritionResults: string;
  nutritionYourPlans: string;
  nutritionCreateNew: string;
  nutritionCreatePlan: string;
  nutritionPlanName: string;
  nutritionMealsPerDay: string;
  nutritionMeals: string;
  nutritionCreating: string;
  nutritionCreateBtn: string;
  nutritionNoPlans: string;
  nutritionShoppingEmpty: string;
  nutritionShoppingDesc: string;
  nutritionCreated: string;

  // Meal plan
  mealPlanTitle: string;
  mealPlanPlan: string;
  mealPlanShoppingList: string;
  mealBreakfast: string;
  mealLunch: string;
  mealDinner: string;
  mealSnack: string;
  mealPreWorkout: string;
  mealPostWorkout: string;
  mealAddFood: string;
  mealType: string;
  mealSearchFood: string;
  mealShoppingEmpty: string;
  mealShoppingEmptyDesc: string;
  mealTimes: string;
  mealAdded: string;

  // Supplements
  supplementsTitle: string;
  supplementsThisWeek: string;
  supplements30Days: string;
  supplementsYourStack: string;
  supplementsAddTitle: string;
  supplementsEditTitle: string;
  supplementsName: string;
  supplementsCategory: string;
  supplementsDose: string;
  supplementsTiming: string;
  supplementsNotes: string;
  supplementsCycle: string;
  supplementsNoCycle: string;
  supplementsOnOff: string;
  supplementsWeeksOn: string;
  supplementsWeeksOff: string;
  supplementsNoItems: string;
  supplementsUpdated: string;
  supplementsAdded: string;
  supplementsCatVitamin: string;
  supplementsCatMineral: string;
  supplementsCatPerformance: string;
  supplementsCatRecovery: string;
  supplementsCatHealth: string;
  supplementsCatOther: string;
  supplementsCatProtein: string;
  supplementsCatCreatine: string;
  supplementsCatNootropic: string;
  supplementsTimMorning: string;
  supplementsTimPreWorkout: string;
  supplementsTimPostWorkout: string;
  supplementsTimEvening: string;
  supplementsTimWithMeal: string;
  supplementsTimBeforeBed: string;

  // Sleep
  sleepTitle: string;
  sleepAvg: string;
  sleepAvgQuality: string;
  sleepAvgDeep: string;
  sleepDebt: string;
  sleepStages: string;
  sleepQualityTrend: string;
  sleepHabits: string;
  sleepInsights: string;
  sleepNoData: string;
  sleepNoDataMsg: string;
  sleepGood: string;
  sleepNeedsImprovement: string;
  sleepLow: string;
  sleepOk: string;
  sleepNeedCatchUp: string;
  sleepDeep: string;

  // Water
  waterTitle: string;
  waterGlasses: string;
  waterOfTarget: string;
  waterReminderOn: string;
  waterReminderOff: string;
  waterWeekChart: string;
  waterTodayLog: string;
  waterTimes: string;
  waterTargetLabel: string;
  waterCantLog: string;
  waterReminderEnabled: string;
  waterReminderDisabled: string;

  // Workouts
  workoutsTitle: string;
  workoutsTemplates: string;
  workoutsExercises: string;
  workoutsCreateNew: string;
  workoutsCreateTemplate: string;
  workoutsCreating: string;
  workoutsCreateBtn: string;
  workoutsNoTemplates: string;
  workoutsWeeklyPlan: string;
  workoutsAddExercise: string;
  workoutsExercisesAdded: string;
  workoutsVolume: string;
  workoutsCreated: string;
  workoutsType: string;

  // Exercise Library
  exercisesTitle: string;
  exercisesAdd: string;
  exercisesAddTitle: string;
  exercisesSearch: string;
  exercisesName: string;
  exercisesMuscleGroup: string;
  exercisesEquipment: string;
  exercisesFormCues: string;
  exercisesCommonMistakes: string;
  exercisesVideoUrl: string;
  exercisesAdding: string;
  exercisesAddBtn: string;
  exercisesNotFound: string;
  exercisesAdded: string;

  // Routine Planner
  routineTitle: string;
  routineDesc: string;
  routineRest: string;
  routineDeload: string;
  routineManageTemplates: string;
  routineUpdated: string;
  routineChooseWorkout: string;

  // Day labels
  dayMon: string;
  dayTue: string;
  dayWed: string;
  dayThu: string;
  dayFri: string;
  daySat: string;
  daySun: string;

  // Progress
  progressTitle: string;
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
  progressUploadPhoto: string;
  progressDate: string;
  progressPose: string;
  progressPoseFront: string;
  progressPoseSide: string;
  progressPoseBack: string;
  progressPoseFlex: string;
  progressNoMeasurements: string;
  progressNoPhotos: string;
  progressSaved: string;
  progressUploaded: string;
  progressSelectUpload: string;
  progressNotes: string;

  // Biometrics
  biometricsTitle: string;
  biometricsSubtitle: string;
  biometricsCameraHR: string;
  biometricsManual: string;
  biometricsSyncWearable: string;
  biometricsSyncing: string;
  biometricsNoData: string;
  biometricsNoDataMsg: string;
  biometricsRecentHistory: string;
  biometricsTime: string;
  biometricsSource: string;
  biometricsSourceCamera: string;
  biometricsSourceWearable: string;
  biometricsSourceManual: string;
  biometricsConfidence: string;
  biometricsEstimate: string;
  biometricsHeartRate: string;
  biometricsBreathRate: string;
  biometricsDisclaimerTitle: string;
  biometricsDisclaimer1: string;
  biometricsDisclaimer2: string;
  biometricsDisclaimer3: string;

  // Log Biometrics Dialog
  logBioTitle: string;
  logBioHR: string;
  logBioHRV: string;
  logBioSpO2: string;
  logBioVO2: string;
  logBioResp: string;
  logBioSaved: string;
  /** Shown under a field whose value is outside anything a body produces. Carries {min}, {max}, {unit}. */
  outOfRange: string;
  /** Refusing to work out a plan for a body nobody has described yet. */
  statsRequired: string;
  /** Sleep stages adding up to more than the night itself. Carries {sum}, {total}. */
  sleepStagesOverrun: string;

  // Log Meal Dialog
  logMealTitle: string;
  logMealType: string;
  logMealSearchFood: string;
  logMealSearchPlaceholder: string;
  logMealAdded: string;
  logMealServings: string;
  logMealSaved: string;
  logMealQueued: string;

  // Log Workout Dialog
  logWorkoutTitle: string;
  logWorkoutName: string;
  logWorkoutNamePlaceholder: string;
  logWorkoutSessionRPE: string;
  logWorkoutSets: string;
  logWorkoutAddSet: string;
  logWorkoutKg: string;
  logWorkoutReps: string;
  logWorkoutRPE: string;
  logWorkoutVolumeLoad: string;
  logWorkoutSaved: string;
  logWorkoutSaveBtn: string;

  // Log Sleep Dialog
  logSleepTitle: string;
  logSleepBedtime: string;
  logSleepWaketime: string;
  logSleepQuality: string;
  logSleepDeep: string;
  logSleepREM: string;
  logSleepLight: string;
  logSleepCaffeine: string;
  logSleepScreen: string;
  logSleepSaved: string;
  logSleepSaveBtn: string;
  logSleepMinutes: string;

  // Awards
  awardsTitle: string;
  awardsEarned: string;
  awardsOf: string;

  // Challenges
  challengesTitle: string;
  challengesCompleted: string;
  challengesDaysLeft: string;
  challengesProgress: string;
  challengesReward: string;
  challengesUpdateProgress: string;
  challengesUpdating: string;

  // Weekly Review
  weeklyReviewTitle: string;
  weeklyReviewExport: string;
  weeklyReviewExporting: string;
  weeklyReviewExported: string;
  weeklyReviewAvgCalories: string;
  weeklyReviewAvgProtein: string;
  weeklyReviewAvgSleep: string;
  weeklyReviewVolume: string;
  weeklyReviewReadiness: string;
  weeklyReviewDailyNutrition: string;
  weeklyReviewSleepChart: string;
  weeklyReviewReadinessChart: string;
  weeklyReviewRecommendations: string;
  weeklyReviewSessions: string;

  // Smart Goals
  smartGoalsTitle: string;
  smartGoalsSubtitle: string;
  smartGoalsWeightTrend: string;
  smartGoalsOnTrack: string;
  smartGoalsOffTrack: string;
  smartGoalsKeepGoing: string;
  smartGoalsSeeBelow: string;
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
  aiCoachSubtitle: string;
  aiCoachHello: string;
  aiCoachIntro: string;
  aiCoachPlaceholder: string;
  aiCoachHistory: string;
  aiCoachNoHistory: string;
  aiCoachConnectionError: string;
  aiCoachPrompt1: string;
  aiCoachPrompt2: string;
  aiCoachPrompt3: string;
  aiCoachPrompt4: string;

  // Grocery
  groceryTitle: string;
  grocerySubtitle: string;
  groceryShoppingList: string;
  groceryBought: string;
  groceryAddProduct: string;
  groceryClearBought: string;
  groceryProductName: string;
  groceryQuantity: string;
  groceryPrice: string;
  groceryNoItems: string;
  groceryFromMealPlan: string;
  groceryTimesUsed: string;
  groceryCheapProtein: string;
  groceryDeleted: string;
  groceryAddedToList: string;
  groceryClearedBought: string;
  groceryNameRequired: string;
  groceryCategories: Record<string, string>;

  // Onboarding
  onboardingSetup: string;
  onboardingStep: string;
  onboardingStepPersonal: string;
  onboardingStepGoal: string;
  onboardingStepTraining: string;
  onboardingStepLifestyle: string;
  onboardingStepDiet: string;
  onboardingStepSupplements: string;
  onboardingStepConnect: string;
  onboardingConnectIntro: string;
  onboardingHealthTitle: string;
  onboardingHealthWhy: string;
  onboardingHealthConnect: string;
  onboardingHealthConnected: string;
  onboardingRemindTitle: string;
  onboardingRemindWhy: string;
  onboardingRemindEnable: string;
  onboardingRemindEnabled: string;
  onboardingConnectLater: string;
  onboardingYourGoal: string;
  onboardingTrainingLevel: string;
  onboardingBeginner: string;
  onboardingBeginnerDesc: string;
  onboardingIntermediate: string;
  onboardingIntermediateDesc: string;
  onboardingAdvanced: string;
  onboardingAdvancedDesc: string;
  onboardingDailyActivity: string;
  onboardingWorkType: string;
  onboardingWorkSedentary: string;
  onboardingWorkActive: string;
  onboardingAutoCalc: string;
  onboardingDiet: string;
  onboardingAllergies: string;
  onboardingDislikedFoods: string;
  onboardingComplete: string;
  onboardingCompleting: string;
  onboardingFinish: string;
  onboardingGoalBulk: string;
  onboardingGoalBulkDesc: string;
  onboardingGoalCut: string;
  onboardingGoalCutDesc: string;
  onboardingGoalMaintain: string;
  onboardingGoalMaintainDesc: string;
  onboardingGoalRecomp: string;
  onboardingGoalRecompDesc: string;
  onboardingGoalStrength: string;
  onboardingGoalStrengthDesc: string;
  onboardingGoalEndurance: string;
  onboardingGoalEnduranceDesc: string;
  onboardingWakeTime: string;
  onboardingSleepTime: string;
  onboardingDietOmnivore: string;
  onboardingDietVegetarian: string;
  onboardingDietHalal: string;
  onboardingDislikedFoodsPlaceholder: string;
  onboardingSelectSupplements: string;
  onboardingSummary: string;
  onboardingPrev: string;
  onboardingNext: string;
  onboardingDone: string;

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

  // Timing labels (for supplement checklist)
  timingMorning: string;
  timingPreWorkout: string;
  timingPostWorkout: string;
  timingBeforeBed: string;
  timingWithMeals: string;

  // Progress overload labels
  progressionDouble: string;
  progressionLinear: string;
  progressionNone: string;

  // Dashboard components
  dcActivity: string;
  dcActivityMove: string;
  dcActivityExercise: string;
  dcActivitySteps: string;
  dcActivityKcal: string;
  dcActivityMin: string;
  dcActivityStepsUnit: string;
  dcActivityEmpty: string;
  dcActivityConnect: string;
  dcActivityEstimated: string;
  dcNutritionTitle: string;
  dcNutritionTarget: string;
  dcNutritionPctOfGoal: string;
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
  dcBioSource: string;
  dcBioConfidence: string;
  dcBioFallback: string;
  dcBioEstimate: string;
  dcReadinessTitle: string;
  dcReadinessTrain: string;
  dcReadinessModerate: string;
  dcReadinessRecover: string;
  dcReadinessTrend: string;
  dcReadinessTrendDesc: string;
  dcReadinessAvg: string;
  dcReadinessBest: string;
  dcReadinessWorst: string;
  dcNudgesTitle: string;
  dcNudgesActive: string;
  dcTrainingTitle: string;
  dcTraining7dVolume: string;
  dcTrainingPain: string;
  dcRecentAwards: string;
  dcViewAll: string;
  dcSupplementToday: string;
  dcWeightTitle: string;

  // Food Scan
  scanFoodTitle: string;
  scanFoodCapture: string;
  scanFoodAnalyzing: string;
  scanFoodRetake: string;
  scanFoodAddToMeal: string;
  scanFoodNoFood: string;
  scanFoodError: string;
  scanFoodEstimated: string;
  scanFoodServing: string;
  scanFoodItems: string;

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
  stepsTitle: string;
  stepsSubtitle: string;
  stepsToday: string;
  stepsGoal: string;
  stepsAvg7d: string;
  stepsWeekly: string;
  stepsDaily: string;
  stepsTrend: string;
  stepsNoData: string;
  stepsNoDataMsg: string;
  stepsSyncApple: string;
  stepsSyncing: string;
  navSteps: string;
  notFoundTitle: string;
  notFoundBody: string;
  notFoundHome: string;
}

const vi: Translations = {
  loading: 'Đang tải...',
  save: 'Lưu',
  saving: 'Đang lưu...',
  cancel: 'Hủy',
  delete: 'Xóa',
  deleted: 'Đã xóa',
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
  thisWeek: 'Tuần này',
  target: 'Mục tiêu',
  all: 'Tất cả',
  other: 'Khác',
  settings: 'Cài đặt',

  goodMorning: 'Chào buổi sáng',
  goodAfternoon: 'Chào buổi chiều',
  goodEvening: 'Chào buổi tối',

  authLogin: 'Đăng nhập',
  authSignup: 'Đăng ký',
  authEmail: 'Email',
  authPassword: 'Mật khẩu',
  authName: 'Tên',
  authLoginSubtitle: 'Đăng nhập để tiếp tục',
  authSignupSubtitle: 'Tạo tài khoản mới',
  authNoAccount: 'Chưa có tài khoản?',
  authHasAccount: 'Đã có tài khoản?',
  authCheckEmail: 'Kiểm tra email để xác nhận tài khoản!',
  authProcessing: 'Đang xử lý...',
  authYourName: 'Tên của bạn',
  authForgotPassword: 'Quên mật khẩu?',
  authResetPassword: 'Đặt lại mật khẩu',
  authResetSent: 'Kiểm tra email để đặt lại mật khẩu!',
  authBackToLogin: 'Quay lại đăng nhập',
  authNewPassword: 'Mật khẩu mới',
  authUpdatePassword: 'Cập nhật mật khẩu',
  authPasswordUpdated: 'Mật khẩu đã được cập nhật!',

  navToday: 'Hôm nay',
  navNutrition: 'Dinh dưỡng',
  navWorkouts: 'Tập luyện',
  navSupplements: 'Supplements',
  navSleep: 'Giấc ngủ',
  navWater: 'Nước uống',
  navBiometrics: 'Sinh trắc học',
  navProgress: 'Tiến trình',
  navWeeklyReview: 'Weekly Review',
  navSmartGoals: 'Hiệu chỉnh mục tiêu',
  navAwards: 'Huy Chương',
  navChallenges: 'Thử Thách',
  navGrocery: 'Grocery List',
  navAiCoach: 'AI Coach',
  navSettings: 'Cài đặt',
  navMain: 'Chính',
  navAnalytics: 'Phân tích',

  dashLogMeal: 'Ghi bữa ăn',
  dashLogWorkout: 'Ghi buổi tập',
  dashLogSleep: 'Ghi giấc ngủ',
  dashLogBiometrics: 'Nhập sinh trắc',
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
  dashTrend: 'Xu Hướng',
  dashTrendMsg: 'Chưa có dữ liệu xu hướng sẵn sàng.',
  dashActivity: 'Hoạt Động',
  dashActivityMsg: 'Chưa có dữ liệu hoạt động hôm nay.',
  dashBiometrics: 'Sinh Trắc Học',
  dashBiometricsMsg: 'Chưa có dữ liệu. Nhấn để nhập.',
  dashTraining: 'Tập Luyện',
  dashTrainingMsg: 'Chưa có buổi tập nào. Nhấn để ghi.',
  dashNutrition: 'Dinh Dưỡng',
  dashNutritionMsg: 'Chưa ghi bữa ăn hôm nay. Nhấn để mở nhật ký.',
  dashSleep: 'Giấc Ngủ',
  dashSleepMsg: 'Chưa ghi giấc ngủ. Nhấn để ghi.',
  dashSupplements: 'Supplements',
  dashSupplementsMsg: 'Thêm supplements trong Settings.',
  dashEnterBiometrics: 'Nhập sinh trắc',
  dashLogWorkoutAction: 'Ghi buổi tập',
  dashLogMealAction: 'Ghi bữa ăn',
  dashLogSleepAction: 'Ghi giấc ngủ',

  weightTitle: 'Cân Nặng',
  weightSave: 'Lưu',
  weightNotLogged: 'Chưa ghi',

  workoutStatusTitle: 'Buổi Tập Hôm Nay',
  workoutStatusDone: 'Hoàn thành!',
  workoutStatusNotYet: 'Chưa tập',

  supplementTodayTitle: 'Supplement Hôm Nay',

  settingsTitle: 'Cài Đặt',
  settingsGeneral: 'Chung',
  settingsProfile: 'Hồ Sơ',
  settingsNutrition: 'Dinh Dưỡng',
  settingsSleep: 'Giấc Ngủ',
  settingsSupplements: 'Supplements',
  settingsData: 'Dữ Liệu',
  settingsTheme: 'Giao Diện',
  settingsThemeLight: 'Sáng',
  settingsThemeDark: 'Tối',
  settingsThemeSystem: 'Hệ thống',
  settingsLanguage: 'Ngôn Ngữ',
  settingsCurrency: 'Tiền Tệ',
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
  settingsUnits: 'Đơn Vị',
  settingsCaloriesMacros: 'Mục Tiêu Calories & Macros',
  settingsWaterTarget: 'Mục Tiêu Nước Uống',
  settingsWaterRecommend: 'Khuyến nghị: 30-35ml × cân nặng',
  settingsSleepTarget: 'Mục Tiêu Giấc Ngủ',
  settingsSleepHours: 'Số giờ mục tiêu',
  settingsBedtime: 'Giờ đi ngủ',
  settingsWakeTime: 'Giờ thức dậy',
  settingsSleepGoalSummary: 'Mục tiêu',
  settingsSupplementStack: 'Supplement Stack',
  settingsExportData: 'Xuất Dữ Liệu',
  settingsExportDesc: 'Tải xuống toàn bộ dữ liệu cân nặng, dinh dưỡng, tập luyện, giấc ngủ.',
  settingsPrivacyLock: 'Privacy Lock',
  settingsPinSet: 'PIN đã được cài đặt',
  settingsPinSetDesc: 'Ứng dụng sẽ yêu cầu PIN khi mở lại',
  settingsPinRemove: 'Xóa PIN',
  settingsPinSetup: 'Cài đặt PIN để bảo vệ dữ liệu cá nhân.',
  settingsPinSetupDesc: 'Cài đặt PIN để bảo vệ dữ liệu cá nhân.',
  settingsPinPlaceholder: 'Nhập PIN (≥4 ký tự)',
  settingsPinInstall: 'Cài đặt',
  settingsMacroDistribution: 'Phân bổ Macros',
  settingsTotal: 'Tổng',
  settingsSavedSuccess: 'Đã lưu thành công!',
  settingsLogout: 'Đăng xuất',
  settingsChangePassword: 'Đổi mật khẩu',
  settingsCurrentPassword: 'Mật khẩu hiện tại',
  settingsNewPassword: 'Mật khẩu mới',
  settingsConfirmPassword: 'Xác nhận mật khẩu mới',
  settingsPasswordChanged: 'Đổi mật khẩu thành công!',
  settingsPasswordMismatch: 'Mật khẩu xác nhận không khớp',
  settingsRecalcTargets: 'Tính lại theo chỉ số',
  settingsRecalcDone: 'Đã tính lại mục tiêu từ chỉ số của bạn',
  settings2FA: 'Xác thực 2 yếu tố',
  settings2FADesc: 'Bảo vệ tài khoản bằng ứng dụng xác thực (Google Authenticator, Authy...)',
  settings2FAEnabled: 'Đã bật',
  settings2FADisabled: 'Chưa bật',
  settings2FASetup: 'Thiết lập 2FA',
  settings2FAEnterCode: 'Nhập mã 6 số từ ứng dụng xác thực',
  settings2FAVerify: 'Xác nhận',
  settings2FARemove: 'Tắt 2FA',
  settings2FARemoved: 'Đã tắt xác thực 2 yếu tố',
  settings2FAVerified: 'Xác thực 2 yếu tố đã được bật!',
  settings2FAScanQR: 'Quét mã QR bằng ứng dụng xác thực',
  settings2FABackupHint: 'Lưu mã dự phòng ở nơi an toàn',
  settingsErrorSaving: 'Lỗi khi lưu',
  settingsPinMinLength: 'PIN phải có ít nhất 4 ký tự',
  settingsPinDone: 'Đã cài đặt PIN!',
  settingsPinRemoved: 'Đã xóa PIN',
  settingsExported: 'Đã xuất',
  settingsSupNameEmpty: 'Tên supplement không được trống',
  settingsSupAdded: 'Đã thêm supplement!',
  settingsSupDeleted: 'Đã xóa supplement',
  settingsNoSup: 'Chưa có supplement nào.',
  settingsNoSupHint: 'Nhấn "Thêm" để bắt đầu.',

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
  nutritionShopping: 'Đi chợ',
  nutritionSearchFood: 'Tìm thực phẩm...',
  nutritionFavorites: 'Yêu thích',
  nutritionRecent: 'Gần đây',
  nutritionResults: 'kết quả',
  nutritionYourPlans: 'Kế hoạch ăn của bạn',
  nutritionCreateNew: 'Tạo mới',
  nutritionCreatePlan: 'Tạo kế hoạch ăn',
  nutritionPlanName: 'Tên kế hoạch ăn',
  nutritionMealsPerDay: 'Số bữa/ngày',
  nutritionMeals: 'bữa',
  nutritionCreating: 'Đang tạo...',
  nutritionCreateBtn: 'Tạo kế hoạch ăn',
  nutritionNoPlans: 'Chưa có kế hoạch ăn nào',
  nutritionShoppingEmpty: 'Tạo kế hoạch ăn trước để có danh sách đi chợ',
  nutritionShoppingDesc: 'Danh sách đi chợ được tạo tự động từ kế hoạch ăn của bạn',
  nutritionCreated: 'Đã tạo kế hoạch ăn!',

  mealPlanTitle: 'Kế hoạch ăn',
  mealPlanPlan: 'Kế hoạch',
  mealPlanShoppingList: 'Đi chợ',
  mealBreakfast: 'Bữa sáng',
  mealLunch: 'Bữa trưa',
  mealDinner: 'Bữa tối',
  mealSnack: 'Bữa phụ',
  mealPreWorkout: 'Trước tập',
  mealPostWorkout: 'Sau tập',
  mealAddFood: 'Thêm món',
  mealType: 'Loại bữa',
  mealSearchFood: 'Tìm thực phẩm...',
  mealShoppingEmpty: 'Thêm món vào kế hoạch để có danh sách đi chợ',
  mealShoppingEmptyDesc: 'Thêm món vào kế hoạch để có danh sách đi chợ',
  mealTimes: 'lần',
  mealAdded: 'Đã thêm!',

  supplementsTitle: 'Supplements',
  supplementsThisWeek: 'Tuần này',
  supplements30Days: '30 ngày',
  supplementsYourStack: 'Stack của bạn',
  supplementsAddTitle: 'Thêm Supplement',
  supplementsEditTitle: 'Sửa Supplement',
  supplementsName: 'Tên',
  supplementsCategory: 'Loại',
  supplementsDose: 'Liều lượng',
  supplementsTiming: 'Thời điểm',
  supplementsNotes: 'Ghi chú / Chống chỉ định',
  supplementsCycle: 'Chu kỳ (Cycle)',
  supplementsNoCycle: 'Không cycle',
  supplementsOnOff: 'On/Off tuần',
  supplementsWeeksOn: 'Tuần ON',
  supplementsWeeksOff: 'Tuần OFF',
  supplementsNoItems: 'Chưa có supplement nào',
  supplementsUpdated: 'Đã cập nhật!',
  supplementsAdded: 'Đã thêm!',
  supplementsCatVitamin: 'Vitamin',
  supplementsCatMineral: 'Khoáng chất',
  supplementsCatPerformance: 'Hiệu suất',
  supplementsCatRecovery: 'Phục hồi',
  supplementsCatHealth: 'Sức khỏe',
  supplementsCatOther: 'Khác',
  supplementsCatProtein: 'Protein',
  supplementsCatCreatine: 'Creatine',
  supplementsCatNootropic: 'Nootropic',
  supplementsTimMorning: 'Sáng',
  supplementsTimPreWorkout: 'Trước tập',
  supplementsTimPostWorkout: 'Sau tập',
  supplementsTimEvening: 'Tối',
  supplementsTimWithMeal: 'Cùng bữa ăn',
  supplementsTimBeforeBed: 'Trước ngủ',

  sleepTitle: 'Giấc Ngủ — 7 Ngày',
  sleepAvg: 'TB Giấc ngủ',
  sleepAvgQuality: 'TB Chất lượng',
  sleepAvgDeep: 'TB Deep',
  sleepDebt: 'Nợ ngủ tuần',
  sleepStages: 'Giai Đoạn Giấc Ngủ',
  sleepQualityTrend: 'Xu Hướng Chất Lượng',
  sleepHabits: 'Thói Quen',
  sleepInsights: 'Nhận Xét',
  sleepNoData: 'Chưa có dữ liệu giấc ngủ',
  sleepNoDataMsg: 'Chưa có dữ liệu giấc ngủ. Hãy ghi log giấc ngủ từ dashboard.',
  sleepGood: 'Tốt',
  sleepNeedsImprovement: 'Cần cải thiện',
  sleepLow: 'Thấp',
  sleepOk: 'Ổn',
  sleepNeedCatchUp: 'Cần bù',
  sleepDeep: 'Deep',

  waterTitle: 'Theo Dõi Nước Uống',
  waterGlasses: 'ly',
  waterOfTarget: 'mục tiêu',
  waterReminderOn: 'Nhắc nhở đang bật',
  waterReminderOff: 'Bật nhắc nhở mỗi giờ',
  waterWeekChart: 'Tuần Này',
  waterTodayLog: 'Hôm Nay',
  waterTimes: 'lần',
  waterTargetLabel: 'Mục tiêu',
  waterCantLog: 'Không thể ghi nhận',
  waterReminderEnabled: 'Nhắc uống nước mỗi giờ đã bật',
  waterReminderDisabled: 'Đã tắt nhắc nhở',

  workoutsTitle: 'Tập luyện',
  workoutsTemplates: 'Templates',
  workoutsExercises: 'Bài tập',
  workoutsCreateNew: 'Tạo mới',
  workoutsCreateTemplate: 'Tạo Workout Template',
  workoutsCreating: 'Đang tạo...',
  workoutsCreateBtn: 'Tạo Template',
  workoutsNoTemplates: 'Chưa có template nào',
  workoutsWeeklyPlan: 'Lịch tập tuần',
  workoutsAddExercise: 'Thêm bài tập',
  workoutsExercisesAdded: 'Bài tập đã thêm',
  workoutsVolume: 'Khối lượng',
  workoutsCreated: 'Đã tạo template!',
  workoutsType: 'Loại',

  exercisesTitle: 'Bài Tập',
  exercisesAdd: 'Thêm bài tập',
  exercisesAddTitle: 'Thêm Bài Tập',
  exercisesSearch: 'Tìm bài tập...',
  exercisesName: 'Tên',
  exercisesMuscleGroup: 'Nhóm cơ',
  exercisesEquipment: 'Dụng cụ',
  exercisesFormCues: 'Form cues (mỗi dòng 1 cue)',
  exercisesCommonMistakes: 'Lỗi thường gặp (mỗi dòng 1 lỗi)',
  exercisesVideoUrl: 'Video URL (tùy chọn)',
  exercisesAdding: 'Đang thêm...',
  exercisesAddBtn: 'Thêm bài tập',
  exercisesNotFound: 'Không tìm thấy bài tập',
  exercisesAdded: 'Đã thêm bài tập!',

  routineTitle: 'Lịch Tập Tuần',
  routineDesc: 'Gán workout template cho từng ngày trong tuần. Bật deload để giảm tải.',
  routineRest: 'Nghỉ ngơi',
  routineDeload: 'Deload',
  routineManageTemplates: 'Quản lý Templates',
  routineUpdated: 'Đã cập nhật!',
  routineChooseWorkout: 'Chọn workout...',

  dayMon: 'Thứ 2',
  dayTue: 'Thứ 3',
  dayWed: 'Thứ 4',
  dayThu: 'Thứ 5',
  dayFri: 'Thứ 6',
  daySat: 'Thứ 7',
  daySun: 'Chủ nhật',

  progressTitle: 'Tiến Trình',
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
  progressUploadPhoto: 'Tải ảnh',
  progressDate: 'Ngày',
  progressPose: 'Tư thế',
  progressPoseFront: 'Mặt trước',
  progressPoseSide: 'Mặt bên',
  progressPoseBack: 'Mặt sau',
  progressPoseFlex: 'Flex',
  progressNoMeasurements: 'Chưa có số đo. Nhấn nút phía trên để bắt đầu theo dõi.',
  progressNoPhotos: 'Chưa có ảnh tiến trình',
  progressSaved: 'Đã lưu số đo!',
  progressUploaded: 'Đã tải ảnh!',
  progressSelectUpload: 'Chọn ảnh & Tải lên',
  progressNotes: 'Ghi chú',

  biometricsTitle: 'Sinh Trắc Học',
  biometricsSubtitle: 'Theo dõi HR, HRV, SpO₂, VO₂max và nhịp thở',
  biometricsCameraHR: 'Đo qua Camera',
  biometricsManual: 'Nhập thủ công',
  biometricsSyncWearable: 'Đồng bộ Wearable',
  biometricsSyncing: 'Đang đồng bộ...',
  biometricsNoData: 'Chưa có dữ liệu sinh trắc học',
  biometricsNoDataMsg: 'Dùng Camera hoặc nhập thủ công để bắt đầu theo dõi',
  biometricsRecentHistory: 'Lịch Sử Gần Đây',
  biometricsTime: 'Thời gian',
  biometricsSource: 'Nguồn',
  biometricsSourceCamera: 'Camera rPPG · ước tính',
  biometricsSourceWearable: 'Thiết bị đeo',
  biometricsSourceManual: 'Nhập thủ công',
  biometricsConfidence: 'tin cậy',
  biometricsEstimate: 'ước tính',
  biometricsHeartRate: 'Nhịp tim nghỉ',
  biometricsBreathRate: 'Nhịp Thở',
  biometricsDisclaimerTitle: 'Cảnh báo An toàn Sức khoẻ',
  biometricsDisclaimer1: 'Dữ liệu sinh trắc học chỉ mang tính ước tính, KHÔNG có độ chính xác y khoa. Không sử dụng để chẩn đoán hoặc điều trị bệnh.',
  biometricsDisclaimer2: 'Gợi ý từ AI được tạo bởi thuật toán máy học, KHÔNG phải bởi bác sĩ. Luôn tham khảo chuyên gia y tế trước khi đưa ra quyết định sức khoẻ.',
  biometricsDisclaimer3: 'Nếu gặp triệu chứng bất thường (đau ngực, khó thở, chóng mặt), hãy gọi cấp cứu ngay — KHÔNG dựa vào ứng dụng.',

  logBioTitle: 'Nhập Chỉ Số Sinh Trắc',
  logBioHR: 'Nhịp tim nghỉ (bpm)',
  logBioHRV: 'HRV RMSSD (ms)',
  logBioSpO2: 'SpO₂ (%)',
  logBioVO2: 'VO₂max (ml/kg/min) — ước tính',
  logBioResp: 'Nhịp thở (rpm)',
  logBioSaved: 'Đã lưu chỉ số sinh trắc!',
  outOfRange: 'Cần nằm trong khoảng {min}–{max} {unit}',
  statsRequired: 'Cần chiều cao, cân nặng và ngày sinh hợp lệ trước khi tính',
  sleepStagesOverrun: 'Các giai đoạn cộng lại {sum} phút, dài hơn cả đêm ({total} phút)',

  logMealTitle: 'Ghi Bữa Ăn',
  logMealType: 'Loại bữa',
  logMealSearchFood: 'Tìm thực phẩm',
  logMealSearchPlaceholder: 'Tìm kiếm...',
  logMealAdded: 'Đã thêm',
  logMealServings: 'phần',
  logMealSaved: 'Đã lưu bữa ăn!',
  logMealQueued: 'Đã lưu — sẽ đồng bộ khi có mạng',

  logWorkoutTitle: 'Ghi Buổi Tập',
  logWorkoutName: 'Tên buổi tập',
  logWorkoutNamePlaceholder: 'VD: Push Day A',
  logWorkoutSessionRPE: 'Session RPE (1-10)',
  logWorkoutSets: 'Sets',
  logWorkoutAddSet: 'Thêm set',
  logWorkoutKg: 'Kg',
  logWorkoutReps: 'Reps',
  logWorkoutRPE: 'RPE',
  logWorkoutVolumeLoad: 'Volume Load',
  logWorkoutSaved: 'Đã lưu buổi tập!',
  logWorkoutSaveBtn: 'Lưu buổi tập',

  logSleepTitle: 'Ghi Giấc Ngủ',
  logSleepBedtime: 'Giờ ngủ',
  logSleepWaketime: 'Giờ dậy',
  logSleepQuality: 'Chất lượng (1-10)',
  logSleepDeep: 'Deep',
  logSleepREM: 'REM',
  logSleepLight: 'Light',
  logSleepCaffeine: 'Caffeine cutoff',
  logSleepScreen: 'Screen off',
  logSleepSaved: 'Đã lưu giấc ngủ!',
  logSleepSaveBtn: 'Lưu giấc ngủ',
  logSleepMinutes: 'phút',

  awardsTitle: 'Huy Chương',
  awardsEarned: 'Đã đạt',
  awardsOf: 'huy chương',

  challengesTitle: 'Thử Thách Tuần',
  challengesCompleted: 'Hoàn thành',
  challengesDaysLeft: 'Ngày còn lại',
  challengesProgress: 'Tiến độ',
  challengesReward: 'Phần thưởng',
  challengesUpdateProgress: 'Cập nhật tiến độ',
  challengesUpdating: 'Đang cập nhật...',

  weeklyReviewTitle: 'Tổng kết tuần',
  weeklyReviewExport: 'Xuất báo cáo',
  weeklyReviewExporting: 'Đang xuất...',
  weeklyReviewExported: 'Đã xuất báo cáo!',
  weeklyReviewAvgCalories: 'TB Calories',
  weeklyReviewAvgProtein: 'TB Protein',
  weeklyReviewAvgSleep: 'TB Giấc ngủ',
  weeklyReviewVolume: 'Khối lượng',
  weeklyReviewReadiness: 'Mức sẵn sàng',
  weeklyReviewDailyNutrition: 'Dinh Dưỡng Hàng Ngày',
  weeklyReviewSleepChart: 'Giấc Ngủ',
  weeklyReviewReadinessChart: 'Mức sẵn sàng',
  weeklyReviewRecommendations: 'Khuyến Nghị Tuần Tới',
  weeklyReviewSessions: 'buổi',

  smartGoalsTitle: 'Hiệu chỉnh mục tiêu',
  smartGoalsSubtitle: 'Đọc xu hướng cân nặng và lượng ăn của bạn, rồi đề xuất mục tiêu calo khớp với thực tế',
  smartGoalsWeightTrend: 'Xu Hướng Cân Nặng (4 Tuần)',
  smartGoalsOnTrack: 'Đang đi đúng hướng! Giữ nguyên chế độ hiện tại.',
  smartGoalsOffTrack: 'Lệch mục tiêu. Xem gợi ý bên dưới.',
  smartGoalsKeepGoing: 'Đang đi đúng hướng!',
  smartGoalsSeeBelow: 'Xem gợi ý bên dưới.',
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
  aiCoachSubtitle: 'Dựa trên dữ liệu cá nhân của bạn',
  aiCoachHello: 'Xin chào!',
  aiCoachIntro: 'Tôi là AI Coach — tôi phân tích dữ liệu tập luyện, dinh dưỡng, giấc ngủ và phục hồi của bạn để đưa ra lời khuyên cá nhân hóa.',
  aiCoachPlaceholder: 'Hỏi về dinh dưỡng, tập luyện, phục hồi...',
  aiCoachHistory: 'Lịch sử trò chuyện',
  aiCoachNoHistory: 'Chưa có cuộc trò chuyện nào',
  aiCoachConnectionError: 'Lỗi kết nối AI Coach',
  aiCoachPrompt1: 'Hôm nay tôi nên tập gì?',
  aiCoachPrompt2: 'Đánh giá dinh dưỡng tuần này',
  aiCoachPrompt3: 'Giấc ngủ ảnh hưởng thế nào?',
  aiCoachPrompt4: 'Tôi cần cải thiện gì?',

  groceryTitle: 'Grocery & Budget',
  grocerySubtitle: 'Danh sách mua sắm từ kế hoạch ăn & danh sách tùy chỉnh',
  groceryShoppingList: 'Danh Sách Mua Sắm',
  groceryBought: 'đã mua',
  groceryAddProduct: 'Thêm sản phẩm',
  groceryClearBought: 'Xóa đã mua',
  groceryProductName: 'Tên sản phẩm',
  groceryQuantity: 'SL (vd: 2kg)',
  groceryPrice: 'Giá',
  groceryNoItems: 'Chưa có sản phẩm. Nhấn "Thêm sản phẩm" để bắt đầu.',
  groceryFromMealPlan: 'Từ kế hoạch ăn',
  groceryTimesUsed: 'lần dùng',
  groceryCheapProtein: 'Cheap Protein List',
  groceryDeleted: 'Đã xóa',
  groceryAddedToList: 'Đã thêm vào danh sách',
  groceryClearedBought: 'Đã xóa các mục đã mua',
  groceryNameRequired: 'Tên không được trống',
  groceryCategories: {
    'Thịt & Cá': 'Thịt & Cá', 'Rau củ': 'Rau củ', 'Trái cây': 'Trái cây',
    'Sữa & Trứng': 'Sữa & Trứng', 'Gia vị': 'Gia vị', 'Đồ khô': 'Đồ khô',
    'Đồ uống': 'Đồ uống', 'Supplements': 'Supplements', 'Khác': 'Khác',
  },

  onboardingSetup: 'Thiết lập hồ sơ của bạn',
  onboardingStep: 'Bước',
  onboardingStepPersonal: 'Thông tin cá nhân',
  onboardingStepGoal: 'Mục tiêu',
  onboardingStepTraining: 'Trình độ tập',
  onboardingStepLifestyle: 'Lịch sinh hoạt',
  onboardingStepDiet: 'Chế độ ăn',
  onboardingStepSupplements: 'Thực phẩm bổ sung',
  onboardingStepConnect: 'Kết nối',
  onboardingConnectIntro: 'Hai thứ này làm app tự chạy thay vì bắt bạn nhập tay. Bỏ qua cũng được, bật lại trong Cài đặt bất cứ lúc nào.',
  onboardingHealthTitle: 'Apple Health',
  onboardingHealthWhy: 'Đọc bước chân, giấc ngủ, nhịp tim nghỉ và HRV để tính điểm sẵn sàng mỗi sáng. Không có nó, những số này phải nhập tay.',
  onboardingHealthConnect: 'Kết nối Apple Health',
  onboardingHealthConnected: 'Đã kết nối',
  onboardingRemindTitle: 'Nhắc nhở',
  onboardingRemindWhy: 'Nhắc uống nước, ghi bữa ăn và đi ngủ đúng giờ bạn vừa chọn.',
  onboardingRemindEnable: 'Bật nhắc nhở',
  onboardingRemindEnabled: 'Đã bật',
  onboardingConnectLater: 'Bỏ qua, để sau',
  onboardingYourGoal: 'Mục tiêu của bạn',
  onboardingTrainingLevel: 'Trình độ tập luyện',
  onboardingBeginner: 'Người mới',
  onboardingBeginnerDesc: '< 1 năm tập',
  onboardingIntermediate: 'Trung cấp',
  onboardingIntermediateDesc: '1–3 năm tập',
  onboardingAdvanced: 'Nâng cao',
  onboardingAdvancedDesc: '3+ năm tập',
  onboardingDailyActivity: 'Mức độ vận động hàng ngày',
  onboardingWorkType: 'Loại công việc',
  onboardingWorkSedentary: 'Ngồi nhiều (văn phòng)',
  onboardingWorkActive: 'Vận động (chân tay)',
  onboardingAutoCalc: 'Tính toán tự động',
  onboardingDiet: 'Chế độ ăn',
  onboardingAllergies: 'Dị ứng thực phẩm',
  onboardingDislikedFoods: 'Thực phẩm không thích',
  onboardingComplete: 'Thiết lập hoàn tất!',
  onboardingCompleting: 'Đang hoàn tất...',
  onboardingFinish: 'Hoàn tất thiết lập',
  onboardingGoalBulk: 'Tăng cân (Lean Bulk)',
  onboardingGoalBulkDesc: 'Tăng cơ, surplus ~10%',
  onboardingGoalCut: 'Giảm cân (Cut)',
  onboardingGoalCutDesc: 'Giảm mỡ, deficit ~20%',
  onboardingGoalMaintain: 'Duy trì (Maintain)',
  onboardingGoalMaintainDesc: 'Giữ cân nặng hiện tại',
  onboardingGoalRecomp: 'Tái cấu trúc (Recomp)',
  onboardingGoalRecompDesc: 'Giảm mỡ + tăng cơ',
  onboardingGoalStrength: 'Sức mạnh (Strength)',
  onboardingGoalStrengthDesc: 'Tập trung tăng lực',
  onboardingGoalEndurance: 'Sức bền (Endurance)',
  onboardingGoalEnduranceDesc: 'Cardio, chịu đựng',
  onboardingWakeTime: 'Giờ thức dậy',
  onboardingSleepTime: 'Giờ đi ngủ',
  onboardingDietOmnivore: 'Ăn tất cả',
  onboardingDietVegetarian: 'Ăn chay',
  onboardingDietHalal: 'Halal',
  onboardingDislikedFoodsPlaceholder: 'VD: hành, mùi, nội tạng',
  onboardingSelectSupplements: 'Chọn supplement cho stack của bạn',
  onboardingSummary: 'Tóm tắt mục tiêu',
  onboardingPrev: 'Quay lại',
  onboardingNext: 'Tiếp theo',
  onboardingDone: 'Hoàn tất',

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

  timingMorning: 'Sáng',
  timingPreWorkout: 'Trước tập',
  timingPostWorkout: 'Sau tập',
  timingBeforeBed: 'Trước ngủ',
  timingWithMeals: 'Cùng bữa ăn',

  progressionDouble: 'Double progression (reps → weight)',
  progressionLinear: 'Linear (tăng weight mỗi tuần)',
  progressionNone: 'Không tự tăng',

  dcActivity: 'Hoạt Động',
  dcActivityMove: 'Vận Động',
  dcActivityExercise: 'Tập Luyện',
  dcActivitySteps: 'Bước Chân',
  dcActivityKcal: 'kcal',
  dcActivityMin: 'phút',
  dcActivityStepsUnit: 'bước',
  dcActivityEmpty: 'Chưa có hoạt động nào hôm nay. Kết nối Apple Health để tự động lấy calo và bước chân, hoặc ghi một buổi tập.',
  dcActivityConnect: 'Kết nối Health',
  dcActivityEstimated: '~ Thời gian tập ước tính từ số set đã ghi.',
  dcNutritionTitle: 'Dinh Dưỡng',
  dcNutritionTarget: 'Mục tiêu',
  dcNutritionPctOfGoal: '{x}% mục tiêu',
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
  dcBioSource: 'Nguồn',
  dcBioConfidence: 'Độ tin cậy',
  dcBioFallback: 'Dự phòng',
  dcBioEstimate: 'ước tính',
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
  dcReadinessTrend: 'Sẵn Sàng 7 Ngày',
  dcReadinessTrendDesc: 'Mức độ sẵn sàng tập luyện của bạn trong tuần qua',
  dcReadinessAvg: 'TB',
  dcReadinessBest: 'Cao nhất',
  dcReadinessWorst: 'Thấp nhất',
  dcNudgesTitle: 'Nhắc Nhở Thói Quen',
  dcNudgesActive: 'đang bật',
  dcTrainingTitle: 'Tập Luyện',
  dcTraining7dVolume: 'Khối lượng 7 ngày',
  dcTrainingPain: 'Đau',
  dcRecentAwards: 'Huy Chương Gần Đây',
  dcViewAll: 'Tất cả',
  dcSupplementToday: 'Supplement Hôm Nay',
  dcWeightTitle: 'Cân Nặng',

  scanFoodTitle: 'Quét Thực Phẩm',
  scanFoodCapture: 'Chụp ảnh',
  scanFoodAnalyzing: 'Đang phân tích...',
  scanFoodRetake: 'Chụp lại',
  scanFoodAddToMeal: 'Thêm vào bữa ăn',
  scanFoodNoFood: 'Không nhận diện được thực phẩm',
  scanFoodError: 'Lỗi phân tích ảnh',
  scanFoodEstimated: 'Ước tính',
  scanFoodServing: 'khẩu phần',
  scanFoodItems: 'món',

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
  foodDeleted: 'Đã xóa thực phẩm!',
  foodAddCustom: 'Thêm thực phẩm',

  stepsTitle: 'Bước chân',
  stepsSubtitle: 'Theo dõi số bước hàng ngày từ Apple Watch',
  stepsToday: 'Hôm nay',
  stepsGoal: 'Mục tiêu',
  stepsAvg7d: 'TB 7 ngày',
  stepsWeekly: 'Tuần này',
  stepsDaily: 'Theo ngày',
  stepsTrend: 'Xu hướng',
  stepsNoData: 'Chưa có dữ liệu bước chân',
  stepsNoDataMsg: 'Đồng bộ từ Apple Watch hoặc nhập thủ công',
  stepsSyncApple: 'Đồng bộ Apple Health',
  stepsSyncing: 'Đang đồng bộ...',
  navSteps: 'Bước chân',
  notFoundTitle: 'Không tìm thấy trang',
  notFoundBody: 'Trang bạn tìm không tồn tại hoặc đã được di chuyển.',
  notFoundHome: 'Về trang chính',
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
  thisWeek: 'This week',
  target: 'Target',
  all: 'All',
  other: 'Other',
  settings: 'Settings',

  goodMorning: 'Good morning',
  goodAfternoon: 'Good afternoon',
  goodEvening: 'Good evening',

  authLogin: 'Log in',
  authSignup: 'Sign up',
  authEmail: 'Email',
  authPassword: 'Password',
  authName: 'Name',
  authLoginSubtitle: 'Log in to continue',
  authSignupSubtitle: 'Create a new account',
  authNoAccount: "Don't have an account?",
  authHasAccount: 'Already have an account?',
  authCheckEmail: 'Check your email to confirm your account!',
  authProcessing: 'Processing...',
  authYourName: 'Your name',
  authForgotPassword: 'Forgot password?',
  authResetPassword: 'Reset password',
  authResetSent: 'Check your email to reset your password!',
  authBackToLogin: 'Back to login',
  authNewPassword: 'New password',
  authUpdatePassword: 'Update password',
  authPasswordUpdated: 'Password updated successfully!',

  navToday: 'Today',
  navNutrition: 'Nutrition',
  navWorkouts: 'Workouts',
  navSupplements: 'Supplements',
  navSleep: 'Sleep',
  navWater: 'Water',
  navBiometrics: 'Biometrics',
  navProgress: 'Progress',
  navWeeklyReview: 'Weekly Review',
  navSmartGoals: 'Target calibration',
  navAwards: 'Awards',
  navChallenges: 'Challenges',
  navGrocery: 'Grocery List',
  navAiCoach: 'AI Coach',
  navSettings: 'Settings',
  navMain: 'Main',
  navAnalytics: 'Analytics',

  dashLogMeal: 'Log meal',
  dashLogWorkout: 'Log workout',
  dashLogSleep: 'Log sleep',
  dashLogBiometrics: 'Log biometrics',
  dashReadiness: 'Readiness',
  /* Four remarks, each standing on TWO numbers at once — see the Vietnamese
     entries. None of them diagnoses anything. */
  sleepNoteAlignedGood: 'Enough hours, and you felt good — the two agree.',
  sleepNoteAlignedPoor:
    '{short} minutes short of your target, and you felt it — the two agree. Get to bed earlier tonight.',
  sleepNoteFeltWorse:
    'Enough hours, but you still felt tired. Duration is not the only thing that makes a night; worth noticing if it repeats.',
  sleepNoteFeltBetter:
    'You felt good, even though last night was {short} minutes short. The sleep score is scored on DURATION, so it reads lower than you feel.',
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
  dashTrend: 'Trend',
  dashTrendMsg: 'No readiness trend data yet.',
  dashActivity: 'Activity',
  dashActivityMsg: 'No activity data for today.',
  dashBiometrics: 'Biometrics',
  dashBiometricsMsg: 'No data yet. Tap to enter.',
  dashTraining: 'Training',
  dashTrainingMsg: 'No workouts yet. Tap to log.',
  dashNutrition: 'Nutrition',
  dashNutritionMsg: 'No meals logged today. Tap to open your diary.',
  dashSleep: 'Sleep',
  dashSleepMsg: 'No sleep logged. Tap to log.',
  dashSupplements: 'Supplements',
  dashSupplementsMsg: 'Add supplements in Settings.',
  dashEnterBiometrics: 'Enter biometrics',
  dashLogWorkoutAction: 'Log workout',
  dashLogMealAction: 'Log meal',
  dashLogSleepAction: 'Log sleep',

  weightTitle: 'Weight',
  weightSave: 'Save',
  weightNotLogged: 'Not logged',

  workoutStatusTitle: "Today's Workouts",
  workoutStatusDone: 'Complete!',
  workoutStatusNotYet: 'Not started',

  supplementTodayTitle: "Today's Supplements",

  settingsTitle: 'Settings',
  settingsGeneral: 'General',
  settingsProfile: 'Profile',
  settingsNutrition: 'Nutrition',
  settingsSleep: 'Sleep',
  settingsSupplements: 'Supplements',
  settingsData: 'Data',
  settingsTheme: 'Appearance',
  settingsThemeLight: 'Light',
  settingsThemeDark: 'Dark',
  settingsThemeSystem: 'System',
  settingsLanguage: 'Language',
  settingsCurrency: 'Currency',
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
  settingsUnits: 'Units',
  settingsCaloriesMacros: 'Calories & Macros Target',
  settingsWaterTarget: 'Water Target',
  settingsWaterRecommend: 'Recommended: 30-35ml × body weight',
  settingsSleepTarget: 'Sleep Target',
  settingsSleepHours: 'Target hours',
  settingsBedtime: 'Bedtime',
  settingsWakeTime: 'Wake time',
  settingsSleepGoalSummary: 'Target',
  settingsSupplementStack: 'Supplement Stack',
  settingsExportData: 'Export Data',
  settingsExportDesc: 'Download all weight, nutrition, workout, and sleep data.',
  settingsPrivacyLock: 'Privacy Lock',
  settingsPinSet: 'PIN is set',
  settingsPinSetDesc: 'App will require PIN when reopened',
  settingsPinRemove: 'Remove PIN',
  settingsPinSetup: 'Set a PIN to protect personal data.',
  settingsPinSetupDesc: 'Set a PIN to protect personal data.',
  settingsPinPlaceholder: 'Enter PIN (≥4 chars)',
  settingsPinInstall: 'Set PIN',
  settingsMacroDistribution: 'Macro Distribution',
  settingsTotal: 'Total',
  settingsSavedSuccess: 'Saved successfully!',
  settingsLogout: 'Log out',
  settingsChangePassword: 'Change password',
  settingsCurrentPassword: 'Current password',
  settingsNewPassword: 'New password',
  settingsConfirmPassword: 'Confirm new password',
  settingsPasswordChanged: 'Password changed successfully!',
  settingsPasswordMismatch: 'Passwords do not match',
  settingsRecalcTargets: 'Recalculate from my stats',
  settingsRecalcDone: 'Targets recalculated from your stats',
  settings2FA: 'Two-Factor Authentication',
  settings2FADesc: 'Protect your account with an authenticator app (Google Authenticator, Authy...)',
  settings2FAEnabled: 'Enabled',
  settings2FADisabled: 'Not enabled',
  settings2FASetup: 'Set up 2FA',
  settings2FAEnterCode: 'Enter the 6-digit code from your authenticator app',
  settings2FAVerify: 'Verify',
  settings2FARemove: 'Disable 2FA',
  settings2FARemoved: 'Two-factor authentication disabled',
  settings2FAVerified: 'Two-factor authentication enabled!',
  settings2FAScanQR: 'Scan QR code with your authenticator app',
  settings2FABackupHint: 'Save the backup code somewhere safe',
  settingsErrorSaving: 'Error saving',
  settingsPinMinLength: 'PIN must be at least 4 characters',
  settingsPinDone: 'PIN set!',
  settingsPinRemoved: 'PIN removed',
  settingsExported: 'Exported',
  settingsSupNameEmpty: 'Supplement name cannot be empty',
  settingsSupAdded: 'Supplement added!',
  settingsSupDeleted: 'Supplement deleted',
  settingsNoSup: 'No supplements yet.',
  settingsNoSupHint: 'Tap "Add" to start.',

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
  nutritionShopping: 'Shopping',
  nutritionSearchFood: 'Search food...',
  nutritionFavorites: 'Favorites',
  nutritionRecent: 'Recent',
  nutritionResults: 'results',
  nutritionYourPlans: 'Your Meal Plans',
  nutritionCreateNew: 'Create new',
  nutritionCreatePlan: 'Create Meal Plan',
  nutritionPlanName: 'Plan name',
  nutritionMealsPerDay: 'Meals per day',
  nutritionMeals: 'meals',
  nutritionCreating: 'Creating...',
  nutritionCreateBtn: 'Create Plan',
  nutritionNoPlans: 'No meal plans yet',
  nutritionShoppingEmpty: 'Create a meal plan first to get a shopping list',
  nutritionShoppingDesc: 'Shopping list is auto-generated from your meal plan',
  nutritionCreated: 'Meal plan created!',

  mealPlanTitle: 'Meal Plan',
  mealPlanPlan: 'Plan',
  mealPlanShoppingList: 'Shopping',
  mealBreakfast: 'Breakfast',
  mealLunch: 'Lunch',
  mealDinner: 'Dinner',
  mealSnack: 'Snack',
  mealPreWorkout: 'Pre-workout',
  mealPostWorkout: 'Post-workout',
  mealAddFood: 'Add food',
  mealType: 'Meal type',
  mealSearchFood: 'Search food...',
  mealShoppingEmpty: 'Add food to plan to get a shopping list',
  mealShoppingEmptyDesc: 'Add food to plan to get a shopping list',
  mealTimes: 'times',
  mealAdded: 'Added!',

  supplementsTitle: 'Supplements',
  supplementsThisWeek: 'This week',
  supplements30Days: '30 days',
  supplementsYourStack: 'Your stack',
  supplementsAddTitle: 'Add Supplement',
  supplementsEditTitle: 'Edit Supplement',
  supplementsName: 'Name',
  supplementsCategory: 'Category',
  supplementsDose: 'Dose',
  supplementsTiming: 'Timing',
  supplementsNotes: 'Notes / Contraindications',
  supplementsCycle: 'Cycle',
  supplementsNoCycle: 'No cycle',
  supplementsOnOff: 'On/Off weeks',
  supplementsWeeksOn: 'Weeks ON',
  supplementsWeeksOff: 'Weeks OFF',
  supplementsNoItems: 'No supplements yet',
  supplementsUpdated: 'Updated!',
  supplementsAdded: 'Added!',
  supplementsCatVitamin: 'Vitamin',
  supplementsCatMineral: 'Mineral',
  supplementsCatPerformance: 'Performance',
  supplementsCatRecovery: 'Recovery',
  supplementsCatHealth: 'Health',
  supplementsCatOther: 'Other',
  supplementsCatProtein: 'Protein',
  supplementsCatCreatine: 'Creatine',
  supplementsCatNootropic: 'Nootropic',
  supplementsTimMorning: 'Morning',
  supplementsTimPreWorkout: 'Pre-workout',
  supplementsTimPostWorkout: 'Post-workout',
  supplementsTimEvening: 'Evening',
  supplementsTimWithMeal: 'With meal',
  supplementsTimBeforeBed: 'Before bed',

  sleepTitle: 'Sleep — 7 Days',
  sleepAvg: 'Avg Sleep',
  sleepAvgQuality: 'Avg Quality',
  sleepAvgDeep: 'Avg Deep',
  sleepDebt: 'Weekly Sleep Debt',
  sleepStages: 'Sleep Stages',
  sleepQualityTrend: 'Quality Trend',
  sleepHabits: 'Habits',
  sleepInsights: 'Insights',
  sleepNoData: 'No sleep data',
  sleepNoDataMsg: 'No sleep data yet. Log sleep from the dashboard.',
  sleepGood: 'Good',
  sleepNeedsImprovement: 'Needs improvement',
  sleepLow: 'Low',
  sleepOk: 'OK',
  sleepNeedCatchUp: 'Need catch-up',
  sleepDeep: 'Deep',

  waterTitle: 'Water Tracking',
  waterGlasses: 'glasses',
  waterOfTarget: 'of target',
  waterReminderOn: 'Reminder is on',
  waterReminderOff: 'Enable hourly reminder',
  waterWeekChart: 'This Week',
  waterTodayLog: 'Today',
  waterTimes: 'times',
  waterTargetLabel: 'Target',
  waterCantLog: 'Cannot log',
  waterReminderEnabled: 'Hourly water reminder enabled',
  waterReminderDisabled: 'Reminder disabled',

  workoutsTitle: 'Workout Builder',
  workoutsTemplates: 'Templates',
  workoutsExercises: 'Exercises',
  workoutsCreateNew: 'Create new',
  workoutsCreateTemplate: 'Create Workout Template',
  workoutsCreating: 'Creating...',
  workoutsCreateBtn: 'Create Template',
  workoutsNoTemplates: 'No templates yet',
  workoutsWeeklyPlan: 'Weekly plan',
  workoutsAddExercise: 'Add exercise',
  workoutsExercisesAdded: 'Exercises added',
  workoutsVolume: 'Volume',
  workoutsCreated: 'Template created!',
  workoutsType: 'Type',

  exercisesTitle: 'Exercises',
  exercisesAdd: 'Add exercise',
  exercisesAddTitle: 'Add Exercise',
  exercisesSearch: 'Search exercises...',
  exercisesName: 'Name',
  exercisesMuscleGroup: 'Muscle group',
  exercisesEquipment: 'Equipment',
  exercisesFormCues: 'Form cues (one per line)',
  exercisesCommonMistakes: 'Common mistakes (one per line)',
  exercisesVideoUrl: 'Video URL (optional)',
  exercisesAdding: 'Adding...',
  exercisesAddBtn: 'Add exercise',
  exercisesNotFound: 'No exercises found',
  exercisesAdded: 'Exercise added!',

  routineTitle: 'Weekly Schedule',
  routineDesc: 'Assign workout templates to each day. Toggle deload for lighter weeks.',
  routineRest: 'Rest',
  routineDeload: 'Deload',
  routineManageTemplates: 'Manage Templates',
  routineUpdated: 'Updated!',
  routineChooseWorkout: 'Choose workout...',

  dayMon: 'Mon',
  dayTue: 'Tue',
  dayWed: 'Wed',
  dayThu: 'Thu',
  dayFri: 'Fri',
  daySat: 'Sat',
  daySun: 'Sun',

  progressTitle: 'Progress',
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
  progressUploadPhoto: 'Upload photo',
  progressDate: 'Date',
  progressPose: 'Pose',
  progressPoseFront: 'Front',
  progressPoseSide: 'Side',
  progressPoseBack: 'Back',
  progressPoseFlex: 'Flex',
  progressNoMeasurements: 'No measurements yet. Tap above to start tracking.',
  progressNoPhotos: 'No progress photos yet',
  progressSaved: 'Measurements saved!',
  progressUploaded: 'Photo uploaded!',
  progressSelectUpload: 'Select photo & Upload',
  progressNotes: 'Notes',

  biometricsTitle: 'Biometrics',
  biometricsSubtitle: 'Track HR, HRV, SpO₂, VO₂max and respiratory rate',
  biometricsCameraHR: 'Camera HR',
  biometricsManual: 'Manual entry',
  biometricsSyncWearable: 'Sync Wearable',
  biometricsSyncing: 'Syncing...',
  biometricsNoData: 'No biometric data',
  biometricsNoDataMsg: 'Use Camera or manual entry to start tracking',
  biometricsRecentHistory: 'Recent History',
  biometricsTime: 'Time',
  biometricsSource: 'Source',
  biometricsSourceCamera: 'Camera rPPG · estimate',
  biometricsSourceWearable: 'Wearable',
  biometricsSourceManual: 'Manual',
  biometricsConfidence: 'confidence',
  biometricsEstimate: 'estimate',
  biometricsHeartRate: 'Resting heart rate',
  biometricsBreathRate: 'Breath Rate',
  biometricsDisclaimerTitle: 'Health Safety Disclaimer',
  biometricsDisclaimer1: 'Biometric data is estimated only and does NOT have clinical or medical-grade accuracy. Do not use for diagnosis or treatment.',
  biometricsDisclaimer2: 'AI suggestions are generated by machine learning algorithms, NOT by physicians. Always consult a healthcare professional before making health decisions.',
  biometricsDisclaimer3: 'If you experience abnormal symptoms (chest pain, shortness of breath, dizziness), call emergency services immediately — do NOT rely on this app.',

  logBioTitle: 'Enter Biometrics',
  logBioHR: 'Resting heart rate (bpm)',
  logBioHRV: 'HRV RMSSD (ms)',
  logBioSpO2: 'SpO₂ (%)',
  logBioVO2: 'VO₂max (ml/kg/min) — estimate',
  logBioResp: 'Respiratory rate (rpm)',
  logBioSaved: 'Biometrics saved!',
  outOfRange: 'Must be between {min} and {max} {unit}',
  statsRequired: 'A valid height, weight and date of birth are needed first',
  sleepStagesOverrun: 'Stages add up to {sum} min, longer than the night itself ({total} min)',

  logMealTitle: 'Log Meal',
  logMealType: 'Meal type',
  logMealSearchFood: 'Search food',
  logMealSearchPlaceholder: 'Search...',
  logMealAdded: 'Added',
  logMealServings: 'servings',
  logMealSaved: 'Meal saved!',
  logMealQueued: 'Saved — will sync when you are back online',

  logWorkoutTitle: 'Log Workout',
  logWorkoutName: 'Workout name',
  logWorkoutNamePlaceholder: 'E.g. Push Day A',
  logWorkoutSessionRPE: 'Session RPE (1-10)',
  logWorkoutSets: 'Sets',
  logWorkoutAddSet: 'Add set',
  logWorkoutKg: 'Kg',
  logWorkoutReps: 'Reps',
  logWorkoutRPE: 'RPE',
  logWorkoutVolumeLoad: 'Volume Load',
  logWorkoutSaved: 'Workout saved!',
  logWorkoutSaveBtn: 'Save workout',

  logSleepTitle: 'Log Sleep',
  logSleepBedtime: 'Bedtime',
  logSleepWaketime: 'Wake time',
  logSleepQuality: 'Quality (1-10)',
  logSleepDeep: 'Deep',
  logSleepREM: 'REM',
  logSleepLight: 'Light',
  logSleepCaffeine: 'Caffeine cutoff',
  logSleepScreen: 'Screen off',
  logSleepSaved: 'Sleep logged!',
  logSleepSaveBtn: 'Save sleep',
  logSleepMinutes: 'min',

  awardsTitle: 'Awards',
  awardsEarned: 'Earned',
  awardsOf: 'awards',

  challengesTitle: 'Weekly Challenges',
  challengesCompleted: 'Completed',
  challengesDaysLeft: 'Days left',
  challengesProgress: 'Progress',
  challengesReward: 'Reward',
  challengesUpdateProgress: 'Update progress',
  challengesUpdating: 'Updating...',

  weeklyReviewTitle: 'Weekly Review',
  weeklyReviewExport: 'Export report',
  weeklyReviewExporting: 'Exporting...',
  weeklyReviewExported: 'Report exported!',
  weeklyReviewAvgCalories: 'Avg Calories',
  weeklyReviewAvgProtein: 'Avg Protein',
  weeklyReviewAvgSleep: 'Avg Sleep',
  weeklyReviewVolume: 'Volume',
  weeklyReviewReadiness: 'Readiness',
  weeklyReviewDailyNutrition: 'Daily Nutrition',
  weeklyReviewSleepChart: 'Sleep',
  weeklyReviewReadinessChart: 'Readiness',
  weeklyReviewRecommendations: 'Next Week Recommendations',
  weeklyReviewSessions: 'sessions',

  smartGoalsTitle: 'Target calibration',
  smartGoalsSubtitle: 'Reads your weight trend and your intake, then suggests a calorie target that matches them',
  smartGoalsWeightTrend: 'Weight Trend (4 Weeks)',
  smartGoalsOnTrack: "On track! Keep your current routine.",
  smartGoalsOffTrack: 'Off track. See suggestions below.',
  smartGoalsKeepGoing: 'On track!',
  smartGoalsSeeBelow: 'See suggestions below.',
  smartGoalsCalorieSuggestion: 'Calorie Suggestion',
  smartGoalsMeasured: 'Measured from your own intake and weight over the last {d} days, not from a formula.',
  smartGoalsNeedData: 'Need at least 3 weight entries in the last 4 weeks',
  smartGoalsNeedDataMsg: 'Log weight daily on Dashboard for analysis.',
  smartGoalsProteinCoach: 'Protein Distribution Coach',
  smartGoalsPerDay: 'Target/day',
  smartGoalsPerMeal: '/ meal',
  smartGoalsLowDays: 'low days/14 days',
  smartGoalsProteinSplit: 'Protein split suggestion',
  smartGoalsNoNutritionData: 'No nutrition data yet. Log meals for suggestions.',

  aiCoachTitle: 'AI Coach',
  aiCoachSubtitle: 'Based on your personal data',
  aiCoachHello: 'Hello!',
  aiCoachIntro: "I'm your AI Coach — I analyze your training, nutrition, sleep and recovery data to give personalized advice.",
  aiCoachPlaceholder: 'Ask about nutrition, training, recovery...',
  aiCoachHistory: 'Chat history',
  aiCoachNoHistory: 'No conversations yet',
  aiCoachConnectionError: 'AI Coach connection error',
  aiCoachPrompt1: 'What should I train today?',
  aiCoachPrompt2: 'Review my nutrition this week',
  aiCoachPrompt3: 'How does sleep affect me?',
  aiCoachPrompt4: 'What should I improve?',

  groceryTitle: 'Grocery & Budget',
  grocerySubtitle: 'Shopping list from meal plan & custom list',
  groceryShoppingList: 'Shopping List',
  groceryBought: 'bought',
  groceryAddProduct: 'Add product',
  groceryClearBought: 'Clear bought',
  groceryProductName: 'Product name',
  groceryQuantity: 'Qty (e.g. 2kg)',
  groceryPrice: 'Price',
  groceryNoItems: 'No items yet. Tap "Add product" to start.',
  groceryFromMealPlan: 'From Meal Plan',
  groceryTimesUsed: 'times used',
  groceryCheapProtein: 'Cheap Protein List',
  groceryDeleted: 'Deleted',
  groceryAddedToList: 'Added to list',
  groceryClearedBought: 'Cleared bought items',
  groceryNameRequired: 'Name is required',
  groceryCategories: {
    'Thịt & Cá': 'Meat & Fish', 'Rau củ': 'Vegetables', 'Trái cây': 'Fruits',
    'Sữa & Trứng': 'Dairy & Eggs', 'Gia vị': 'Spices', 'Đồ khô': 'Dry Goods',
    'Đồ uống': 'Beverages', 'Supplements': 'Supplements', 'Khác': 'Other',
  },

  onboardingSetup: 'Set up your profile',
  onboardingStep: 'Step',
  onboardingStepPersonal: 'Personal info',
  onboardingStepGoal: 'Goal',
  onboardingStepTraining: 'Training level',
  onboardingStepLifestyle: 'Lifestyle',
  onboardingStepDiet: 'Diet',
  onboardingStepSupplements: 'Supplements',
  onboardingStepConnect: 'Connect',
  onboardingConnectIntro: 'These two let the app work on its own instead of asking you to type. Skipping is fine — you can turn them on later in Settings.',
  onboardingHealthTitle: 'Apple Health',
  onboardingHealthWhy: 'Reads steps, sleep, resting heart rate and HRV to work out your readiness each morning. Without it, those numbers have to be entered by hand.',
  onboardingHealthConnect: 'Connect Apple Health',
  onboardingHealthConnected: 'Connected',
  onboardingRemindTitle: 'Reminders',
  onboardingRemindWhy: 'Nudges for water, meals and bedtime, at the hours you just set.',
  onboardingRemindEnable: 'Turn on reminders',
  onboardingRemindEnabled: 'On',
  onboardingConnectLater: 'Skip for now',
  onboardingYourGoal: 'Your goal',
  onboardingTrainingLevel: 'Training level',
  onboardingBeginner: 'Beginner',
  onboardingBeginnerDesc: '< 1 year',
  onboardingIntermediate: 'Intermediate',
  onboardingIntermediateDesc: '1–3 years',
  onboardingAdvanced: 'Advanced',
  onboardingAdvancedDesc: '3+ years',
  onboardingDailyActivity: 'Daily activity level',
  onboardingWorkType: 'Work type',
  onboardingWorkSedentary: 'Sedentary (office)',
  onboardingWorkActive: 'Active (physical)',
  onboardingAutoCalc: 'Auto-calculated',
  onboardingDiet: 'Dietary preference',
  onboardingAllergies: 'Food allergies',
  onboardingDislikedFoods: 'Disliked foods',
  onboardingComplete: 'Setup complete!',
  onboardingCompleting: 'Completing...',
  onboardingFinish: 'Complete setup',
  onboardingGoalBulk: 'Lean Bulk',
  onboardingGoalBulkDesc: 'Build muscle, surplus ~10%',
  onboardingGoalCut: 'Cut',
  onboardingGoalCutDesc: 'Lose fat, deficit ~20%',
  onboardingGoalMaintain: 'Maintain',
  onboardingGoalMaintainDesc: 'Keep current weight',
  onboardingGoalRecomp: 'Body Recomp',
  onboardingGoalRecompDesc: 'Lose fat + gain muscle',
  onboardingGoalStrength: 'Strength',
  onboardingGoalStrengthDesc: 'Focus on getting stronger',
  onboardingGoalEndurance: 'Endurance',
  onboardingGoalEnduranceDesc: 'Cardio, stamina',
  onboardingWakeTime: 'Wake time',
  onboardingSleepTime: 'Bedtime',
  onboardingDietOmnivore: 'Omnivore',
  onboardingDietVegetarian: 'Vegetarian',
  onboardingDietHalal: 'Halal',
  onboardingDislikedFoodsPlaceholder: 'e.g. onion, cilantro, organ meats',
  onboardingSelectSupplements: 'Select supplements for your stack',
  onboardingSummary: 'Goal summary',
  onboardingPrev: 'Back',
  onboardingNext: 'Next',
  onboardingDone: 'Done',

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

  timingMorning: 'Morning',
  timingPreWorkout: 'Pre-workout',
  timingPostWorkout: 'Post-workout',
  timingBeforeBed: 'Before bed',
  timingWithMeals: 'With meals',

  progressionDouble: 'Double progression (reps → weight)',
  progressionLinear: 'Linear (increase weight weekly)',
  progressionNone: 'No auto-increase',

  dcActivity: 'Activity',
  dcActivityMove: 'Move',
  dcActivityExercise: 'Exercise',
  dcActivitySteps: 'Steps',
  dcActivityKcal: 'kcal',
  dcActivityMin: 'min',
  dcActivityStepsUnit: 'steps',
  dcActivityEmpty: 'No activity today yet. Connect Apple Health for calories and steps, or log a workout.',
  dcActivityConnect: 'Connect Health',
  dcActivityEstimated: '~ Exercise time estimated from the sets you logged.',
  dcNutritionTitle: 'Nutrition',
  dcNutritionTarget: 'Target',
  dcNutritionPctOfGoal: '{x}% goal',
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
  dcBioSource: 'Source',
  dcBioConfidence: 'Confidence',
  dcBioFallback: 'Fallback',
  dcBioEstimate: 'est.',
  dcReadinessTitle: 'Readiness Score',
  /* A verdict, not a category name — see the Vietnamese entries. */
  dcReadinessTrain: 'READY TO TRAIN',
  dcReadinessModerate: 'TRAIN MODERATELY',
  dcReadinessRecover: 'RECOVER TODAY',
  dcReadinessTrend: '7-Day Readiness',
  dcReadinessTrendDesc: 'Your training readiness over the past week',
  dcReadinessAvg: 'AVG',
  dcReadinessBest: 'Best',
  dcReadinessWorst: 'Worst',
  dcNudgesTitle: 'Habit Nudges',
  dcNudgesActive: 'active',
  dcTrainingTitle: 'Training',
  dcTraining7dVolume: '7-day volume',
  dcTrainingPain: 'Pain',
  dcRecentAwards: 'Recent Awards',
  dcViewAll: 'View all',
  dcSupplementToday: 'Supplements Today',
  dcWeightTitle: 'Weight',

  scanFoodTitle: 'Scan Food',
  scanFoodCapture: 'Capture',
  scanFoodAnalyzing: 'Analyzing...',
  scanFoodRetake: 'Retake',
  scanFoodAddToMeal: 'Add to meal',
  scanFoodNoFood: 'No food detected',
  scanFoodError: 'Error analyzing image',
  scanFoodEstimated: 'Estimated',
  scanFoodServing: 'serving',
  scanFoodItems: 'items',

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

  stepsTitle: 'Steps',
  stepsSubtitle: 'Track daily steps from Apple Watch',
  stepsToday: 'Today',
  stepsGoal: 'Goal',
  stepsAvg7d: '7d avg',
  stepsWeekly: 'This week',
  stepsDaily: 'Daily',
  stepsTrend: 'Trend',
  stepsNoData: 'No step data yet',
  stepsNoDataMsg: 'Sync from Apple Watch or enter manually',
  stepsSyncApple: 'Sync Apple Health',
  stepsSyncing: 'Syncing...',
  navSteps: 'Steps',
  notFoundTitle: 'Page not found',
  notFoundBody: "The page you're looking for doesn't exist or has moved.",
  notFoundHome: 'Back to Home',
};

const translations: Record<AppLang, Translations> = { vi, en };

export function useTranslation(lang: AppLang): Translations {
  return translations[lang];
}

export function t(lang: AppLang): Translations {
  return translations[lang];
}

// Re-export for backward compatibility
export type GroceryLang = AppLang;
