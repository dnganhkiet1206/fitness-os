import type { AppLang } from './i18n';

/**
 * Strings specific to the native app's screens, in both languages.
 * The big ported dictionary (i18n.ts) covers web-page copy; these cover
 * the native layouts. Merged with it in useI18n().
 */
const en = {
  // Today
  nGoodMorning: 'Good morning',
  nGoodAfternoon: 'Good afternoon',
  nGoodEvening: 'Good evening',
  nReadiness: 'Readiness',
  nReadinessHint: 'Log sleep and training to get your score',
  nActivity: 'Activity',
  nSteps: 'steps',
  nKcalToday: 'kcal today',
  nSleep: 'Sleep',
  nLastNight: 'Last night',
  nWater: 'Water',
  nStayHydrated: 'stay hydrated',
  nOfTarget: 'of {x} target',
  nSyncHealth: '♥ Sync Apple Health',
  nLogShort: '＋ Log',
  nQuality: 'Quality',

  // Nutrition
  nToday: 'Today',
  nProtein: 'Protein',
  nCarbs: 'Carbs',
  nFat: 'Fat',
  nLogMealBtn: '＋ Log Meal',
  nNoMeals: 'No meals yet',
  nNoMealsHint: 'Log your first meal of the day above',
  nBreakfast: 'Breakfast',
  nLunch: 'Lunch',
  nDinner: 'Dinner',
  nSnack: 'Snack',

  // Workouts
  nThisWeek: 'This week',
  nSessions: 'sessions',
  nVolume: 'Volume',
  nKgLifted: 'kg lifted',
  nLogWorkoutBtn: '＋ Log Workout',
  nNoWorkouts: 'No workouts yet',
  nNoWorkoutsHint: 'Log your first session — readiness adapts to your training load',

  // Progress
  nWeight: 'Weight',
  nLast30d: 'Last 30 days',
  nLast14d: 'Last 14 days',
  nNotEnoughData: 'Not enough data yet',
  nBuildTrendHint: 'Log sleep and training to build your trend',

  // Log Meal sheet
  nLogMealTitle: 'Log Meal',
  nSearchFoods: 'Search foods…',
  nWhatDidYouEat: 'What did you eat? (optional)',
  nCalories: 'Calories (kcal)',
  nProteinG: 'Protein g',
  nCarbsG: 'Carbs g',
  nFatG: 'Fat g',
  nSaveMeal: 'Save Meal',

  // Log Workout sheet
  nLogWorkoutTitle: 'Log Workout',
  nWorkoutName: 'Workout name (e.g. Push Day)',
  nSets: 'Sets',
  nExercise: 'Exercise',
  nReps: 'reps',
  nAddSet: '＋ Add set',
  nRpe: 'Session effort (RPE)',
  nSaveWorkout: 'Save Workout',

  // Log Sleep sheet
  nLogSleepTitle: 'Log Sleep',
  nBedtime: 'Bedtime',
  nWakeUp: 'Wake up',
  nDuration: 'Duration',
  nHowSleep: 'How did you sleep?',
  nSaveSleep: 'Save Sleep',

  // Settings
  nDailyTarget: 'Daily target',
  nGoal: 'Goal',
  nTrainingLevel: 'Training level',
  nAbout: 'About',
  nVersion: 'Version',
  nSignOut: 'Sign Out',
  nSignOutConfirm: 'Are you sure you want to sign out?',
  nCancel: 'Cancel',

  // Auth
  nSignInSubtitle: 'Sign in to continue',
  nSignUpSubtitle: 'Create your account',
  nYourName: 'Your name',
  nEmail: 'Email',
  nPassword: 'Password',
  nSignIn: 'Sign In',
  nSignUp: 'Sign Up',
  nNoAccount: "Don't have an account? ",
  nHaveAccount: 'Already have an account? ',

  // AI Coach
  nAskCoach: 'Ask your coach',
  nAskCoachHint: 'Training, nutrition, recovery — answers use your real data',
  nMessageCoach: 'Message your coach…',
  nHistory: 'History',
  nNoHistory: 'No conversations yet',

  // Extras
  nAwards: 'Awards',
  nNoAwards: 'No awards yet',
  nNoAwardsHint: 'Keep logging — achievements unlock automatically',
  nChallenges: 'Challenges',
  nNoChallenges: 'No challenges this week',
  nNoChallengesHint: 'Weekly challenges appear when you start logging',
  nCompleted: 'Completed',
  nGrocery: 'Grocery List',
  nAddItem: 'Add an item…',
  nNoGrocery: 'List is empty',
  nNoGroceryHint: 'Add ingredients you need to buy',

  // Scanner
  nCameraNeeded: 'Camera access needed',
  nCameraHint: 'ASCND scans barcodes to log packaged foods instantly',
  nAllowCamera: 'Allow Camera',
  nPointBarcode: 'Point at a barcode',
  nLookingUp: 'Looking up product…',
  nNotFound: 'Product not found — try again',
};

