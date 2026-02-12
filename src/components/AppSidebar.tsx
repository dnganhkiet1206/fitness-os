import { Home, Utensils, Dumbbell, Pill, Moon, TrendingUp, Settings, Sparkles, Droplets, ShoppingCart, Target, BarChart3, Medal, Swords, Heart } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';
import { useEffect } from 'react';

export function AppSidebar() {
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  // Auto-close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [location.pathname, isMobile, setOpenMobile]);

  const mainItems = [
    { title: i18n.navToday, url: '/', icon: Home },
    { title: i18n.navNutrition, url: '/nutrition', icon: Utensils },
    { title: i18n.navWorkouts, url: '/workouts', icon: Dumbbell },
    { title: i18n.navSupplements, url: '/supplements', icon: Pill },
    { title: i18n.navSleep, url: '/sleep', icon: Moon },
    { title: i18n.navWater, url: '/water', icon: Droplets },
    { title: i18n.navBiometrics, url: '/biometrics', icon: Heart },
    { title: i18n.navProgress, url: '/progress', icon: TrendingUp },
  ];

  const analyticItems = [
    { title: i18n.navWeeklyReview, url: '/weekly-review', icon: BarChart3 },
    { title: i18n.navSmartGoals, url: '/smart-goals', icon: Target },
    { title: i18n.navAwards, url: '/awards', icon: Medal },
    { title: i18n.navChallenges, url: '/challenges', icon: Swords },
    { title: i18n.navGrocery, url: '/grocery', icon: ShoppingCart },
    { title: i18n.navAiCoach, url: '/ai-coach', icon: Sparkles },
  ];

  return (
    <Sidebar className="border-r border-border/20" style={{
      background: 'hsl(225 15% 6% / 0.8)',
      backdropFilter: 'blur(40px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
    }}>
      <SidebarHeader className="px-4 py-5 border-b border-border/10">
        <motion.h1
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="text-lg font-bold tracking-tight"
        >
          <span className="text-gradient-green">Fitness</span>
          <span className="text-foreground"> OS</span>
        </motion.h1>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 px-4 mb-1">{i18n.navMain}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item, i) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-all duration-200 haptic-press"
                      activeClassName="bg-primary/10 text-primary font-medium shadow-[inset_0_0_0_1px_hsl(160_84%_39%_/_0.15)]"
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 px-4 mb-1">{i18n.navAnalytics}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {analyticItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-all duration-200 haptic-press"
                      activeClassName="bg-primary/10 text-primary font-medium shadow-[inset_0_0_0_1px_hsl(160_84%_39%_/_0.15)]"
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-border/10">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/settings"
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-all duration-200 haptic-press"
                activeClassName="bg-primary/10 text-primary font-medium"
              >
                <Settings className="w-4 h-4" />
                <span>{i18n.navSettings}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
