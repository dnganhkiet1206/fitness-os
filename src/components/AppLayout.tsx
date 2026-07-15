import { useAuth } from '@/hooks/useAuth';
import { BottomTabBar } from '@/components/BottomTabBar';
import { useEffect, useState, createContext, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { NO_AUTOHIDE_ROUTES, CUSTOM_LAYOUT_ROUTES, NO_TAB_BAR_ROUTES } from '@/lib/route-config';

const BottomBarContext = createContext<{
  hideBottomBar: () => void;
  showBottomBar: () => void;
}>({ hideBottomBar: () => {}, showBottomBar: () => {} });

export const useBottomBar = () => useContext(BottomBarContext);

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [forceHidden, setForceHidden] = useState(false);

  const autoHide = !NO_AUTOHIDE_ROUTES.has(location.pathname);
  const isCustomLayout = CUSTOM_LAYOUT_ROUTES.has(location.pathname);

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

  // Expose keyboard height as a CSS variable so self-managed layouts
  // (chat, sheets) can shrink themselves above the keyboard.
  useEffect(() => {
    document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
  }, [keyboardHeight]);

  // With Keyboard resize:'none', WebKit won't reflow the page for the
  // keyboard — nudge the focused field into view inside its scroller.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.matches?.('input, textarea, select, [contenteditable]')) return;
      window.setTimeout(() => {
        if (document.activeElement === el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 350);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  // No pt-safe here: full-screen pages (Auth, Onboarding) size themselves to
  // 100dvh and pad for the safe area internally — outer padding would push
  // them past the viewport and clip the bottom by the notch height.
  if (!user) return <div style={{ height: '100dvh', overflow: 'hidden' }}>{children}</div>;

  const isKeyboardOpen = keyboardHeight > 0;
  const shouldHideBar = isKeyboardOpen || forceHidden || NO_TAB_BAR_ROUTES.has(location.pathname);

  return (
    <BottomBarContext.Provider value={{ hideBottomBar: () => setForceHidden(true), showBottomBar: () => setForceHidden(false) }}>
      {/* data-vaul-drawer-wrapper: bottom sheets scale this container back
          like a native iOS sheet presentation */}
      <div data-vaul-drawer-wrapper className="w-full no-select no-bounce bg-background" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'fixed', inset: 0 }}>
        {/* iOS Status Bar area background */}
        <div className="status-bar-bg bg-background/80" style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }} />
        
        <main
          className={`flex-1 overflow-hidden ${isCustomLayout ? 'relative' : ''}`}
          // Custom-layout pages size themselves via --keyboard-height instead
          style={!isCustomLayout && isKeyboardOpen ? { paddingBottom: keyboardHeight + 8 } : undefined}
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
