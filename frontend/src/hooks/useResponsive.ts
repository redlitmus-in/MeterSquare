import { useState, useEffect } from 'react';

interface ResponsiveState {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLargeDesktop: boolean;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'large-desktop';
  orientation: 'portrait' | 'landscape';
}

export const useResponsive = (): ResponsiveState => {
  const [state, setState] = useState<ResponsiveState>(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    return {
      width,
      height,
      isMobile: width < 768,
      isTablet: width >= 768 && width < 1024,
      isDesktop: width >= 1024 && width < 1536,
      isLargeDesktop: width >= 1536,
      deviceType: width < 768 ? 'mobile' : width < 1024 ? 'tablet' : width < 1536 ? 'desktop' : 'large-desktop',
      orientation: width > height ? 'landscape' : 'portrait'
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setState({
        width,
        height,
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024 && width < 1536,
        isLargeDesktop: width >= 1536,
        deviceType: width < 768 ? 'mobile' : width < 1024 ? 'tablet' : width < 1536 ? 'desktop' : 'large-desktop',
        orientation: width > height ? 'landscape' : 'portrait'
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return state;
};

// Hook to check specific breakpoints
export const useBreakpoint = () => {
  const [breakpoint, setBreakpoint] = useState<string>(() => {
    const width = window.innerWidth;
    if (width < 375) return 'xxs';
    if (width < 640) return 'xs';
    if (width < 768) return 'sm';
    if (width < 1024) return 'md';
    if (width < 1280) return 'lg';
    if (width < 1536) return 'xl';
    if (width < 1920) return '2xl';
    return '3xl';
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 375) setBreakpoint('xxs');
      else if (width < 640) setBreakpoint('xs');
      else if (width < 768) setBreakpoint('sm');
      else if (width < 1024) setBreakpoint('md');
      else if (width < 1280) setBreakpoint('lg');
      else if (width < 1536) setBreakpoint('xl');
      else if (width < 1920) setBreakpoint('2xl');
      else setBreakpoint('3xl');
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    breakpoint,
    isXxs: breakpoint === 'xxs',
    isXs: breakpoint === 'xs',
    isSm: breakpoint === 'sm',
    isMd: breakpoint === 'md',
    isLg: breakpoint === 'lg',
    isXl: breakpoint === 'xl',
    is2xl: breakpoint === '2xl',
    is3xl: breakpoint === '3xl',
    isMobileOrSmaller: ['xxs', 'xs', 'sm'].includes(breakpoint),
    isTabletOrSmaller: ['xxs', 'xs', 'sm', 'md'].includes(breakpoint),
    isDesktopOrLarger: ['lg', 'xl', '2xl', '3xl'].includes(breakpoint),
  };
};

// Hook for media queries
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => {
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
};