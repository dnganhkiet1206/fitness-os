import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import {
  TAB_ROUTES,
  CUSTOM_LAYOUT_ROUTES,
  NO_TAB_BAR_ROUTES,
  TAB_BAR_CLEARANCE_PX,
} from "@/lib/route-config";
import SwipeBack from "@/components/SwipeBack";
import { AwardCelebrationOverlay } from "@/components/awards/AwardCelebration";
import { AppLayout } from "@/components/AppLayout";
import { AppSettingsProvider } from "@/hooks/useAppSettings";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import PageLoader from "@/components/PageLoader";

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

const queryClient = new QueryClient();

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
    // PUSH slides forward, POP slides back; REPLACE (redirects, back-fallback
    // on deep links) has no direction — cross-fade it.
    kindRef.current = bothTabs || navigationType === 'REPLACE'
      ? 'fade'
      : navigationType === 'POP' ? 'pop' : 'push';
    prevPath.current = location.pathname;
  }

  const kind = kindRef.current;
  const isCustomLayout = CUSTOM_LAYOUT_ROUTES.has(location.pathname);
  // Clearance so the last content rows aren't hidden behind the floating tab bar.
  const bottomClearance = user && !isCustomLayout && !NO_TAB_BAR_ROUTES.has(location.pathname)
    ? `calc(env(safe-area-inset-bottom, 0px) + ${TAB_BAR_CLEARANCE_PX}px)`
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
        // Each regular route gets its own scroll container: scroll position
        // resets on navigation and the exiting screen keeps its scroll state.
        // Custom-layout routes (chat) own their scrolling — wrapping them in a
        // second scroller would let keyboard focus drag the whole page.
        className={
          isCustomLayout
            ? "h-full w-full overflow-hidden"
            : "h-full w-full overflow-y-auto scroll-container"
        }
        data-route-scroller={isCustomLayout ? undefined : true}
        style={{ paddingBottom: bottomClearance }}
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
