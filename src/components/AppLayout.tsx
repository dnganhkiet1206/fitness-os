import { useAuth } from '@/hooks/useAuth';
import { BottomTabBar } from '@/components/BottomTabBar';
import { useEffect, useState, createContext, useContext } from 'react';

const BottomBarContext = createContext<{
  hideBottomBar: () => void;
  showBottomBar: () => void;
}>({ hideBottomBar: () => {}, showBottomBar: () => {} });

export const useBottomBar = () => useContext(BottomBarContext);

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [forceHidden, setForceHidden] = useState(false);

  useEffect(() => {
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
  const shouldHideBar = isKeyboardOpen || forceHidden;

  return (
    <BottomBarContext.Provider value={{ hideBottomBar: () => setForceHidden(true), showBottomBar: () => setForceHidden(false) }}>
      <div className="min-h-screen w-full no-select scroll-container">
        <main
          className="pt-safe pb-24 keyboard-aware"
          style={isKeyboardOpen ? { paddingBottom: keyboardHeight + 8 } : undefined}
        >
          {children}
        </main>
        {/* Always render so ScanFoodDialog stays mounted; hide visually with CSS */}
        <div style={shouldHideBar ? { display: 'none' } : undefined}>
          <BottomTabBar />
        </div>
      </div>
    </BottomBarContext.Provider>
  );
}
