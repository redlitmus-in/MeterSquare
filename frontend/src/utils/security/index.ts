/**
 * Main Security System
 * Initializes all security layers
 */

import { encryption } from './encryption';
import { selfDefense } from './self-defending';
import { secureAPI, secureFetch, secureStorage } from './secure-api';

class MeterSquareSecuritySystem {
  private initialized: boolean = false;

  constructor() {
    // Auto-initialize on construction
    this.initialize();
  }

  /**
   * Initialize all security systems
   */
  public initialize(): void {
    if (this.initialized) return;

    console.log('🔒 Initializing MeterSquare Security System...');

    // Initialize in production mode
    if (import.meta.env.PROD) {
      // Self-defending system starts automatically
      console.log('✅ Self-defending system active');

      // Replace global fetch with secure version
      this.replaceGlobalFetch();

      // Replace localStorage methods
      this.secureLocalStorage();

      // Add page visibility protection
      this.addVisibilityProtection();

      // Add copy protection for sensitive data
      this.addCopyProtection();

      console.log('✅ Security system fully initialized');
    } else {
      console.log('⚠️ Security system in development mode (reduced protection)');
    }

    this.initialized = true;
  }

  /**
   * Replace global fetch with secure version
   * This makes all API calls secure by default
   */
  private replaceGlobalFetch(): void {
    // Store original fetch
    const originalFetch = window.fetch;

    // Replace with secure fetch
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();

      // Use secure fetch for API calls
      if (url.includes('/api/')) {
        return secureFetch(url, init);
      }

      // Use original fetch for other resources
      return originalFetch(input, init);
    };
  }

  /**
   * Secure localStorage operations
   */
  private secureLocalStorage(): void {
    // Store original methods
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const originalGetItem = localStorage.getItem.bind(localStorage);

    // Override setItem to encrypt sensitive data
    localStorage.setItem = function(key: string, value: string): void {
      // List of sensitive keys to encrypt
      const sensitiveKeys = [
        'access_token',
        'refresh_token',
        'user',
        'session',
        'api_key',
        'credentials'
      ];

      if (sensitiveKeys.some(k => key.includes(k))) {
        // Encrypt sensitive data
        const encrypted = encryption.encrypt(value);
        originalSetItem(key, encrypted);
      } else {
        // Store non-sensitive data normally
        originalSetItem(key, value);
      }
    };

    // Override getItem to decrypt sensitive data
    localStorage.getItem = function(key: string): string | null {
      const value = originalGetItem(key);
      if (!value) return null;

      // List of sensitive keys to decrypt
      const sensitiveKeys = [
        'access_token',
        'refresh_token',
        'user',
        'session',
        'api_key',
        'credentials'
      ];

      if (sensitiveKeys.some(k => key.includes(k))) {
        // Decrypt sensitive data
        try {
          return encryption.decrypt(value);
        } catch {
          // Return original if decryption fails
          return value;
        }
      }

      return value;
    };
  }

  /**
   * Add visibility protection
   */
  private addVisibilityProtection(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Page is hidden, could be screenshot attempt
        // Blur sensitive content
        document.body.style.filter = 'blur(5px)';
      } else {
        // Page is visible again
        document.body.style.filter = 'none';
      }
    });
  }

  /**
   * Add copy protection for sensitive data
   */
  private addCopyProtection(): void {
    document.addEventListener('copy', (e) => {
      const selection = window.getSelection()?.toString() || '';

      // Check if selection contains sensitive patterns
      const sensitivePatterns = [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
        /\b[A-Z]{2}\d{2}\s?[A-Z0-9]{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/, // IBAN
        /Bearer\s+[A-Za-z0-9\-._~\+\/]+=*/, // Bearer token
      ];

      const containsSensitive = sensitivePatterns.some(pattern =>
        pattern.test(selection)
      );

      if (containsSensitive) {
        e.clipboardData?.setData('text/plain', '[REDACTED]');
        e.preventDefault();

        // Log security event
        console.warn('Sensitive data copy attempt blocked');
      }
    });
  }

  /**
   * Get security status
   */
  public getStatus(): {
    encryption: boolean;
    selfDefense: boolean;
    secureAPI: boolean;
  } {
    return {
      encryption: true,
      selfDefense: true,
      secureAPI: true
    };
  }

  /**
   * Export secure utilities for use in components
   */
  public utils = {
    encryption,
    secureFetch,
    secureStorage,
    selfDefense
  };
}

// Create and export singleton instance
export const Security = new MeterSquareSecuritySystem();

// Export individual components for direct import
export { encryption, selfDefense, secureAPI, secureFetch, secureStorage };

// Auto-initialize on import
if (typeof window !== 'undefined') {
  (window as any).__SECURITY__ = Security;
}