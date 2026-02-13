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
        {/* Use visibility instead of display:none to keep animations working */}
        <div style={shouldHideBar ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}>
          <BottomTabBar autoHide={autoHide} />
        </div>
      </div>
    </BottomBarContext.Provider>
  );
}
