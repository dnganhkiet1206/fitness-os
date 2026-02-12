import { Camera, Settings } from 'lucide-react';
import ReadinessGauge from '@/components/dashboard/ReadinessGauge';
import BiometricsCard from '@/components/dashboard/BiometricsCard';
import NutritionCard from '@/components/dashboard/NutritionCard';
import SleepCard from '@/components/dashboard/SleepCard';
import TrainingCard from '@/components/dashboard/TrainingCard';
import NudgesCard from '@/components/dashboard/NudgesCard';
import ReadinessTrend from '@/components/dashboard/ReadinessTrend';
import ActivityCard from '@/components/dashboard/ActivityCard';
import {
  mockUser,
  todayReadiness,
  todayBiometrics,
  todayDailyLog,
  todaySleep,
  recentWorkouts,
  activeNudges,
  connectedWearables,
  readinessTrend,
} from '@/lib/mock-data';

const Index = () => {
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              <span className="text-gradient-green">Fitness</span>
              <span className="text-foreground"> OS</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <Camera className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Greeting */}
        <div className="animate-fade-up" style={{ animationDelay: '0ms' }}>
          <p className="text-sm text-muted-foreground">{dateStr}</p>
          <h2 className="text-2xl font-bold">{greeting}, {mockUser.name.split(' ')[0]}</h2>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Readiness – hero */}
          <div className="animate-fade-up lg:col-span-2" style={{ animationDelay: '50ms' }}>
            <ReadinessGauge result={todayReadiness} />
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="animate-fade-up" style={{ animationDelay: '100ms' }}>
              <ReadinessTrend trend={readinessTrend} />
            </div>
            <div className="animate-fade-up" style={{ animationDelay: '150ms' }}>
              <ActivityCard log={todayDailyLog} />
            </div>
          </div>
        </div>

        {/* Second row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="animate-fade-up" style={{ animationDelay: '200ms' }}>
            <BiometricsCard sample={todayBiometrics} wearables={connectedWearables} />
          </div>
          <div className="animate-fade-up" style={{ animationDelay: '250ms' }}>
            <TrainingCard workouts={recentWorkouts} acwr={todayReadiness.acwr} />
          </div>
        </div>

        {/* Third row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="animate-fade-up" style={{ animationDelay: '300ms' }}>
            <NutritionCard
              log={todayDailyLog}
              targets={mockUser.macro_targets}
              calorieTarget={mockUser.tdee_target_kcal}
            />
          </div>
          <div className="animate-fade-up" style={{ animationDelay: '350ms' }}>
            <SleepCard sleep={todaySleep} targetHours={mockUser.sleep_targets.hours} />
          </div>
        </div>

        {/* Nudges */}
        <div className="animate-fade-up" style={{ animationDelay: '400ms' }}>
          <NudgesCard nudges={activeNudges} />
        </div>

        {/* Footer spacer */}
        <div className="h-8" />
      </main>
    </div>
  );
};

export default Index;
