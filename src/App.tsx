import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import SwipeBack from "@/components/SwipeBack";
import { AwardCelebrationOverlay } from "@/components/awards/AwardCelebration";
import { AppLayout } from "@/components/AppLayout";
import { AppSettingsProvider } from "@/hooks/useAppSettings";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Critical pages loaded eagerly (landing + auth)
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy-loaded pages — each becomes a separate chunk for faster initial load
const Settings = lazy(() => import("./pages/Settings"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Nutrition = lazy(() => import("./pages/Nutrition"));
const MealPlan = lazy(() => import("./pages/MealPlan"));
const Supplements = lazy(() => import("./pages/Supplements"));
const ExerciseLibrary = lazy(() => import("./pages/ExerciseLibrary"));
const WorkoutBuilder = lazy(() => import("./pages/WorkoutBuilder"));
const RoutinePlanner = lazy(() => import("./pages/RoutinePlanner"));
const SleepInsights = lazy(() => import("./pages/SleepInsights"));
const Progress = lazy(() => import("./pages/Progress"));
const WeeklyReview = lazy(() => import("./pages/WeeklyReview"));
const AiCoach = lazy(() => import("./pages/AiCoach"));
const WaterTracking = lazy(() => import("./pages/WaterTracking"));
const SmartGoals = lazy(() => import("./pages/SmartGoals"));
const GroceryList = lazy(() => import("./pages/GroceryList"));
const Awards = lazy(() => import("./pages/Awards"));
const Challenges = lazy(() => import("./pages/Challenges"));
const Biometrics = lazy(() => import("./pages/Biometrics"));
const Legal = lazy(() => import("./pages/Legal"));
const Steps = lazy(() => import("./pages/Steps"));

// Loading fallback — matches app background for seamless transition
function PageLoader() {
  return (
    <div className="flex items-center justify-center w-full" style={{ minHeight: '60vh' }}>
      <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient();

// Root tab destinations — switching between them cross-fades (like native
// UITabBarController); everything else animates as an iOS push/pop.
const TAB_ROUTES = new Set(['/', '/nutrition', '/workouts', '/progress']);

// Routes that own their full layout (internal scrolling, keyboard handling)
const CUSTOM_LAYOUT_ROUTES = new Set(['/ai-coach']);

// Routes without the floating tab bar — no bottom clearance needed
const NO_TAB_BAR_ROUTES = new Set(['/onboarding']);

type TransitionKind = 'fade' | 'push' | 'pop';

// iOS-style page transitions — GPU-accelerated transforms only
const pageVariants = {
  initial: (kind: TransitionKind) => ({
    opacity: 0,
    x: kind === 'push' ? 56 : kind === 'pop' ? -32 : 0,
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 420, damping: 40, mass: 0.8 },
  },
  exit: (kind: TransitionKind) => ({
    opacity: 0,
    x: kind === 'push' ? -32 : kind === 'pop' ? 56 : 0,
    transition: { duration: 0.14, ease: "easeIn" as const },
  }),
};

function AnimatedRoutes() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { user } = useAuth();
  const prevPath = useRef(location.pathname);
  const kindRef = useRef<TransitionKind>('fade');

  if (prevPath.current !== location.pathname) {
    const bothTabs = TAB_ROUTES.has(prevPath.current) && TAB_ROUTES.has(location.pathname);
    kindRef.current = bothTabs ? 'fade' : navigationType === 'POP' ? 'pop' : 'push';
    prevPath.current = location.pathname;
  }

  const kind = kindRef.current;
  const isCustomLayout = CUSTOM_LAYOUT_ROUTES.has(location.pathname);
  // Clearance so the last content rows aren't hidden behind the floating
  // tab bar (bar ≈56px + 8px margin + home-indicator inset).
  const bottomClearance = user && !isCustomLayout && !NO_TAB_BAR_ROUTES.has(location.pathname)
    ? 'calc(env(safe-area-inset-bottom, 0px) + 84px)'
    : undefined;

  return (
    <AnimatePresence mode="wait" initial={false} custom={kind}>
      <motion.div
        key={location.pathname}
        custom={kind}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        // Each route gets its own scroll container: scroll position resets on
        // navigation and the exiting screen keeps its own scroll state.
        className="h-full w-full overflow-y-auto scroll-container"
        style={{ paddingBottom: bottomClearance, willChange: 'transform, opacity', transform: 'translateZ(0)' }}
      >
        <SwipeBack>
          <Suspense fallback={<PageLoader />}>
            <Routes location={location}>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/nutrition" element={<Nutrition />} />
              <Route path="/meal-plan/:id" element={<MealPlan />} />
              <Route path="/supplements" element={<Supplements />} />
              <Route path="/exercises" element={<ExerciseLibrary />} />
              <Route path="/workouts" element={<WorkoutBuilder />} />
              <Route path="/routine" element={<RoutinePlanner />} />
              <Route path="/sleep" element={<SleepInsights />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/weekly-review" element={<WeeklyReview />} />
              <Route path="/ai-coach" element={<AiCoach />} />
              <Route path="/water" element={<WaterTracking />} />
              <Route path="/smart-goals" element={<SmartGoals />} />
              <Route path="/grocery" element={<GroceryList />} />
              <Route path="/awards" element={<Awards />} />
              <Route path="/challenges" element={<Challenges />} />
              <Route path="/biometrics" element={<Biometrics />} />
              <Route path="/steps" element={<Steps />} />
              <Route path="/legal" element={<Legal />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </SwipeBack>
      </motion.div>
    </AnimatePresence>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppSettingsProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <AwardCelebrationOverlay />
            <BrowserRouter>
              <AppLayout>
                <AnimatedRoutes />
              </AppLayout>
            </BrowserRouter>
          </TooltipProvider>
        </AppSettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
