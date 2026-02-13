import { useAuth } from '@/hooks/useAuth';
import { BottomTabBar } from '@/components/BottomTabBar';
import { useEffect, useState } from 'react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // Handle virtual keyboard on Capacitor/iOS
    const handleResize = () => {
      if (window.visualViewport) {
        const diff = window.innerHeight - window.visualViewport.height;
        setKeyboardHeight(diff > 50 ? diff : 0);
      }
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  if (!user) return <div className="pt-safe">{children}</div>;

  const isKeyboardOpen = keyboardHeight > 0;

  return (
    <div className="min-h-screen w-full no-select scroll-container">
      <main
        className="pt-safe pb-24 keyboard-aware"
        style={isKeyboardOpen ? { paddingBottom: keyboardHeight + 8 } : undefined}
      >
        {children}
      </main>
      {!isKeyboardOpen && <BottomTabBar />}
    </div>
  );
}
