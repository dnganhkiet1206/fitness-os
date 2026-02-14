import { Home, Utensils, Dumbbell, TrendingUp, Sparkles, Camera, Heart, Moon, Droplets, Footprints, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';
import ScanFoodDialog from '@/components/logging/ScanFoodDialog';

const spring = { type: 'spring' as const, stiffness: 400, damping: 30 };
const liquidSpring = { type: 'spring' as const, stiffness: 350, damping: 28 };

const haptic = (style: 'light' | 'medium' = 'light') => {
  if ('vibrate' in navigator) navigator.vibrate(style === 'light' ? 8 : 15);
};

const AI_ITEMS = [
  { key: 'scan', icon: Camera, label: { en: 'Scan Food', vi: 'Quét thực phẩm' }, url: '__scan__' },
  { key: 'coach', icon: Sparkles, label: { en: 'AI Coach', vi: 'AI Coach' }, url: '/ai-coach' },
  { key: 'bio', icon: Heart, label: { en: 'Biometrics', vi: 'Sinh trắc học' }, url: '/biometrics' },
  { key: 'sleep', icon: Moon, label: { en: 'Sleep', vi: 'Giấc ngủ' }, url: '/sleep' },
  { key: 'water', icon: Droplets, label: { en: 'Water', vi: 'Nước uống' }, url: '/water' },
  { key: 'steps', icon: Footprints, label: { en: 'Steps', vi: 'Bước đi' }, url: '/steps' },
] as const;

export function BottomTabBar({ autoHide = true }: { autoHide?: boolean }) {
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const location = useLocation();
  const navigate = useNavigate();
  const [aiOpen, setAiOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>();
  const scanTriggerRef = useRef<HTMLButtonElement>(null);

  // Scroll-aware hide/show
  useEffect(() => {
    if (!autoHide) { setVisible(true); return; }
    const scroller = document.querySelector('.scroll-container') as HTMLElement | null;
    if (!scroller) { setVisible(true); return; }
    const threshold = 16;
    const handleScroll = () => {
      const currentY = scroller.scrollTop;
      const delta = currentY - lastScrollY.current;
      if (aiOpen) { lastScrollY.current = currentY; return; }
      if (delta > threshold && currentY > 80) setVisible(false);
      else if (delta < -threshold || currentY < 30) setVisible(true);
      lastScrollY.current = currentY;
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => setVisible(true), 800);
    };
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, [aiOpen, autoHide]);

  useEffect(() => { setVisible(true); }, [location.pathname]);

  const tabs = [
    { title: i18n.navToday, url: '/', icon: Home },
    { title: i18n.navNutrition, url: '/nutrition', icon: Utensils },
    { title: i18n.navWorkouts, url: '/workouts', icon: Dumbbell },
    { title: i18n.navProgress, url: '/progress', icon: TrendingUp },
  ];

  const isActive = (url: string) => url === '/' ? location.pathname === '/' : location.pathname.startsWith(url);

  return (
    <>
      {/* AI Quick Actions Overlay */}
      <AnimatePresence>
        {aiOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[90] bg-background/70 backdrop-blur-xl"
              onClick={() => { haptic(); setAiOpen(false); }}
            />
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.92 }}
              transition={spring}
              className="fixed bottom-24 left-4 right-4 z-[95]"
            >
              <div
                className="rounded-3xl p-5 grid grid-cols-3 gap-3"
                style={{
                  background: 'hsl(240 8% 8% / 0.95)',
                  backdropFilter: 'blur(40px) saturate(1.8)',
                  border: '1px solid hsl(0 0% 100% / 0.08)',
                  boxShadow: '0 -8px 40px hsl(0 0% 0% / 0.5), 0 0 0 1px hsl(0 0% 100% / 0.03) inset',
                }}
              >
                {AI_ITEMS.map((item, idx) => (
                  <motion.button
                    key={item.key}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, ...spring }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      haptic('medium');
                      if (item.url === '__scan__') {
                        setAiOpen(false);
                        setTimeout(() => scanTriggerRef.current?.click(), 200);
                      } else {
                        navigate(item.url);
                        setAiOpen(false);
                      }
                    }}
                    className="flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-secondary/30 hover:bg-secondary/50 transition-colors touch-target"
                  >
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{
                      background: 'hsl(0 0% 100% / 0.06)',
                      boxShadow: '0 2px 8px hsl(0 0% 0% / 0.3)',
                    }}>
                      <item.icon className="w-5 h-5 text-foreground/80" />
                    </div>
                    <span className="text-[11px] font-medium text-foreground/70">
                      {lang === 'vi' ? item.label.vi : item.label.en}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* iOS 26 Liquid Glass Tab Bar */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[80] pb-safe pl-safe pr-safe"
        initial={false}
        animate={{ y: visible || aiOpen ? 0 : 100, opacity: visible || aiOpen ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      >
        <div
          className="mx-auto mb-2 flex items-center justify-center gap-1 px-1.5 py-1.5"
          style={{
            width: 'fit-content',
            borderRadius: '28px',
            background: 'hsl(var(--background) / 0.55)',
            backdropFilter: 'blur(40px) saturate(2)',
            WebkitBackdropFilter: 'blur(40px) saturate(2)',
            border: '0.5px solid hsl(0 0% 100% / 0.15)',
            boxShadow: '0 8px 32px hsl(0 0% 0% / 0.35), 0 0 0 0.5px hsl(0 0% 100% / 0.05) inset, 0 1px 0 hsl(0 0% 100% / 0.06) inset',
          }}
        >
          {/* First 2 tabs */}
          {tabs.slice(0, 2).map((tab) => (
            <LiquidTab
              key={tab.url}
              icon={tab.icon}
              label={tab.title}
              active={isActive(tab.url)}
              onClick={() => {
                haptic(isActive(tab.url) ? 'light' : 'medium');
                navigate(tab.url);
              }}
            />
          ))}

          {/* Center AI Button */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            transition={spring}
            onClick={() => { haptic('medium'); setAiOpen(prev => !prev); }}
            className="relative flex items-center justify-center mx-0.5"
          >
            <motion.div
              className="w-11 h-11 rounded-full flex items-center justify-center"
              animate={{
                background: aiOpen
                  ? 'linear-gradient(135deg, hsl(0 0% 100% / 0.2), hsl(0 0% 100% / 0.08))'
                  : 'linear-gradient(135deg, hsl(0 0% 100% / 0.12), hsl(0 0% 100% / 0.04))',
              }}
              style={{
                border: '0.5px solid hsl(0 0% 100% / 0.15)',
                boxShadow: '0 2px 12px hsl(0 0% 0% / 0.3), 0 0 0 0.5px hsl(0 0% 100% / 0.05) inset',
              }}
            >
              <AnimatePresence mode="wait">
                {aiOpen ? (
                  <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <X className="w-[18px] h-[18px] text-foreground/90" />
                  </motion.div>
                ) : (
                  <motion.div key="ai" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <Sparkles className="w-[18px] h-[18px] text-foreground/90" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.button>

          {/* Last 2 tabs */}
          {tabs.slice(2).map((tab) => (
            <LiquidTab
              key={tab.url}
              icon={tab.icon}
              label={tab.title}
              active={isActive(tab.url)}
              onClick={() => {
                haptic(isActive(tab.url) ? 'light' : 'medium');
                navigate(tab.url);
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* Hidden Scan trigger */}
      <ScanFoodDialog onFoodsScanned={() => {}}>
        <button ref={scanTriggerRef} className="hidden" />
      </ScanFoodDialog>
    </>
  );
}

/* Liquid Glass Tab — expands to pill with label when active, icon-only when inactive */
function LiquidTab({ icon: Icon, label, active, onClick }: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="relative flex items-center justify-center touch-target overflow-hidden"
      whileTap={{ scale: 0.9 }}
      transition={spring}
    >
      <motion.div
        className="flex items-center gap-1.5 relative z-10"
        animate={{
          paddingLeft: active ? 14 : 12,
          paddingRight: active ? 16 : 12,
          paddingTop: 8,
          paddingBottom: 8,
        }}
        transition={liquidSpring}
      >
        {/* Liquid glass pill background for active state */}
        <AnimatePresence>
          {active && (
            <motion.div
              layoutId="liquid-pill"
              className="absolute inset-0 rounded-full"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={liquidSpring}
              style={{
                background: 'linear-gradient(135deg, hsl(0 0% 100% / 0.18), hsl(0 0% 100% / 0.06))',
                border: '0.5px solid hsl(0 0% 100% / 0.2)',
                boxShadow: '0 2px 8px hsl(0 0% 0% / 0.2), 0 0 0 0.5px hsl(0 0% 100% / 0.08) inset',
              }}
            />
          )}
        </AnimatePresence>

        <Icon className={`w-[20px] h-[20px] relative z-10 transition-colors duration-200 ${active ? 'text-foreground' : 'text-muted-foreground'}`} />

        <AnimatePresence>
          {active && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={liquidSpring}
              className="text-[13px] font-semibold text-foreground relative z-10 whitespace-nowrap overflow-hidden"
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.button>
  );
}
