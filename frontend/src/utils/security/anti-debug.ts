/**
 * Advanced Anti-Debugging Protection System
 * Prevents debugging and reverse engineering attempts
 */

// Only activate in production
if (typeof __PRODUCTION__ !== 'undefined' && __PRODUCTION__) {
  (() => {
    'use strict';

    // Encrypted console warning message
    const warningMsg = '\x57\x41\x52\x4E\x49\x4E\x47\x3A\x20\x44\x65\x62\x75\x67\x67\x69\x6E\x67\x20\x69\x73\x20\x64\x69\x73\x61\x62\x6C\x65\x64';

    // 1. Disable Developer Tools Detection
    const detectDevTools = () => {
      const threshold = 160;
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;

      if (widthThreshold || heightThreshold) {
        // DevTools detected - take action
        document.body.innerHTML = '';
        window.location.href = 'about:blank';
      }
    };

    // 2. Debugger Statement Detection
    const debuggerTrap = () => {
      const start = performance.now();
      // This will pause if debugger is attached
      debugger;
      const end = performance.now();

      if (end - start > 100) {
        // Debugger detected
        window.location.reload();
      }
    };

    // 3. Console Object Protection
    const protectConsole = () => {
      const noop = () => {};
      const methods = ['log', 'debug', 'info', 'warn', 'error', 'table', 'trace', 'dir'];

      methods.forEach(method => {
        try {
          Object.defineProperty(console, method, {
            value: noop,
            writable: false,
            configurable: false
          });
        } catch (e) {
          // Fallback
          (console as any)[method] = noop;
        }
      });

      // Prevent console object modification
      Object.freeze(console);
    };

    // 4. Context Menu - DISABLED (no right-click blocking)
    const disableContextMenu = () => {
      // Right-click allowed - no blocking for better UX
    };

    // 5. Text Selection - ALLOWED
    const disableSelection = () => {
      // Text selection allowed for better UX
    };

    // 6. Key Combination Blocking - DISABLED
    const blockKeyCombinations = () => {
      // All keyboard shortcuts allowed for better UX
    };

    // 7. Time-based Detection
    let checkInterval: NodeJS.Timeout;
    const timeBasedDetection = () => {
      let lastTime = Date.now();

      checkInterval = setInterval(() => {
        const currentTime = Date.now();
        if (currentTime - lastTime > 200) {
          // Execution was paused (likely debugger)
          clearInterval(checkInterval);
          document.body.style.display = 'none';
          window.location.href = 'about:blank';
        }
        lastTime = currentTime;
      }, 100);
    };

    // 8. Source Map Detection
    const detectSourceMaps = () => {
      const scripts = document.getElementsByTagName('script');
      for (let script of Array.from(scripts)) {
        if (script.src && script.src.includes('.map')) {
          // Source maps detected
          script.remove();
        }
      }
    };

    // 9. Global Variable Protection
    const protectGlobals = () => {
      // Prevent window object inspection
      try {
        Object.defineProperty(window, 'console', {
          get: function() {
            throw new Error('Access denied');
          },
          set: function() {
            throw new Error('Access denied');
          },
          configurable: false
        });
      } catch (e) {}

      // Hide sensitive global variables
      const sensitiveGlobals = ['__REACT_DEVTOOLS_GLOBAL_HOOK__', '__REDUX_DEVTOOLS_EXTENSION__'];
      sensitiveGlobals.forEach(global => {
        try {
          Object.defineProperty(window, global, {
            get: () => undefined,
            set: () => {},
            configurable: false
          });
        } catch (e) {}
      });
    };

    // 10. Mutation Observer for DOM Protection
    const protectDOM = () => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node: any) => {
              // Remove any injected script tags
              if (node.tagName === 'SCRIPT' && !node.src?.includes(window.location.hostname)) {
                node.remove();
              }
            });
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    };

    // 11. toString Method Protection
    const protectToString = () => {
      const originalToString = Function.prototype.toString;
      Function.prototype.toString = function() {
        if (this === Function.prototype.toString) {
          return 'function toString() { [native code] }';
        }
        return originalToString.call(this);
      };
    };

    // 12. Infinite Debugger Loop (use with caution)
    const infiniteDebuggerTrap = () => {
      if (typeof __PRODUCTION__ !== 'undefined' && __PRODUCTION__) {
        setInterval(() => {
          (function() {
            return false;
          }).constructor('debugger')();
        }, 50);
      }
    };

    // 13. Performance Monitoring
    const monitorPerformance = () => {
      let frameTime = 16; // 60 FPS baseline
      let lastTime = performance.now();

      const checkPerformance = () => {
        const currentTime = performance.now();
        const delta = currentTime - lastTime;

        if (delta > frameTime * 10) {
          // Significant performance drop (possible debugging)
          console.clear();
        }

        lastTime = currentTime;
        requestAnimationFrame(checkPerformance);
      };

      requestAnimationFrame(checkPerformance);
    };

    // 14. WebGL Fingerprinting Protection
    const protectWebGL = () => {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        // Mask WebGL vendor and renderer info
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.call(this, parameter);
      };
    };

    // Initialize all protections
    const initializeProtection = () => {
      try {
        protectConsole();
        disableContextMenu();
        disableSelection();
        blockKeyCombinations();
        detectSourceMaps();
        protectGlobals();
        protectToString();
        protectWebGL();

        // Delayed initialization for heavy protections
        setTimeout(() => {
          detectDevTools();
          timeBasedDetection();
          protectDOM();
          monitorPerformance();

          // Optional: Enable infinite debugger trap
          // infiniteDebuggerTrap();
        }, 1000);

        // Periodic checks
        setInterval(() => {
          detectDevTools();
          debuggerTrap();
          detectSourceMaps();
        }, 3000);

      } catch (error) {
        // Silently fail in case of errors
      }
    };

    // Start protection when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeProtection);
    } else {
      initializeProtection();
    }

    // Prevent removal of this script
    Object.freeze(initializeProtection);
  })();
}

// Export empty object to satisfy module system
export {};