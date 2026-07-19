import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, lazy, Suspense } from "react";
import { AuthProvider } from "@/hooks/useAuth";
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
const MascotLab = lazy(() => import("./pages/MascotLab"));

// Loading fallback — matches app background for seamless transition
function PageLoader() {
  return (
    <div className="flex items-center justify-center w-full" style={{ minHeight: '60vh' }}>
      <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient();

// Tab order for directional transitions
const TAB_ORDER = ['/', '/nutrition', '/workouts', '/progress'];

function getTabIndex(path: string): number {
  const idx = TAB_ORDER.indexOf(path);
  return idx >= 0 ? idx : TAB_ORDER.length; // "more" pages get highest index
}

function AnimatedRoutes() {
  const location = useLocation();
  const prevPath = useRef(location.pathname);
  const direction = useRef(0);

  if (prevPath.current !== location.pathname) {
    const prevIdx = getTabIndex(prevPath.current);
    const currIdx = getTabIndex(location.pathname);
    direction.current = currIdx > prevIdx ? 1 : currIdx < prevIdx ? -1 : 0;
    prevPath.current = location.pathname;
  }

  const dir = direction.current;

  // Optimized for 120Hz ProMotion displays — GPU-accelerated transforms only
  const variants = {
    initial: {
      opacity: 0,
      x: dir === 0 ? 0 : dir > 0 ? 60 : -60,
    },
    animate: {
      opacity: 1,
      x: 0,
      transition: {
        type: "spring" as const,
        stiffness: 400,
        damping: 38,
        mass: 0.7,
        // Faster spring = snappier feel on 120Hz
      },
    },
    exit: {
      opacity: 0,
      x: dir === 0 ? 0 : dir > 0 ? -40 : 40,
      transition: { duration: 0.15, ease: "easeIn" as const },
    },
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="w-full"
        style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
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
              <Route path="/mascot-lab" element={<MascotLab />} />
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
