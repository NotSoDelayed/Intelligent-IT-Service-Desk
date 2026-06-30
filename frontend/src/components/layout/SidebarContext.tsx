import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

type Viewport = 'mobile' | 'tablet' | 'desktop';

interface SidebarContextValue {
  /** Whether the sidebar is visible (mobile drawer open or desktop/tablet sidebar shown) */
  isOpen: boolean;
  /** Whether the sidebar is in collapsed (icon-only) mode — only applies on tablet */
  isCollapsed: boolean;
  /** Current viewport category */
  viewport: Viewport;
  /** Toggle sidebar open/closed (mobile drawer) or collapsed/expanded (tablet) */
  toggle: () => void;
  /** Close the sidebar (primarily for mobile drawer) */
  close: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

function getViewport(width: number): Viewport {
  if (width < MOBILE_BREAKPOINT) return 'mobile';
  if (width < TABLET_BREAKPOINT) return 'tablet';
  return 'desktop';
}

export function SidebarProvider({ children }: PropsWithChildren) {
  const [viewport, setViewport] = useState<Viewport>(() => getViewport(window.innerWidth));
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Track viewport changes
  useEffect(() => {
    const handleResize = () => {
      const newViewport = getViewport(window.innerWidth);
      setViewport((prev) => {
        if (prev === newViewport) return prev;

        // Reset sidebar state on viewport change
        if (newViewport === 'mobile') {
          setIsOpen(false);
          setIsCollapsed(false);
        } else if (newViewport === 'tablet') {
          setIsOpen(true);
          setIsCollapsed(true);
        } else {
          setIsOpen(true);
          setIsCollapsed(false);
        }

        return newViewport;
      });
    };

    // Set initial state based on viewport
    const initialViewport = getViewport(window.innerWidth);
    if (initialViewport === 'desktop') {
      setIsOpen(true);
      setIsCollapsed(false);
    } else if (initialViewport === 'tablet') {
      setIsOpen(true);
      setIsCollapsed(true);
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggle = useCallback(() => {
    if (viewport === 'mobile') {
      setIsOpen((prev) => !prev);
    } else {
      setIsCollapsed((prev) => !prev);
    }
  }, [viewport]);

  const close = useCallback(() => {
    if (viewport === 'mobile') {
      setIsOpen(false);
    }
  }, [viewport]);

  return (
    <SidebarContext value={{ isOpen, isCollapsed, viewport, toggle, close }}>
      {children}
    </SidebarContext>
  );
}

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
