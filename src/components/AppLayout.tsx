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

// Pages that manage their own layout (bypass main scroll)
const CUSTOM_LAYOUT_ROUTES = ['/ai-coach'];

// Full-screen flows where the tab bar has no business showing
const NO_TAB_BAR_ROUTES = ['/onboarding'];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [forceHidden, setForceHidden] = useState(false);

  const autoHide = !NO_AUTOHIDE_ROUTES.includes(location.pathname);
  const isCustomLayout = CUSTOM_LAYOUT_ROUTES.includes(location.pathname);

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

  // No pt-safe here: full-screen pages (Auth, Onboarding) size themselves to
  // 100dvh and pad for the safe area internally — outer padding would push
  // them past the viewport and clip the bottom by the notch height.
  if (!user) return <div style={{ height: '100dvh', overflow: 'hidden' }}>{children}</div>;

  const isKeyboardOpen = keyboardHeight > 0;
  const shouldHideBar = isKeyboardOpen || forceHidden || NO_TAB_BAR_ROUTES.includes(location.pathname);

  return (
    <BottomBarContext.Provider value={{ hideBottomBar: () => setForceHidden(true), showBottomBar: () => setForceHidden(false) }}>
      <div className="w-full no-select no-bounce" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'fixed', inset: 0 }}>
        {/* iOS Status Bar area background */}
        <div className="status-bar-bg bg-background/80" style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }} />
        
        {isCustomLayout ? (
          <div className="flex-1 overflow-hidden relative">
            {children}
          </div>
        ) : (
          <main
            className="flex-1 overflow-hidden"
            style={isKeyboardOpen ? { paddingBottom: keyboardHeight + 8 } : undefined}
          >
            {children}
          </main>
        )}
        <div style={shouldHideBar ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}>
          <BottomTabBar autoHide={autoHide} />
        </div>
      </div>
    </BottomBarContext.Provider>
  );
}
