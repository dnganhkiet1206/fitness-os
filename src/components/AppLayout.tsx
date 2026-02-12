import { useAuth } from '@/hooks/useAuth';
import { BottomTabBar } from '@/components/BottomTabBar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) return <>{children}</>;

  return (
    <div className="min-h-screen w-full">
      <main className="pb-24">{children}</main>
      <BottomTabBar />
    </div>
  );
}
