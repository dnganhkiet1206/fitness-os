import { Home, Utensils, Dumbbell, TrendingUp, LayoutGrid } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef } from 'react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';
import ScanFoodDialog from '@/components/logging/ScanFoodDialog';
import {
  Pill, Moon, Droplets, Heart, BarChart3, Target, Medal, Swords, ShoppingCart, Sparkles, Footprints, Camera
} from 'lucide-react';

const spring = { type: 'spring' as const, stiffness: 500, damping: 35 };

const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if ('vibrate' in navigator) {
    navigator.vibrate(style === 'light' ? 8 : style === 'medium' ? 15 : 25);
  }
};

export function BottomTabBar() {
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = [
    { title: i18n.navToday, url: '/', icon: Home },
    { title: i18n.navNutrition, url: '/nutrition', icon: Utensils },
    { title: i18n.navWorkouts, url: '/workouts', icon: Dumbbell },
    { title: i18n.navProgress, url: '/progress', icon: TrendingUp },
  ];

  const moreItems = [
    { title: i18n.scanFoodTitle || (lang === 'vi' ? 'Quét thực phẩm' : 'Scan Food'), url: '__scan__', icon: Camera },
    { title: i18n.navSupplements, url: '/supplements', icon: Pill },
    { title: i18n.navSleep, url: '/sleep', icon: Moon },
    { title: i18n.navWater, url: '/water', icon: Droplets },
    { title: i18n.navBiometrics, url: '/biometrics', icon: Heart },
    { title: i18n.navSteps, url: '/steps', icon: Footprints },
    { title: i18n.navWeeklyReview, url: '/weekly-review', icon: BarChart3 },
    { title: i18n.navSmartGoals, url: '/smart-goals', icon: Target },
    { title: i18n.navAwards, url: '/awards', icon: Medal },
    { title: i18n.navChallenges, url: '/challenges', icon: Swords },
    { title: i18n.navGrocery, url: '/grocery', icon: ShoppingCart },
    { title: i18n.navAiCoach, url: '/ai-coach', icon: Sparkles },
  ];

  const scanTriggerRef = useRef<HTMLButtonElement>(null);

  const isMoreActive = moreItems.some(item => item.url !== '__scan__' && location.pathname === item.url);
  const isActive = (url: string) => url === '__scan__' ? false : url === '/' ? location.pathname === '/' : location.pathname.startsWith(url);

  return (
    <>
      {/* More menu overlay */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[90] bg-background/60 backdrop-blur-md"
              onClick={() => { haptic('light'); setMoreOpen(false); }}
            />
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 60, scale: 0.9 }}
              transition={spring}
              className="fixed bottom-20 left-3 right-3 z-[95] rounded-3xl p-4 grid grid-cols-4 gap-3 border border-border/20"
              style={{
                background: 'hsl(var(--card) / 0.95)',
                backdropFilter: 'blur(40px) saturate(1.8)',
                boxShadow: '0 -8px 40px hsl(0 0% 0% / 0.4), 0 0 0 1px hsl(0 0% 100% / 0.05) inset',
              }}
            >
              {moreItems.map((item, idx) => {
                const active = isActive(item.url);
                return (
                  <motion.button
                    key={item.url}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03, ...spring }}
                    whileTap={{ scale: 0.85 }}
                    onClick={() => {
                      haptic('medium');
                      if (item.url === '__scan__') {
                        setMoreOpen(false);
                        setTimeout(() => scanTriggerRef.current?.click(), 200);
                      } else {
                        navigate(item.url);
                        setMoreOpen(false);
                      }
                    }}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl transition-colors ${
                      active ? 'bg-primary/15' : 'active:bg-secondary/60'
                    }`}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1 }}
                      transition={spring}
                    >
                      <item.icon className={`w-5 h-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                    </motion.div>
                    <span className={`text-[10px] font-medium leading-tight text-center ${
                      active ? 'text-primary' : 'text-muted-foreground'
                    }`}>{item.title}</span>
                  </motion.button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[80] pb-safe">
        <div
          className="mx-3 mb-2 rounded-[28px] flex items-center justify-around px-2 py-1.5 border border-border/10"
          style={{
            background: 'hsl(var(--card) / 0.92)',
            backdropFilter: 'blur(40px) saturate(2)',
            WebkitBackdropFilter: 'blur(40px) saturate(2)',
            boxShadow: '0 4px 30px hsl(0 0% 0% / 0.5), 0 0 0 1px hsl(0 0% 100% / 0.04) inset',
          }}
        >
          {tabs.map((tab) => {
            const active = isActive(tab.url);
            return (
              <NavLink
                key={tab.url}
                to={tab.url}
                end={tab.url === '/'}
                onClick={() => haptic(active ? 'light' : 'medium')}
                className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-2xl transition-all relative"
                activeClassName=""
              >
                {active && (
                  <motion.div
                    layoutId="tab-bg"
                    className="absolute inset-0 rounded-2xl bg-primary/10"
                    transition={spring}
                  />
                )}
                <motion.div
                  whileTap={{ scale: 0.75 }}
                  transition={spring}
                  className="relative z-10"
                >
                  <tab.icon className={`w-5 h-5 transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                </motion.div>
                <span className={`text-[10px] font-medium relative z-10 transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}>{tab.title}</span>
                {/* Active dot indicator */}
                {active && (
                  <motion.div
                    layoutId="tab-dot"
                    className="absolute -top-0.5 w-1 h-1 rounded-full bg-primary"
                    transition={spring}
                  />
                )}
              </NavLink>
            );
          })}

          {/* More button */}
          <motion.button
            whileTap={{ scale: 0.75 }}
            transition={spring}
            onClick={() => {
              haptic('medium');
              setMoreOpen(prev => !prev);
            }}
            className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-2xl transition-all relative"
          >
            {(moreOpen || isMoreActive) && (
              <motion.div
                layoutId="tab-bg"
                className="absolute inset-0 rounded-2xl bg-primary/10"
                transition={spring}
              />
            )}
            <LayoutGrid className={`w-5 h-5 relative z-10 transition-colors ${moreOpen || isMoreActive ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`text-[10px] font-medium relative z-10 transition-colors ${moreOpen || isMoreActive ? 'text-primary' : 'text-muted-foreground'}`}>
              {lang === 'vi' ? 'Thêm' : 'More'}
            </span>
            {(moreOpen || isMoreActive) && (
              <motion.div
                layoutId="tab-dot"
                className="absolute -top-0.5 w-1 h-1 rounded-full bg-primary"
                transition={spring}
              />
            )}
          </motion.button>
        </div>
      </div>

      {/* Scan Food Dialog triggered from More menu */}
      <ScanFoodDialog onFoodsScanned={() => {}}>
        <button ref={scanTriggerRef} className="hidden" />
      </ScanFoodDialog>
    </>
  );
}
