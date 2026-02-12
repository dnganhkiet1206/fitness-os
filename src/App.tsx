import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AuthProvider } from "@/hooks/useAuth";
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

const queryClient = new QueryClient();

const pageTransition = {
  initial: { opacity: 0, scale: 0.98, filter: "blur(8px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.4, ease: "easeOut" as const } },
  exit: { opacity: 0, scale: 0.98, filter: "blur(8px)", transition: { duration: 0.25, ease: "easeIn" as const } },
};

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageTransition}
        className="min-h-screen"
      >
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
