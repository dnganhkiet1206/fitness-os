export type AppLang = 'vi' | 'en' | 'zh' | 'ja' | 'es';
export type CurrencyCode = 'VND' | 'USD' | 'EUR' | 'CNY' | 'JPY' | 'GBP' | 'KRW';

export const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: 'VND', symbol: '₫', label: 'VND (₫)' },
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'CNY', symbol: '¥', label: 'CNY (¥)' },
  { code: 'JPY', symbol: '¥', label: 'JPY (¥)' },
  { code: 'KRW', symbol: '₩', label: 'KRW (₩)' },
];

export const LANGUAGES: { code: AppLang; label: string; flag: string }[] = [
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];

export function formatPrice(value: number, currency: CurrencyCode): string {
  const cur = CURRENCIES.find(c => c.code === currency);
  if (!cur) return `${value}`;
  if (currency === 'VND') return `${Math.round(value).toLocaleString()}${cur.symbol}`;
  if (currency === 'JPY' || currency === 'KRW') return `${cur.symbol}${Math.round(value).toLocaleString()}`;
  return `${cur.symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getLocale(lang: AppLang): string {
  const map: Record<AppLang, string> = { vi: 'vi-VN', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', es: 'es-ES' };
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

  // Activity levels
  activitySedentary: string;
  activityLight: string;
  activityModerate: string;
  activityHigh: string;
  activityAthlete: string;

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

  navToday: 'Today',
  navNutrition: 'Dinh dưỡng',
  navWorkouts: 'Workouts',
  navSupplements: 'Supplements',
  navSleep: 'Giấc ngủ',
  navWater: 'Nước uống',
  navBiometrics: 'Sinh trắc học',
  navProgress: 'Tiến trình',
  navWeeklyReview: 'Weekly Review',
  navSmartGoals: 'Smart Goals',
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
  dashReadinessMsg: 'Cần 3+ ngày dữ liệu để tính điểm sẵn sàng. Hãy ghi log giấc ngủ, sinh trắc và buổi tập.',
  dashTrend: 'Xu Hướng',
  dashTrendMsg: 'Chưa có dữ liệu xu hướng sẵn sàng.',
  dashActivity: 'Hoạt Động',
  dashActivityMsg: 'Chưa có dữ liệu hoạt động hôm nay.',
  dashBiometrics: 'Sinh Trắc Học',
  dashBiometricsMsg: 'Chưa có dữ liệu. Nhấn để nhập.',
  dashTraining: 'Tập Luyện',
  dashTrainingMsg: 'Chưa có buổi tập nào. Nhấn để ghi.',
  dashNutrition: 'Dinh Dưỡng',
  dashNutritionMsg: 'Chưa ghi bữa ăn hôm nay. Nhấn để ghi.',
  dashSleep: 'Giấc Ngủ',
  dashSleepMsg: 'Chưa ghi giấc ngủ. Nhấn để ghi.',
  dashSupplements: 'Supplements',
  dashSupplementsMsg: 'Thêm supplements trong Settings.',

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

  activitySedentary: 'Ít vận động',
  activityLight: 'Nhẹ',
  activityModerate: 'Trung bình',
  activityHigh: 'Cao',
  activityAthlete: 'Vận động viên',

  goalBulk: 'Tăng cân',
  goalCut: 'Giảm cân',
  goalMaintain: 'Duy trì',
  goalRecomp: 'Recomp',
  goalStrength: 'Tăng sức mạnh',
  goalEndurance: 'Tăng sức bền',

  nutritionTitle: 'Dinh Dưỡng',
  nutritionFoods: 'Thực phẩm',
  nutritionMealPlan: 'Meal Plan',
  nutritionShopping: 'Đi chợ',
  nutritionSearchFood: 'Tìm thực phẩm...',
  nutritionFavorites: 'Yêu thích',
  nutritionRecent: 'Gần đây',
  nutritionResults: 'kết quả',
  nutritionYourPlans: 'Meal Plans của bạn',
  nutritionCreateNew: 'Tạo mới',
  nutritionCreatePlan: 'Tạo Meal Plan',
  nutritionPlanName: 'Tên plan',
  nutritionMealsPerDay: 'Số bữa/ngày',
  nutritionMeals: 'bữa',
  nutritionCreating: 'Đang tạo...',
  nutritionCreateBtn: 'Tạo Plan',
  nutritionNoPlans: 'Chưa có meal plan nào',
  nutritionShoppingEmpty: 'Tạo meal plan trước để có danh sách đi chợ',
  nutritionShoppingDesc: 'Shopping list được tạo tự động từ meal plan của bạn',
  nutritionCreated: 'Đã tạo meal plan!',

  mealPlanTitle: 'Meal Plan',
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
  sleepInsights: '💡 Nhận Xét',
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

  workoutsTitle: 'Workout Builder',
  workoutsTemplates: 'Templates',
  workoutsExercises: 'Bài tập',
  workoutsCreateNew: 'Tạo mới',
  workoutsCreateTemplate: 'Tạo Workout Template',
  workoutsCreating: 'Đang tạo...',
  workoutsCreateBtn: 'Tạo Template',
  workoutsNoTemplates: 'Chưa có template nào',
  workoutsWeeklyPlan: '📅 Lịch tập tuần',
  workoutsAddExercise: 'Thêm bài tập',
  workoutsExercisesAdded: 'Bài tập đã thêm',
  workoutsVolume: 'Volume',
  workoutsCreated: 'Đã tạo template!',

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
  biometricsHeartRate: 'Nhịp Tim',
  biometricsBreathRate: 'Nhịp Thở',

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

  weeklyReviewTitle: 'Weekly Review',
  weeklyReviewExport: 'Xuất báo cáo',
  weeklyReviewExporting: 'Đang xuất...',
  weeklyReviewExported: 'Đã xuất báo cáo!',
  weeklyReviewAvgCalories: 'TB Calories',
  weeklyReviewAvgProtein: 'TB Protein',
  weeklyReviewAvgSleep: 'TB Giấc ngủ',
  weeklyReviewVolume: 'Volume',
  weeklyReviewReadiness: 'Readiness',
  weeklyReviewDailyNutrition: 'Dinh Dưỡng Hàng Ngày',
  weeklyReviewSleepChart: 'Giấc Ngủ',
  weeklyReviewReadinessChart: 'Readiness',
  weeklyReviewRecommendations: '🎯 Khuyến Nghị Tuần Tới',
  weeklyReviewSessions: 'buổi',

  smartGoalsTitle: 'Smart Goals Engine',
  smartGoalsSubtitle: 'Phân tích xu hướng cân nặng & tự động gợi ý chỉnh calories',
  smartGoalsWeightTrend: 'Xu Hướng Cân Nặng (4 Tuần)',
  smartGoalsOnTrack: 'Đang đi đúng hướng! Giữ nguyên chế độ hiện tại.',
  smartGoalsOffTrack: 'Lệch mục tiêu. Xem gợi ý bên dưới.',
  smartGoalsKeepGoing: 'Đang đi đúng hướng!',
  smartGoalsSeeBelow: 'Xem gợi ý bên dưới.',
  smartGoalsCalorieSuggestion: 'Gợi ý chỉnh Calories',
  smartGoalsNeedData: 'Cần ít nhất 3 ngày ghi cân nặng trong 4 tuần gần nhất',
  smartGoalsNeedDataMsg: 'Ghi cân nặng hàng ngày trên Dashboard để nhận phân tích.',
  smartGoalsProteinCoach: 'Protein Distribution Coach',
  smartGoalsPerDay: 'Mục tiêu/ngày',
  smartGoalsPerMeal: '/ bữa',
  smartGoalsLowDays: 'ngày thấp/14 ngày',
  smartGoalsProteinSplit: 'Gợi ý chia protein',
  smartGoalsNoNutritionData: 'Chưa có dữ liệu dinh dưỡng. Ghi bữa ăn để nhận gợi ý.',

  aiCoachTitle: 'AI Coach',
  aiCoachSubtitle: 'Dựa trên dữ liệu cá nhân của bạn',
  aiCoachHello: 'Xin chào! 👋',
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
  grocerySubtitle: 'Danh sách mua sắm từ meal plan & danh sách tùy chỉnh',
  groceryShoppingList: 'Danh Sách Mua Sắm',
  groceryBought: 'đã mua',
  groceryAddProduct: 'Thêm sản phẩm',
  groceryClearBought: 'Xóa đã mua',
  groceryProductName: 'Tên sản phẩm',
  groceryQuantity: 'SL (vd: 2kg)',
  groceryPrice: 'Giá',
  groceryNoItems: 'Chưa có sản phẩm. Nhấn "Thêm sản phẩm" để bắt đầu.',
  groceryFromMealPlan: 'Từ Meal Plan',
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
  onboardingComplete: 'Thiết lập hoàn tất! 🎉',
  onboardingCompleting: 'Đang hoàn tất...',
  onboardingFinish: 'Hoàn tất thiết lập',

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
  measureBodyFat: 'Body fat (%)',
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

  navToday: 'Today',
  navNutrition: 'Nutrition',
  navWorkouts: 'Workouts',
  navSupplements: 'Supplements',
  navSleep: 'Sleep',
  navWater: 'Water',
  navBiometrics: 'Biometrics',
  navProgress: 'Progress',
  navWeeklyReview: 'Weekly Review',
  navSmartGoals: 'Smart Goals',
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
  dashReadinessMsg: 'Need 3+ days of data to calculate readiness. Log sleep, biometrics and workouts.',
  dashTrend: 'Trend',
  dashTrendMsg: 'No readiness trend data yet.',
  dashActivity: 'Activity',
  dashActivityMsg: 'No activity data for today.',
  dashBiometrics: 'Biometrics',
  dashBiometricsMsg: 'No data yet. Tap to enter.',
  dashTraining: 'Training',
  dashTrainingMsg: 'No workouts yet. Tap to log.',
  dashNutrition: 'Nutrition',
  dashNutritionMsg: 'No meals logged today. Tap to log.',
  dashSleep: 'Sleep',
  dashSleepMsg: 'No sleep logged. Tap to log.',
  dashSupplements: 'Supplements',
  dashSupplementsMsg: 'Add supplements in Settings.',

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

  activitySedentary: 'Sedentary',
  activityLight: 'Light',
  activityModerate: 'Moderate',
  activityHigh: 'High',
  activityAthlete: 'Athlete',

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
  sleepInsights: '💡 Insights',
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
  workoutsWeeklyPlan: '📅 Weekly plan',
  workoutsAddExercise: 'Add exercise',
  workoutsExercisesAdded: 'Exercises added',
  workoutsVolume: 'Volume',
  workoutsCreated: 'Template created!',

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
  biometricsHeartRate: 'Heart Rate',
  biometricsBreathRate: 'Breath Rate',

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
  weeklyReviewRecommendations: '🎯 Next Week Recommendations',
  weeklyReviewSessions: 'sessions',

  smartGoalsTitle: 'Smart Goals Engine',
  smartGoalsSubtitle: 'Analyze weight trends & auto-suggest calorie adjustments',
  smartGoalsWeightTrend: 'Weight Trend (4 Weeks)',
  smartGoalsOnTrack: "On track! Keep your current routine.",
  smartGoalsOffTrack: 'Off track. See suggestions below.',
  smartGoalsKeepGoing: 'On track!',
  smartGoalsSeeBelow: 'See suggestions below.',
  smartGoalsCalorieSuggestion: 'Calorie Suggestion',
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
  aiCoachHello: 'Hello! 👋',
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
  onboardingComplete: 'Setup complete! 🎉',
  onboardingCompleting: 'Completing...',
  onboardingFinish: 'Complete setup',

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
};

// Abbreviated translations for zh, ja, es - using the same structure
const zh: Translations = {
  ...en,
  loading: '加载中...',
  save: '保存',
  saving: '保存中...',
  cancel: '取消',
  delete: '删除',
  deleted: '已删除',
  add: '添加',
  edit: '编辑',
  close: '关闭',
  search: '搜索',
  back: '返回',
  next: '下一步',
  previous: '上一步',
  confirm: '确认',
  error: '错误',
  success: '成功',
  noData: '暂无数据',
  today: '今天',
  thisWeek: '本周',
  target: '目标',
  all: '全部',
  other: '其他',
  settings: '设置',
  goodMorning: '早上好',
  goodAfternoon: '下午好',
  goodEvening: '晚上好',
  authLogin: '登录',
  authSignup: '注册',
  authEmail: '邮箱',
  authPassword: '密码',
  authName: '姓名',
  authLoginSubtitle: '登录以继续',
  authSignupSubtitle: '创建新账号',
  authNoAccount: '没有账号？',
  authHasAccount: '已有账号？',
  authCheckEmail: '请检查邮箱确认账号！',
  authProcessing: '处理中...',
  navToday: '今日',
  navNutrition: '营养',
  navWorkouts: '训练',
  navSupplements: '补充剂',
  navSleep: '睡眠',
  navWater: '饮水',
  navBiometrics: '生物指标',
  navProgress: '进展',
  navWeeklyReview: '周回顾',
  navSmartGoals: '智能目标',
  navAwards: '勋章',
  navChallenges: '挑战',
  navGrocery: '购物清单',
  navAiCoach: 'AI教练',
  navSettings: '设置',
  navMain: '主要',
  navAnalytics: '分析',
  dashLogMeal: '记录饮食',
  dashLogWorkout: '记录训练',
  dashLogSleep: '记录睡眠',
  dashLogBiometrics: '输入指标',
  settingsTitle: '设置',
  settingsGeneral: '通用',
  settingsProfile: '个人资料',
  settingsTheme: '外观',
  settingsThemeLight: '浅色',
  settingsThemeDark: '深色',
  settingsThemeSystem: '系统',
  settingsLanguage: '语言',
  settingsCurrency: '货币',
  settingsSavedSuccess: '保存成功！',
  settingsLogout: '退出',
  groceryTitle: '购物 & 预算',
  grocerySubtitle: '来自饮食计划和自定义清单的购物清单',
  groceryShoppingList: '购物清单',
  groceryBought: '已购买',
  groceryAddProduct: '添加商品',
  groceryClearBought: '清除已购',
  groceryProductName: '商品名称',
  groceryQuantity: '数量（如：2kg）',
  groceryPrice: '价格',
  groceryNoItems: '暂无商品。点击"添加商品"开始。',
  groceryFromMealPlan: '来自饮食计划',
  groceryTimesUsed: '次使用',
  groceryCheapProtein: '廉价蛋白质列表',
  groceryDeleted: '已删除',
  groceryAddedToList: '已添加到列表',
  groceryClearedBought: '已清除购买项目',
  groceryNameRequired: '名称不能为空',
  groceryCategories: {
    'Thịt & Cá': '肉 & 鱼', 'Rau củ': '蔬菜', 'Trái cây': '水果',
    'Sữa & Trứng': '乳制品 & 蛋', 'Gia vị': '调料', 'Đồ khô': '干货',
    'Đồ uống': '饮料', 'Supplements': '补充剂', 'Khác': '其他',
  },
  waterTitle: '饮水追踪',
  awardsTitle: '勋章',
  challengesTitle: '每周挑战',
};

const ja: Translations = {
  ...en,
  loading: '読み込み中...',
  save: '保存',
  saving: '保存中...',
  cancel: 'キャンセル',
  delete: '削除',
  deleted: '削除しました',
  add: '追加',
  edit: '編集',
  close: '閉じる',
  search: '検索',
  back: '戻る',
  next: '次へ',
  previous: '前へ',
  confirm: '確認',
  error: 'エラー',
  success: '成功',
  noData: 'データなし',
  today: '今日',
  thisWeek: '今週',
  target: '目標',
  all: 'すべて',
  other: 'その他',
  settings: '設定',
  goodMorning: 'おはようございます',
  goodAfternoon: 'こんにちは',
  goodEvening: 'こんばんは',
  authLogin: 'ログイン',
  authSignup: '新規登録',
  authEmail: 'メール',
  authPassword: 'パスワード',
  authName: '名前',
  authLoginSubtitle: 'ログインして続行',
  authSignupSubtitle: '新しいアカウントを作成',
  authNoAccount: 'アカウントをお持ちでない方',
  authHasAccount: 'アカウントをお持ちの方',
  authCheckEmail: 'メールを確認してアカウントを認証してください！',
  authProcessing: '処理中...',
  navToday: '今日',
  navNutrition: '栄養',
  navWorkouts: 'ワークアウト',
  navSupplements: 'サプリメント',
  navSleep: '睡眠',
  navWater: '水分',
  navBiometrics: '生体指標',
  navProgress: '進捗',
  navWeeklyReview: '週間レビュー',
  navSmartGoals: 'スマートゴール',
  navAwards: 'メダル',
  navChallenges: 'チャレンジ',
  navGrocery: '買い物リスト',
  navAiCoach: 'AIコーチ',
  navSettings: '設定',
  navMain: 'メイン',
  navAnalytics: '分析',
  dashLogMeal: '食事を記録',
  dashLogWorkout: 'ワークアウトを記録',
  dashLogSleep: '睡眠を記録',
  dashLogBiometrics: '指標を入力',
  settingsTitle: '設定',
  settingsGeneral: '一般',
  settingsProfile: 'プロフィール',
  settingsTheme: '外観',
  settingsThemeLight: 'ライト',
  settingsThemeDark: 'ダーク',
  settingsThemeSystem: 'システム',
  settingsLanguage: '言語',
  settingsCurrency: '通貨',
  settingsSavedSuccess: '保存しました！',
  settingsLogout: 'ログアウト',
  groceryTitle: '買い物 & 予算',
  grocerySubtitle: '食事プランとカスタムリストからの買い物リスト',
  groceryShoppingList: '買い物リスト',
  groceryBought: '購入済み',
  groceryAddProduct: '商品を追加',
  groceryClearBought: '購入済みを削除',
  groceryProductName: '商品名',
  groceryQuantity: '数量（例：2kg）',
  groceryPrice: '価格',
  groceryNoItems: 'まだ商品がありません。「商品を追加」をタップして始めましょう。',
  groceryFromMealPlan: '食事プランから',
  groceryTimesUsed: '回使用',
  groceryCheapProtein: '安いプロテインリスト',
  groceryDeleted: '削除しました',
  groceryAddedToList: 'リストに追加しました',
  groceryClearedBought: '購入済みを削除しました',
  groceryNameRequired: '名前は必須です',
  groceryCategories: {
    'Thịt & Cá': '肉 & 魚', 'Rau củ': '野菜', 'Trái cây': '果物',
    'Sữa & Trứng': '乳製品 & 卵', 'Gia vị': '調味料', 'Đồ khô': '乾物',
    'Đồ uống': '飲料', 'Supplements': 'サプリメント', 'Khác': 'その他',
  },
  waterTitle: '水分追跡',
  awardsTitle: 'メダル',
  challengesTitle: '週間チャレンジ',
};

const es: Translations = {
  ...en,
  loading: 'Cargando...',
  save: 'Guardar',
  saving: 'Guardando...',
  cancel: 'Cancelar',
  delete: 'Eliminar',
  deleted: 'Eliminado',
  add: 'Agregar',
  edit: 'Editar',
  close: 'Cerrar',
  search: 'Buscar',
  back: 'Volver',
  next: 'Siguiente',
  previous: 'Anterior',
  confirm: 'Confirmar',
  error: 'Error',
  success: 'Éxito',
  noData: 'Sin datos aún',
  today: 'Hoy',
  thisWeek: 'Esta semana',
  target: 'Objetivo',
  all: 'Todos',
  other: 'Otro',
  settings: 'Ajustes',
  goodMorning: 'Buenos días',
  goodAfternoon: 'Buenas tardes',
  goodEvening: 'Buenas noches',
  authLogin: 'Iniciar sesión',
  authSignup: 'Registrarse',
  authEmail: 'Correo',
  authPassword: 'Contraseña',
  authName: 'Nombre',
  authLoginSubtitle: 'Inicia sesión para continuar',
  authSignupSubtitle: 'Crea una nueva cuenta',
  authNoAccount: '¿No tienes cuenta?',
  authHasAccount: '¿Ya tienes cuenta?',
  authCheckEmail: '¡Revisa tu correo para confirmar tu cuenta!',
  authProcessing: 'Procesando...',
  navToday: 'Hoy',
  navNutrition: 'Nutrición',
  navWorkouts: 'Entrenamientos',
  navSupplements: 'Suplementos',
  navSleep: 'Sueño',
  navWater: 'Agua',
  navBiometrics: 'Biométricas',
  navProgress: 'Progreso',
  navWeeklyReview: 'Revisión Semanal',
  navSmartGoals: 'Metas Inteligentes',
  navAwards: 'Medallas',
  navChallenges: 'Desafíos',
  navGrocery: 'Lista de Compras',
  navAiCoach: 'Coach IA',
  navSettings: 'Ajustes',
  navMain: 'Principal',
  navAnalytics: 'Análisis',
  dashLogMeal: 'Registrar comida',
  dashLogWorkout: 'Registrar entrenamiento',
  dashLogSleep: 'Registrar sueño',
  dashLogBiometrics: 'Ingresar biométricas',
  settingsTitle: 'Ajustes',
  settingsGeneral: 'General',
  settingsProfile: 'Perfil',
  settingsTheme: 'Apariencia',
  settingsThemeLight: 'Claro',
  settingsThemeDark: 'Oscuro',
  settingsThemeSystem: 'Sistema',
  settingsLanguage: 'Idioma',
  settingsCurrency: 'Moneda',
  settingsSavedSuccess: '¡Guardado con éxito!',
  settingsLogout: 'Cerrar sesión',
  groceryTitle: 'Compras & Presupuesto',
  grocerySubtitle: 'Lista de compras del plan de comidas y lista personalizada',
  groceryShoppingList: 'Lista de Compras',
  groceryBought: 'comprados',
  groceryAddProduct: 'Agregar producto',
  groceryClearBought: 'Limpiar comprados',
  groceryProductName: 'Nombre del producto',
  groceryQuantity: 'Cant. (ej: 2kg)',
  groceryPrice: 'Precio',
  groceryNoItems: 'Sin productos aún. Toca "Agregar producto" para empezar.',
  groceryFromMealPlan: 'Del Plan de Comidas',
  groceryTimesUsed: 'veces usado',
  groceryCheapProtein: 'Lista de Proteínas Baratas',
  groceryDeleted: 'Eliminado',
  groceryAddedToList: 'Agregado a la lista',
  groceryClearedBought: 'Elementos comprados eliminados',
  groceryNameRequired: 'El nombre es obligatorio',
  groceryCategories: {
    'Thịt & Cá': 'Carne & Pescado', 'Rau củ': 'Verduras', 'Trái cây': 'Frutas',
    'Sữa & Trứng': 'Lácteos & Huevos', 'Gia vị': 'Especias', 'Đồ khô': 'Secos',
    'Đồ uống': 'Bebidas', 'Supplements': 'Suplementos', 'Khác': 'Otros',
  },
  waterTitle: 'Seguimiento de Agua',
  awardsTitle: 'Medallas',
  challengesTitle: 'Desafíos Semanales',
};

const translations: Record<AppLang, Translations> = { vi, en, zh, ja, es };

export function useTranslation(lang: AppLang): Translations {
  return translations[lang];
}

export function t(lang: AppLang): Translations {
  return translations[lang];
}

// Re-export for backward compatibility
export type GroceryLang = AppLang;
