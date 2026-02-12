import { Home, Utensils, Dumbbell, Pill, Moon, TrendingUp, Settings, Sparkles, Droplets, ShoppingCart, Target, BarChart3 } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
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
} from '@/components/ui/sidebar';

const mainItems = [
  { title: 'Today', url: '/', icon: Home },
  { title: 'Dinh dưỡng', url: '/nutrition', icon: Utensils },
  { title: 'Workouts', url: '/workouts', icon: Dumbbell },
  { title: 'Supplements', url: '/supplements', icon: Pill },
  { title: 'Giấc ngủ', url: '/sleep', icon: Moon },
  { title: 'Nước uống', url: '/water', icon: Droplets },
  { title: 'Tiến trình', url: '/progress', icon: TrendingUp },
];

const analyticItems = [
  { title: 'Weekly Review', url: '/weekly-review', icon: BarChart3 },
  { title: 'Smart Goals', url: '/smart-goals', icon: Target },
  { title: 'Grocery List', url: '/grocery', icon: ShoppingCart },
  { title: 'AI Coach', url: '/ai-coach', icon: Sparkles },
];

export function AppSidebar() {
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
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 px-4 mb-1">Main</SidebarGroupLabel>
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
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 px-4 mb-1">Analytics</SidebarGroupLabel>
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
                <span>Cài đặt</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
