import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/hooks/useAuth';
import { LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();

  if (!user) return <>{children}</>;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-50 h-12 border-b border-border/30 flex items-center justify-between px-4"
            style={{ 
              background: 'hsl(225 15% 6% / 0.6)', 
              backdropFilter: 'blur(40px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
            }}
          >
            <SidebarTrigger className="text-muted-foreground hover:text-foreground haptic-press rounded-xl">
              <Menu className="w-5 h-5" />
            </SidebarTrigger>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button variant="ghost" size="icon" onClick={signOut} className="text-muted-foreground hover:text-foreground rounded-xl w-8 h-8">
                <LogOut className="w-4 h-4" />
              </Button>
            </motion.div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
