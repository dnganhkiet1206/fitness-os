import { useAuth } from '@/hooks/useAuth';
import { BottomTabBar } from '@/components/BottomTabBar';
import { useEffect, useState, createContext, useContext } from 'react';
import { useLocation } from 'react-router-dom';

const BottomBarContext = createContext<{
  hideBottomBar: () => void;
  showBottomBar: () => void;
}>({ hideBottomBar: () => {}, showBottomBar: () => {} });

export const useBottomBar = () => useContext(BottomBarContext);

// Pages where bottom bar should NOT auto-hide on scroll
const NO_AUTOHIDE_ROUTES = ['/ai-coach'];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [forceHidden, setForceHidden] = useState(false);

  const autoHide = !NO_AUTOHIDE_ROUTES.includes(location.pathname);

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

  if (!user) return <div className="pt-safe" style={{ height: '100dvh', overflow: 'hidden' }}>{children}</div>;

  const isKeyboardOpen = keyboardHeight > 0;
  const shouldHideBar = isKeyboardOpen || forceHidden;

  return (
    <BottomBarContext.Provider value={{ hideBottomBar: () => setForceHidden(true), showBottomBar: () => setForceHidden(false) }}>
      <div className="w-full no-select" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <main
          className="flex-1 overflow-y-auto scroll-container keyboard-aware"
          style={isKeyboardOpen ? { paddingBottom: keyboardHeight + 8 } : { paddingBottom: 80 }}
        >
          {children}
        </main>
        <div style={shouldHideBar ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}>
          <BottomTabBar autoHide={autoHide} />
        </div>
      </div>
    </BottomBarContext.Provider>
  );
}
