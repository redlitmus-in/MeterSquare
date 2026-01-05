/**
 * Mobile Responsive Handler
 * Automatically adjusts layout for mobile devices
 */

export class MobileResponsiveHandler {
  private static instance: MobileResponsiveHandler;
  private isMobile: boolean = false;
  private initialized: boolean = false;
  private processedGrids = new Set<string>();
  private processedElements = new WeakSet();

  private constructor() {
    this.checkViewport();
    this.setupEventListeners();
  }

  static getInstance(): MobileResponsiveHandler {
    if (!MobileResponsiveHandler.instance) {
      MobileResponsiveHandler.instance = new MobileResponsiveHandler();
    }
    return MobileResponsiveHandler.instance;
  }

  private checkViewport() {
    this.isMobile = window.innerWidth <= 640;
  }

  private setupEventListeners() {
    // Listen for resize events with debouncing
    let resizeTimer: NodeJS.Timeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const wasMobile = this.isMobile;
        this.checkViewport();
        if (wasMobile !== this.isMobile) {
          this.applyMobileStyles();
        }
      }, 250);
    });

    // Setup mutation observer to handle dynamic content
    const observer = new MutationObserver((mutations) => {
      // Only process if we're on mobile and there are relevant changes
      if (this.isMobile) {
        let shouldProcess = false;
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Check if any added nodes contain grids or tabs
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === 1) { // Element node
                const element = node as Element;
                if (element.classList?.contains('grid') ||
                    element.querySelector?.('.grid') ||
                    element.querySelector?.('[role="tablist"]')) {
                  shouldProcess = true;
                }
              }
            });
          }
        }
        if (shouldProcess) {
          setTimeout(() => this.applyMobileStyles(), 100);
        }
      }
    });

    // Start observing when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        this.applyMobileStyles();
      });
    } else {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      this.applyMobileStyles();
    }
  }

  private generateGridId(grid: Element): string {
    // Generate a unique ID based on grid location and content
    const parent = grid.parentElement;
    const index = parent ? Array.from(parent.children).indexOf(grid) : 0;
    const childCount = grid.children.length;
    const firstChildClass = grid.children[0]?.className || '';
    return `grid-${index}-${childCount}-${firstChildClass.substring(0, 20)}`;
  }

  private applyMobileStyles() {
    if (!this.isMobile) {
      this.removeMobileStyles();
      return;
    }

    // Find and convert metric card grids to swipeable carousels
    this.convertMetricGridsToCarousel();

    // Fix tabs overflow
    this.fixTabsOverflow();

    // Optimize buttons and controls
    this.optimizeButtons();

    // Fix header cards
    this.fixHeaderCards();
  }

  private convertMetricGridsToCarousel() {
    // Find all metric card grids
    const grids = document.querySelectorAll('.grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-4');

    grids.forEach((grid) => {
      // Generate unique ID for this grid
      const gridId = this.generateGridId(grid);

      // Skip if already processed
      if (this.processedGrids.has(gridId)) {
        return;
      }

      // Check if this grid contains metric cards
      const hasMetricCards = grid.querySelector('.bg-blue-50, .bg-green-50, .bg-orange-50, .bg-purple-50, .bg-red-50, .bg-yellow-50, .bg-indigo-50');

      if (hasMetricCards && !grid.classList.contains('mobile-carousel')) {
        // Mark as processed
        this.processedGrids.add(gridId);

        // Add mobile carousel class
        grid.classList.add('mobile-carousel');
        grid.setAttribute('data-grid-id', gridId);

        // Apply mobile styles
        (grid as HTMLElement).style.cssText = `
          display: flex !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          scroll-snap-type: x mandatory !important;
          gap: 1rem !important;
          padding: 0.5rem !important;
          -webkit-overflow-scrolling: touch !important;
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        `;

        // Style each card
        const cards = grid.children;
        Array.from(cards).forEach((card) => {
          (card as HTMLElement).style.cssText = `
            flex: 0 0 85% !important;
            scroll-snap-align: center !important;
            max-width: 320px !important;
          `;
        });

        // Check if indicators already exist for this specific grid
        const existingIndicators = document.querySelector(`.swipe-indicators[data-for-grid="${gridId}"]`);

        if (!existingIndicators && cards.length > 1) {
          const indicators = document.createElement('div');
          indicators.className = 'swipe-indicators flex justify-center gap-1.5 mt-3';
          indicators.setAttribute('data-for-grid', gridId);

          for (let i = 0; i < cards.length; i++) {
            const dot = document.createElement('div');
            dot.className = 'w-1.5 h-1.5 rounded-full bg-gray-300';
            if (i === 0) dot.classList.add('bg-gray-500');
            indicators.appendChild(dot);
          }

          // Insert after the grid
          grid.parentNode?.insertBefore(indicators, grid.nextSibling);

          // Update active indicator on scroll
          let scrollTimeout: NodeJS.Timeout;
          const scrollHandler = () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
              const scrollLeft = grid.scrollLeft;
              const cardWidth = (cards[0] as HTMLElement).offsetWidth + 16; // width + gap
              const activeIndex = Math.round(scrollLeft / cardWidth);

              indicators.querySelectorAll('div').forEach((dot, index) => {
                if (index === activeIndex) {
                  dot.classList.add('bg-gray-500');
                  dot.classList.remove('bg-gray-300');
                } else {
                  dot.classList.add('bg-gray-300');
                  dot.classList.remove('bg-gray-500');
                }
              });
            }, 50);
          };

          // Remove any existing scroll listeners before adding new one
          grid.removeEventListener('scroll', scrollHandler);
          grid.addEventListener('scroll', scrollHandler);
        }
      }
    });
  }

  private fixTabsOverflow() {
    const tabLists = document.querySelectorAll('[role="tablist"]');

    tabLists.forEach((tabList) => {
      if (!this.processedElements.has(tabList)) {
        this.processedElements.add(tabList);
        tabList.classList.add('mobile-optimized');

        // Add styles to make tabs scrollable
        (tabList as HTMLElement).style.cssText = `
          display: flex !important;
          overflow-x: auto !important;
          gap: 0.25rem !important;
          padding: 0.5rem !important;
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
          -webkit-overflow-scrolling: touch !important;
        `;

        // Style individual tabs to prevent cutting
        const tabs = tabList.querySelectorAll('[role="tab"]');
        tabs.forEach((tab) => {
          (tab as HTMLElement).style.cssText = `
            flex-shrink: 0 !important;
            padding: 0.5rem 1rem !important;
            font-size: 0.875rem !important;
            white-space: nowrap !important;
            min-width: fit-content !important;
          `;
        });
      }
    });
  }

  private fixHeaderCards() {
    // Fix the header cards with "New Purchase Request" button
    const headerCards = document.querySelectorAll('.bg-gradient-to-r, .bg-gradient-to-br, [class*="bg-"][class*="-50"]');

    headerCards.forEach((card) => {
      // Check if this is the main header card (contains h1 or title)
      if (card.querySelector('h1') || card.textContent?.includes('Hub')) {
        const button = card.querySelector('button');
        if (button && !this.processedElements.has(button)) {
          this.processedElements.add(button);
          // Make the button more visible and properly positioned
          (button as HTMLElement).style.cssText += `
            position: relative !important;
            z-index: 10 !important;
            white-space: nowrap !important;
            padding: 0.5rem 1rem !important;
            font-size: 0.875rem !important;
            min-width: fit-content !important;
          `;
        }

        // Ensure the card doesn't cut off content
        if (!this.processedElements.has(card)) {
          this.processedElements.add(card);
          (card as HTMLElement).style.cssText += `
            overflow: visible !important;
            padding: 1rem !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 0.5rem !important;
          `;
        }
      }
    });
  }

  private optimizeButtons() {
    // Find button groups that might overflow
    const buttonGroups = document.querySelectorAll('.flex.items-center.gap-2, .flex.items-center.gap-3');

    buttonGroups.forEach((group) => {
      // Check if this is in a filter/control area
      const isFilterArea = group.closest('.flex-wrap') || group.querySelector('select, input[type="search"]');

      if (isFilterArea && !this.processedElements.has(group)) {
        this.processedElements.add(group);
        group.classList.add('mobile-wrapped');
        (group as HTMLElement).style.cssText = `
          flex-wrap: wrap !important;
          gap: 0.5rem !important;
        `;

        // Make buttons smaller on mobile
        const buttons = group.querySelectorAll('button');
        buttons.forEach((button) => {
          if (!button.classList.contains('mobile-optimized')) {
            button.classList.add('mobile-optimized');
            (button as HTMLElement).style.cssText += `
              padding: 0.375rem 0.75rem !important;
              font-size: 0.75rem !important;
              min-height: 32px !important;
            `;
          }
        });
      }
    });

    // Fix "New Purchase Request" and similar action buttons
    const actionButtons = document.querySelectorAll('button.bg-red-500, button.bg-blue-500, button.bg-green-500');
    actionButtons.forEach((button) => {
      if (!this.processedElements.has(button)) {
        this.processedElements.add(button);
        const buttonText = button.textContent || '';
        if (buttonText.includes('New')) {
          (button as HTMLElement).style.cssText += `
            padding: 0.5rem 1rem !important;
            font-size: 0.875rem !important;
            white-space: nowrap !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 0.25rem !important;
            min-width: fit-content !important;
          `;
        }
      }
    });
  }

  private removeMobileStyles() {
    // Remove mobile carousel styles
    document.querySelectorAll('.mobile-carousel').forEach((el) => {
      el.classList.remove('mobile-carousel');
      el.removeAttribute('data-grid-id');
      (el as HTMLElement).style.cssText = '';

      // Reset card styles
      Array.from(el.children).forEach((child) => {
        (child as HTMLElement).style.cssText = '';
      });
    });

    // Remove all swipe indicators
    document.querySelectorAll('.swipe-indicators').forEach((el) => {
      el.remove();
    });

    // Reset tabs
    document.querySelectorAll('.mobile-optimized').forEach((el) => {
      el.classList.remove('mobile-optimized');
      (el as HTMLElement).style.cssText = '';

      // Reset tab styles
      el.querySelectorAll('[role="tab"]').forEach((tab) => {
        (tab as HTMLElement).style.cssText = '';
      });
    });

    // Reset button groups
    document.querySelectorAll('.mobile-wrapped').forEach((el) => {
      el.classList.remove('mobile-wrapped');
      (el as HTMLElement).style.cssText = '';
    });

    // Reset buttons
    document.querySelectorAll('button.mobile-optimized').forEach((button) => {
      button.classList.remove('mobile-optimized');
      (button as HTMLElement).style.cssText = '';
    });

    // Clear processed sets
    this.processedGrids.clear();
    this.processedElements = new WeakSet();
  }

  public initialize() {
    if (!this.initialized) {
      this.initialized = true;
      // Add global styles once
      this.addGlobalMobileStyles();
      this.applyMobileStyles();
    }
  }

  private addGlobalMobileStyles() {
    if (!document.querySelector('style[data-mobile-responsive]')) {
      const style = document.createElement('style');
      style.setAttribute('data-mobile-responsive', 'true');
      style.textContent = `
        @media (max-width: 640px) {
          .mobile-carousel::-webkit-scrollbar,
          [role="tablist"]::-webkit-scrollbar {
            display: none !important;
          }

          /* Prevent duplicate dots */
          .swipe-indicators + .swipe-indicators {
            display: none !important;
          }

          /* Ensure header cards don't cut off content */
          .bg-gradient-to-r,
          .bg-gradient-to-br {
            min-height: auto !important;
            overflow: visible !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }
}

// Auto-initialize when module is imported
if (typeof window !== 'undefined') {
  const handler = MobileResponsiveHandler.getInstance();
  handler.initialize();
}

export default MobileResponsiveHandler.getInstance();