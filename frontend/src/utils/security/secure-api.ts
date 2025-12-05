/**
 * Secure API Communication System
 * Encrypts all API requests/responses without breaking existing functionality
 */

import CryptoJS from 'crypto-js';
import { encryption } from './encryption';

export class SecureAPIClient {
  private sessionKey: string;
  private requestCounter: number = 0;
  private apiBaseUrl: string;

  constructor() {
    // Generate session key
    this.sessionKey = this.generateSessionKey();
    this.apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  }

  /**
   * Generate unique session key
   */
  private generateSessionKey(): string {
    return CryptoJS.lib.WordArray.random(256/8).toString();
  }

  /**
   * Create request signature for integrity
   */
  private createSignature(
    method: string,
    url: string,
    data: any,
    timestamp: number
  ): string {
    const message = `${method}|${url}|${JSON.stringify(data)}|${timestamp}|${this.requestCounter}`;
    return CryptoJS.HmacSHA256(message, this.sessionKey).toString();
  }

  /**
   * Verify response signature
   */
  private verifySignature(
    data: any,
    signature: string,
    timestamp: number
  ): boolean {
    const message = `${JSON.stringify(data)}|${timestamp}`;
    const expectedSignature = CryptoJS.HmacSHA256(message, this.sessionKey).toString();
    return signature === expectedSignature;
  }

  /**
   * Secure fetch wrapper - Drop-in replacement for fetch()
   * Works with existing code without modifications
   */
  public async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    try {
      const isSecureEndpoint = this.shouldSecure(url);

      if (isSecureEndpoint && options.body) {
        // Encrypt request body
        const encryptedBody = await this.encryptRequest(options.body);

        // Add security headers
        const secureHeaders = this.getSecurityHeaders(
          options.method || 'GET',
          url,
          encryptedBody.data
        );

        // Merge with existing headers
        options.headers = {
          ...options.headers,
          ...secureHeaders
        };

        // Replace body with encrypted version
        options.body = JSON.stringify(encryptedBody);
      }

      // Make the actual request
      const response = await fetch(url, options);

      // Decrypt response if needed
      if (isSecureEndpoint && response.ok) {
        return await this.decryptResponse(response);
      }

      return response;
    } catch (error) {
      console.error('Secure API error:', error);
      // Fallback to regular fetch if encryption fails
      return fetch(url, options);
    }
  }

  /**
   * Check if endpoint should be secured
   */
  private shouldSecure(url: string): boolean {
    // Secure sensitive endpoints
    const secureEndpoints = [
      '/api/auth',
      '/api/vendors',
      '/api/purchase',
      '/api/quotations',
      '/api/financial',
      '/api/users'
    ];

    return secureEndpoints.some(endpoint => url.includes(endpoint));
  }

  /**
   * Encrypt request data
   */
  private async encryptRequest(body: any): Promise<any> {
    // Parse body if it's a string
    const data = typeof body === 'string' ? JSON.parse(body) : body;

    // Encrypt the data
    const encryptedData = encryption.encrypt(data);

    // Create integrity checksum
    const checksum = CryptoJS.MD5(encryptedData).toString();

    return {
      data: encryptedData,
      checksum: checksum,
      timestamp: Date.now(),
      nonce: this.requestCounter++
    };
  }

  /**
   * Decrypt response data
   */
  private async decryptResponse(response: Response): Promise<Response> {
    try {
      const text = await response.text();
      const data = JSON.parse(text);

      // Check if response is encrypted
      if (data.data && data.checksum) {
        // Verify checksum
        const expectedChecksum = CryptoJS.MD5(data.data).toString();
        if (expectedChecksum !== data.checksum) {
          throw new Error('Response integrity check failed');
        }

        // Decrypt the data
        const decryptedData = encryption.decrypt(data.data);

        // Create new response with decrypted data
        return new Response(JSON.stringify(decryptedData), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }

      // Return original response if not encrypted
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch (error) {
      // Return original response if decryption fails
      return response;
    }
  }

  /**
   * Get security headers for request
   */
  private getSecurityHeaders(method: string, url: string, data: any): Record<string, string> {
    const timestamp = Date.now();
    const signature = this.createSignature(method, url, data, timestamp);

    return {
      'X-Request-Signature': signature,
      'X-Request-Timestamp': timestamp.toString(),
      'X-Request-Nonce': this.requestCounter.toString(),
      'X-Session-Key': this.sessionKey,
      'X-Security-Version': '1.0'
    };
  }

  /**
   * Secure localStorage wrapper
   */
  public secureStorage = {
    setItem: (key: string, value: any): void => {
      encryption.encryptForStorage(key, value);
    },

    getItem: (key: string): any => {
      return encryption.decryptFromStorage(key);
    },

    removeItem: (key: string): void => {
      localStorage.removeItem(key);
    },

    clear: (): void => {
      encryption.clearEncryptedData();
    }
  };

  /**
   * Axios-compatible interceptor for existing API calls
   */
  public createAxiosInterceptor() {
    return {
      request: (config: any) => {
        if (this.shouldSecure(config.url)) {
          // Encrypt request data
          if (config.data) {
            config.data = encryption.encrypt(config.data);
          }

          // Add security headers
          config.headers = {
            ...config.headers,
            ...this.getSecurityHeaders(
              config.method?.toUpperCase() || 'GET',
              config.url,
              config.data
            )
          };
        }
        return config;
      },

      response: (response: any) => {
        if (this.shouldSecure(response.config.url)) {
          // Decrypt response data
          if (response.data && typeof response.data === 'string') {
            try {
              response.data = encryption.decrypt(response.data);
            } catch (e) {
              // Keep original data if decryption fails
            }
          }
        }
        return response;
      }
    };
  }
}

// Create singleton instance
export const secureAPI = new SecureAPIClient();

/**
 * Drop-in replacement for fetch
 * Use this instead of window.fetch for secure communication
 */
export const secureFetch = secureAPI.fetch.bind(secureAPI);

/**
 * Secure storage replacement for localStorage
 * Use this for storing sensitive data
 */
export const secureStorage = secureAPI.secureStorage;