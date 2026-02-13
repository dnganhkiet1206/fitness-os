import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import SwipeBack from "@/components/SwipeBack";
import { AwardCelebrationOverlay } from "@/components/awards/AwardCelebration";
import { AppLayout } from "@/components/AppLayout";
import { AppSettingsProvider } from "@/hooks/useAppSettings";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import Onboarding from "./pages/Onboarding";
import Nutrition from "./pages/Nutrition";
import MealPlan from "./pages/MealPlan";
import Supplements from "./pages/Supplements";
import ExerciseLibrary from "./pages/ExerciseLibrary";
import WorkoutBuilder from "./pages/WorkoutBuilder";
import RoutinePlanner from "./pages/RoutinePlanner";
import SleepInsights from "./pages/SleepInsights";
import Progress from "./pages/Progress";
import WeeklyReview from "./pages/WeeklyReview";
import AiCoach from "./pages/AiCoach";
import WaterTracking from "./pages/WaterTracking";
import SmartGoals from "./pages/SmartGoals";
import GroceryList from "./pages/GroceryList";
import Awards from "./pages/Awards";
import Challenges from "./pages/Challenges";
import Biometrics from "./pages/Biometrics";
import Legal from "./pages/Legal";
import Steps from "./pages/Steps";
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

  const variants = {
    initial: {
      opacity: 0,
      x: dir === 0 ? 0 : dir > 0 ? 60 : -60,
      filter: "blur(4px)",
    },
    animate: {
      opacity: 1,
      x: 0,
      filter: "blur(0px)",
      transition: { type: "spring" as const, stiffness: 380, damping: 36, mass: 0.8 },
    },
    exit: {
      opacity: 0,
      x: dir === 0 ? 0 : dir > 0 ? -40 : 40,
      filter: "blur(4px)",
      transition: { duration: 0.18, ease: "easeIn" as const },
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
      >
        <SwipeBack>
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
