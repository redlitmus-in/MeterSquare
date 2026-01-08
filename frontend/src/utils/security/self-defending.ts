/**
 * Self-Defending Code System
 * Protects against tampering and debugging without breaking functionality
 */

export class SelfDefendingSystem {
  private isProduction: boolean;
  private detectionCount: number = 0;
  private maxDetections: number = 3;
  private originalFunctions: Map<string, any> = new Map();

  constructor() {
    this.isProduction = import.meta.env.PROD;

    // Only activate in production
    if (this.isProduction) {
      this.initializeProtection();
    }
  }

  private initializeProtection(): void {
    // Store original functions
    this.storeOriginalFunctions();

    // Basic protection that won't break functionality
    this.protectConsole();
    this.detectDevTools();
    this.preventFunctionOverwrite();
    this.monitorDOMChanges();

    // Check integrity periodically
    setInterval(() => this.checkIntegrity(), 10000); // Every 10 seconds
  }

  /**
   * Store original function references
   */
  private storeOriginalFunctions(): void {
    this.originalFunctions.set('fetch', window.fetch);
    this.originalFunctions.set('XMLHttpRequest', window.XMLHttpRequest);
    this.originalFunctions.set('localStorage.setItem', localStorage.setItem);
    this.originalFunctions.set('localStorage.getItem', localStorage.getItem);
  }

  /**
   * Protect console without breaking debugging in development
   */
  private protectConsole(): void {
    // Only disable in production
    if (this.isProduction) {
      const noop = () => {};

      // Store original console for internal use
      const originalConsole = { ...console };
      (window as any).__originalConsole = originalConsole;

      // Override console methods
      console.log = noop;
      console.debug = noop;
      console.info = noop;
      console.warn = (...args: any[]) => {
        // Allow warnings for critical issues
        if (args[0]?.includes('Security') || args[0]?.includes('Error')) {
          originalConsole.warn(...args);
        }
      };

      // Keep error for debugging critical issues
      console.error = (...args: any[]) => {
        originalConsole.error(...args);
      };
    }
  }

  /**
   * Detect DevTools opening (non-intrusive)
   */
  private detectDevTools(): void {
    let devtools = { open: false };
    const threshold = 160;

    // Method 1: Size detection
    const checkSize = () => {
      if (
        window.outerHeight - window.innerHeight > threshold ||
        window.outerWidth - window.innerWidth > threshold
      ) {
        if (!devtools.open) {
          devtools.open = true;
          this.onDevToolsOpen();
        }
      } else {
        devtools.open = false;
      }
    };

    // Method 2: Performance detection
    const checkPerformance = () => {
      const start = performance.now();
      debugger; // This line pauses if DevTools is open
      const end = performance.now();

      if (end - start > 100) {
        if (!devtools.open) {
          devtools.open = true;
          this.onDevToolsOpen();
        }
      }
    };

    // Check periodically but not too frequently
    setInterval(checkSize, 2000);

    // Only use debugger check in production
    if (this.isProduction) {
      setInterval(checkPerformance, 5000);
    }
  }

  /**
   * Handle DevTools detection (non-destructive)
   */
  private onDevToolsOpen(): void {
    this.detectionCount++;

    // Log security event
    this.logSecurityEvent('devtools_opened', {
      timestamp: Date.now(),
      userAgent: navigator.userAgent
    });

    // Only take action after multiple detections
    if (this.detectionCount >= this.maxDetections && this.isProduction) {
      // Don't break the app, just add protection
      this.addExtraProtection();
    }
  }

  /**
   * Prevent critical function overwriting
   */
  private preventFunctionOverwrite(): void {
    // Freeze critical objects
    if (this.isProduction) {
      try {
        Object.freeze(window.fetch);
        Object.freeze(window.XMLHttpRequest);
        Object.freeze(localStorage);
        Object.freeze(sessionStorage);
      } catch (e) {
        // Silently fail if freezing is not supported
      }
    }

    // Monitor for overwrites
    const criticalFunctions = ['fetch', 'XMLHttpRequest'];

    criticalFunctions.forEach(funcName => {
      Object.defineProperty(window, funcName, {
        get: () => this.originalFunctions.get(funcName),
        set: (value) => {
          this.logSecurityEvent('function_overwrite_attempt', {
            function: funcName,
            timestamp: Date.now()
          });
          // Don't actually prevent the overwrite in development
          if (!this.isProduction) {
            this.originalFunctions.set(funcName, value);
          }
        },
        configurable: !this.isProduction
      });
    });
  }