const vi: typeof en = {
  nGoodMorning: 'Chào buổi sáng',
  nGoodAfternoon: 'Chào buổi chiều',
  nGoodEvening: 'Chào buổi tối',
  nReadiness: 'Mức sẵn sàng',
  nReadinessHint: 'Ghi giấc ngủ và buổi tập để có điểm số',
  nActivity: 'Hoạt động',
  nSteps: 'bước',
  nKcalToday: 'kcal hôm nay',
  nSleep: 'Giấc ngủ',
  nLastNight: 'Đêm qua',
  nWater: 'Nước',
  nStayHydrated: 'uống đủ nước nhé',
  nOfTarget: 'mục tiêu {x}',
  nSyncHealth: '♥ Đồng bộ Apple Health',
  nLogShort: '＋ Ghi',
  nQuality: 'Chất lượng',

  nToday: 'Hôm nay',
  nProtein: 'Đạm',
  nCarbs: 'Tinh bột',
  nFat: 'Béo',
  nLogMealBtn: '＋ Ghi bữa ăn',
  nNoMeals: 'Chưa có bữa nào',
  nNoMealsHint: 'Ghi bữa đầu tiên trong ngày ở nút phía trên',
  nBreakfast: 'Bữa sáng',
  nLunch: 'Bữa trưa',
  nDinner: 'Bữa tối',
  nSnack: 'Ăn vặt',

  nThisWeek: 'Tuần này',
  nSessions: 'buổi tập',
  nVolume: 'Khối lượng',
  nKgLifted: 'kg đã nâng',
  nLogWorkoutBtn: '＋ Ghi buổi tập',
  nNoWorkouts: 'Chưa có buổi tập nào',
  nNoWorkoutsHint: 'Ghi buổi đầu tiên — mức sẵn sàng sẽ thích ứng theo khối lượng tập',

  nWeight: 'Cân nặng',
  nLast30d: '30 ngày qua',
  nLast14d: '14 ngày qua',
  nNotEnoughData: 'Chưa đủ dữ liệu',
  nBuildTrendHint: 'Ghi giấc ngủ và buổi tập để dựng xu hướng',

  nLogMealTitle: 'Ghi bữa ăn',
  nSearchFoods: 'Tìm món ăn…',
  nWhatDidYouEat: 'Bạn đã ăn gì? (không bắt buộc)',
  nCalories: 'Calo (kcal)',
  nProteinG: 'Đạm (g)',
  nCarbsG: 'Tinh bột (g)',
  nFatG: 'Béo (g)',
  nSaveMeal: 'Lưu bữa ăn',

  nLogWorkoutTitle: 'Ghi buổi tập',
  nWorkoutName: 'Tên buổi tập (VD: Ngày đẩy)',
  nSets: 'Các set',
  nExercise: 'Bài tập',
  nReps: 'reps',
  nAddSet: '＋ Thêm set',
  nRpe: 'Độ gắng sức (RPE)',
  nSaveWorkout: 'Lưu buổi tập',

  nLogSleepTitle: 'Ghi giấc ngủ',
  nBedtime: 'Giờ đi ngủ',
  nWakeUp: 'Giờ dậy',
  nDuration: 'Thời lượng',
  nHowSleep: 'Bạn ngủ thế nào?',
  nSaveSleep: 'Lưu giấc ngủ',

  nDailyTarget: 'Mục tiêu ngày',
  nGoal: 'Mục tiêu',
  nTrainingLevel: 'Trình độ tập',
  nAbout: 'Thông tin',
  nVersion: 'Phiên bản',
  nSignOut: 'Đăng xuất',
  nSignOutConfirm: 'Bạn chắc chắn muốn đăng xuất?',
  nCancel: 'Huỷ',

  nSignInSubtitle: 'Đăng nhập để tiếp tục',
  nSignUpSubtitle: 'Tạo tài khoản của bạn',
  nYourName: 'Tên của bạn',
  nEmail: 'Email',
  nPassword: 'Mật khẩu',
  nSignIn: 'Đăng nhập',
  nSignUp: 'Đăng ký',
  nNoAccount: 'Chưa có tài khoản? ',
  nHaveAccount: 'Đã có tài khoản? ',

  nAskCoach: 'Hỏi huấn luyện viên',
  nAskCoachHint: 'Tập luyện, dinh dưỡng, phục hồi — trả lời dựa trên dữ liệu thật của bạn',
  nMessageCoach: 'Nhắn cho coach…',
  nHistory: 'Lịch sử',
  nNoHistory: 'Chưa có hội thoại nào',

  nAwards: 'Thành tích',
  nNoAwards: 'Chưa có thành tích nào',
  nNoAwardsHint: 'Cứ ghi chép đều — thành tích sẽ tự mở khoá',
  nChallenges: 'Thử thách',
  nNoChallenges: 'Tuần này chưa có thử thách',
  nNoChallengesHint: 'Thử thách tuần xuất hiện khi bạn bắt đầu ghi chép',
  nCompleted: 'Hoàn thành',
  nGrocery: 'Đi chợ',
  nAddItem: 'Thêm món cần mua…',
  nNoGrocery: 'Danh sách trống',
  nNoGroceryHint: 'Thêm nguyên liệu bạn cần mua',

  nCameraNeeded: 'Cần quyền camera',
  nCameraHint: 'ASCND quét mã vạch để ghi thực phẩm đóng gói tức thì',
  nAllowCamera: 'Cho phép Camera',
  nPointBarcode: 'Hướng camera vào mã vạch',
  nLookingUp: 'Đang tra cứu sản phẩm…',
  nNotFound: 'Không tìm thấy — thử lại',
};

export const nativeStrings: Record<AppLang, typeof en> = { vi, en };
export type NativeStrings = typeof en;
