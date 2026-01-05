/**
 * Service Worker Integrity Validation
 * Ensures service workers are secure and not tampered with
 */

import { ServiceWorkerConfig } from '@/types';
import { handleError } from './errorHandler';

interface ValidationResult {
  valid: boolean;
  error?: string;
  timestamp: Date;
}

class ServiceWorkerValidator {
  private static instance: ServiceWorkerValidator;
  private readonly INTEGRITY_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
  private readonly SW_VERSION_KEY = 'sw_version';
  private readonly SW_INTEGRITY_KEY = 'sw_integrity';
  private validationTimer: NodeJS.Timeout | null = null;
  private lastValidation: ValidationResult | null = null;

  private constructor() {
    this.startPeriodicValidation();
  }

  static getInstance(): ServiceWorkerValidator {
    if (!ServiceWorkerValidator.instance) {
      ServiceWorkerValidator.instance = new ServiceWorkerValidator();
    }
    return ServiceWorkerValidator.instance;
  }

  /**
   * Start periodic validation of service worker
   */
  private startPeriodicValidation(): void {
    this.validationTimer = setInterval(() => {
      this.validateServiceWorker();
    }, this.INTEGRITY_CHECK_INTERVAL);
  }

  /**
   * Calculate checksum for integrity validation
   */
  private async calculateChecksum(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * Fetch and validate service worker script
   */
  private async fetchServiceWorkerScript(url: string): Promise<{ content: string; headers: Headers }> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-cache',
        headers: {
          'Service-Worker': 'script',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch service worker: ${response.status}`);
      }

      const content = await response.text();
      return { content, headers: response.headers };
    } catch (error) {
      handleError(error, 'high', 'system', {
        action: 'fetch_service_worker',
      });
      throw error;
    }
  }

  /**
   * Validate service worker integrity
   */
  async validateServiceWorker(config?: ServiceWorkerConfig): Promise<ValidationResult> {
    try {
      // Check if service workers are supported
      if (!('serviceWorker' in navigator)) {
        return {
          valid: true,
          error: 'Service Workers not supported',
          timestamp: new Date(),
        };
      }

      // Get current registration
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        return {
          valid: true,
          error: 'No service worker registered',
          timestamp: new Date(),
        };
      }

      // Fetch the service worker script
      const scriptUrl = registration.active?.scriptURL || '/sw.js';
      const { content, headers } = await this.fetchServiceWorkerScript(scriptUrl);

      // Calculate checksum
      const currentChecksum = await this.calculateChecksum(content);

      // Get stored integrity value
      const storedIntegrity = localStorage.getItem(this.SW_INTEGRITY_KEY);
      const storedVersion = localStorage.getItem(this.SW_VERSION_KEY);

      // If config provided, validate against it
      if (config) {
        if (config.integrity && currentChecksum !== config.integrity) {
          const error = 'Service worker integrity check failed';
          handleError(error, 'critical', 'system', {
            action: 'service_worker_integrity_mismatch',
          });

          // Unregister compromised service worker
          await this.unregisterCompromisedServiceWorker(registration);

          return {
            valid: false,
            error,
            timestamp: new Date(),
          };
        }

        // Store new integrity values
        localStorage.setItem(this.SW_INTEGRITY_KEY, currentChecksum);
        localStorage.setItem(this.SW_VERSION_KEY, config.version);
      } else if (storedIntegrity) {
        // Validate against stored integrity
        if (currentChecksum !== storedIntegrity) {
          const error = 'Service worker has been modified';
          handleError(error, 'critical', 'system', {
            action: 'service_worker_tampering_detected',
          });

          // Unregister compromised service worker
          await this.unregisterCompromisedServiceWorker(registration);

          return {
            valid: false,
            error,
            timestamp: new Date(),
          };
        }
      } else {
        // First time validation, store integrity
        localStorage.setItem(this.SW_INTEGRITY_KEY, currentChecksum);
      }

      // Check Content-Security-Policy header
      const csp = headers.get('Content-Security-Policy');
      if (!csp || !this.validateCSP(csp)) {
        console.warn('Service worker served without proper CSP headers');
      }

      // Store successful validation
      this.lastValidation = {
        valid: true,
        timestamp: new Date(),
      };

      return this.lastValidation;
    } catch (error) {
      const result: ValidationResult = {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };

      this.lastValidation = result;
      return result;
    }
  }

  /**
   * Validate Content-Security-Policy
   */
  private validateCSP(csp: string): boolean {
    const requiredDirectives = [
      'default-src',
      'script-src',
      'connect-src',
    ];

    return requiredDirectives.every(directive => csp.includes(directive));
  }

  /**
   * Unregister compromised service worker
   */
  private async unregisterCompromisedServiceWorker(registration: ServiceWorkerRegistration): Promise<void> {
    try {
      await registration.unregister();
      console.warn('Compromised service worker has been unregistered');

      // Clear stored integrity values
      localStorage.removeItem(this.SW_INTEGRITY_KEY);
      localStorage.removeItem(this.SW_VERSION_KEY);

      // Clear all caches
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));

      // Notify user
      this.notifyUserOfSecurityIssue();
    } catch (error) {
      handleError(error, 'critical', 'system', {
        action: 'unregister_service_worker_failed',
      });
    }
  }

  /**
   * Notify user of security issue
   */
  private notifyUserOfSecurityIssue(): void {
    // In production, integrate with your notification system
    console.error('SECURITY ALERT: Service worker integrity compromised. Please refresh the page.');

    // Force page reload after a delay
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  }

  /**
   * Register service worker with validation
   */
  async registerServiceWorker(url: string, config?: ServiceWorkerConfig): Promise<ServiceWorkerRegistration | null> {
    try {
      // Validate before registration
      if (config?.integrity) {
        const { content } = await this.fetchServiceWorkerScript(url);
        const checksum = await this.calculateChecksum(content);

        if (checksum !== config.integrity) {
          throw new Error('Service worker integrity validation failed before registration');
        }
      }

      // Register the service worker
      const registration = await navigator.serviceWorker.register(url, {
        scope: config?.scope || '/',
      });

      // Store integrity for future validations
      if (config?.integrity) {
        localStorage.setItem(this.SW_INTEGRITY_KEY, config.integrity);
        localStorage.setItem(this.SW_VERSION_KEY, config.version);
      }

      // Validate after registration
      await this.validateServiceWorker(config);

      console.info('Service worker registered and validated successfully');
      return registration;
    } catch (error) {
      handleError(error, 'high', 'system', {
        action: 'register_service_worker',
      });
      return null;
    }
  }

  /**
   * Check if service worker needs update
   */
  async checkForUpdates(config: ServiceWorkerConfig): Promise<boolean> {
    try {
      const storedVersion = localStorage.getItem(this.SW_VERSION_KEY);

      if (storedVersion !== config.version) {
        console.info(`Service worker update available: ${storedVersion} -> ${config.version}`);
        return true;
      }

      return false;
    } catch (error) {
      handleError(error, 'medium', 'system', {
        action: 'check_sw_updates',
      });
      return false;
    }
  }

  /**
   * Update service worker
   */
  async updateServiceWorker(config: ServiceWorkerConfig): Promise<boolean> {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return false;

      // Trigger update
      await registration.update();

      // Validate new version
      const validationResult = await this.validateServiceWorker(config);

      if (validationResult.valid) {
        console.info('Service worker updated successfully');
        return true;
      }

      return false;
    } catch (error) {
      handleError(error, 'high', 'system', {
        action: 'update_service_worker',
      });
      return false;
    }
  }

  /**
   * Get validation status
   */
  getValidationStatus(): ValidationResult | null {
    return this.lastValidation;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.validationTimer) {
      clearInterval(this.validationTimer);
      this.validationTimer = null;
    }
  }
}

export const serviceWorkerValidator = ServiceWorkerValidator.getInstance();

// Export convenience functions
export const validateServiceWorker = (config?: ServiceWorkerConfig) =>
  serviceWorkerValidator.validateServiceWorker(config);

export const registerServiceWorker = (url: string, config?: ServiceWorkerConfig) =>
  serviceWorkerValidator.registerServiceWorker(url, config);

export const checkForServiceWorkerUpdates = (config: ServiceWorkerConfig) =>
  serviceWorkerValidator.checkForUpdates(config);

export const updateServiceWorker = (config: ServiceWorkerConfig) =>
  serviceWorkerValidator.updateServiceWorker(config);

export const getServiceWorkerValidationStatus = () =>
  serviceWorkerValidator.getValidationStatus();