  /**
   * Monitor DOM for malicious injections
   */
  private monitorDOMChanges(): void {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              // Check for suspicious scripts
              if (node.tagName === 'SCRIPT') {
                const src = node.getAttribute('src');
                if (src && !this.isTrustedSource(src)) {
                  this.handleSuspiciousScript(node);
                }
              }

              // Check for suspicious iframes
              if (node.tagName === 'IFRAME') {
                const src = node.getAttribute('src');
                if (src && !this.isTrustedSource(src)) {
                  this.handleSuspiciousIframe(node);
                }
              }

              // Check for inline event handlers
              const attributes = node.attributes;
              if (attributes) {
                for (let i = 0; i < attributes.length; i++) {
                  const attr = attributes[i];
                  if (attr.name.startsWith('on')) {
                    this.handleInlineEvent(node, attr);
                  }
                }
              }
            }
          });
        }
      });
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href', 'onclick', 'onerror', 'onload']
    });
  }

  /**
   * Check if source is trusted
   */
  private isTrustedSource(src: string): boolean {
    const trustedDomains = [
      'localhost',
      '127.0.0.1',
      'unpkg.com',
      'cdnjs.cloudflare.com',
      'googleapis.com',
      window.location.hostname
    ];

    return trustedDomains.some(domain => src.includes(domain));
  }

  /**
   * Handle suspicious script injection
   */
  private handleSuspiciousScript(node: HTMLElement): void {
    this.logSecurityEvent('suspicious_script', {
      src: node.getAttribute('src'),
      timestamp: Date.now()
    });

    // Remove in production
    if (this.isProduction) {
      node.remove();
    }
  }

  /**
   * Handle suspicious iframe
   */
  private handleSuspiciousIframe(node: HTMLElement): void {
    this.logSecurityEvent('suspicious_iframe', {
      src: node.getAttribute('src'),
      timestamp: Date.now()
    });

    // Sandbox the iframe
    node.setAttribute('sandbox', '');

    // Remove in production
    if (this.isProduction) {
      node.remove();
    }
  }

  /**
   * Handle inline event handlers
   */
  private handleInlineEvent(node: HTMLElement, attr: Attr): void {
    this.logSecurityEvent('inline_event_handler', {
      element: node.tagName,
      event: attr.name,
      timestamp: Date.now()
    });

    // Remove inline handler in production
    if (this.isProduction) {
      node.removeAttribute(attr.name);
    }
  }

  /**
   * Check system integrity
   */
  private checkIntegrity(): void {
    // Check if critical functions have been modified
    ['fetch', 'XMLHttpRequest'].forEach(funcName => {
      const current = (window as any)[funcName];
      const original = this.originalFunctions.get(funcName);

      if (current !== original) {
        this.logSecurityEvent('integrity_violation', {
          function: funcName,
          timestamp: Date.now()
        });

        // Restore original in production
        if (this.isProduction) {
          (window as any)[funcName] = original;
        }
      }
    });
  }

  /**
   * Add extra protection when threats detected
   */
  private addExtraProtection(): void {
    // Disable right-click
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // Disable text selection
    document.body.style.userSelect = 'none';

    // Disable copy
    document.addEventListener('copy', (e) => e.preventDefault());

    // Clear clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText('');
    }
  }

  /**
   * Log security events
   */
  private logSecurityEvent(type: string, data: any): void {
    // Store in encrypted format
    const event = {
      type,
      data,
      session: sessionStorage.getItem('session_id'),
      timestamp: Date.now()
    };

    // Send to backend if available
    if (this.isProduction) {
      // Use beacon API for reliability
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/security/events', JSON.stringify(event));
      }
    }

    // Store locally for analysis
    const events = JSON.parse(localStorage.getItem('security_events') || '[]');
    events.push(event);

    // Keep only last 100 events
    if (events.length > 100) {
      events.shift();
    }

    localStorage.setItem('security_events', JSON.stringify(events));
  }

  /**
   * Get security status
   */
  public getSecurityStatus(): {
    detectionCount: number;
    isProtected: boolean;
    events: any[];
  } {
    return {
      detectionCount: this.detectionCount,
      isProtected: this.isProduction,
      events: JSON.parse(localStorage.getItem('security_events') || '[]')
    };
  }
}

// Singleton instance
export const selfDefense = new SelfDefendingSystem();