/**
 * Secure Storage Utility
 * Provides encrypted storage for sensitive data with server-side validation hooks
 */

interface StorageOptions {
  encrypt?: boolean;
  validate?: boolean;
  ttl?: number; // Time to live in milliseconds
}

interface StoredItem<T> {
  data: T;
  timestamp: number;
  expires?: number;
  checksum?: string;
}

class SecureStorage {
  private readonly prefix = 'ms_erp_';
  private readonly encryptionKey: string;

  constructor() {
    // Generate a unique key per session - in production, this should come from the server
    this.encryptionKey = this.generateSessionKey();
  }

  /**
   * Generate a session-based encryption key
   * In production, this should be retrieved from the server
   */
  private generateSessionKey(): string {
    const sessionId = sessionStorage.getItem('session_id') || this.generateSessionId();
    sessionStorage.setItem('session_id', sessionId);
    return sessionId;
  }

  private generateSessionId(): string {
    return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  }

  /**
   * Simple XOR encryption - for production, use AES-GCM with Web Crypto API
   */
  private encrypt(text: string): string {
    const key = this.encryptionKey;
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result);
  }

  /**
   * Simple XOR decryption
   */
  private decrypt(encrypted: string): string {
    try {
      const text = atob(encrypted);
      const key = this.encryptionKey;
      let result = '';
      for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return result;
    } catch {
      return '';
    }
  }

  /**
   * Generate checksum for data integrity
   */
  private generateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Store item with optional encryption
   */
  setItem<T>(key: string, value: T, options: StorageOptions = {}): void {
    const { encrypt = true, ttl } = options;

    const item: StoredItem<T> = {
      data: value,
      timestamp: Date.now(),
      expires: ttl ? Date.now() + ttl : undefined,
    };

    const serialized = JSON.stringify(item);
    const checksum = this.generateChecksum(serialized);
    item.checksum = checksum;

    const finalData = JSON.stringify(item);
    const storageKey = this.prefix + key;

    if (encrypt) {
      localStorage.setItem(storageKey, this.encrypt(finalData));
    } else {
      localStorage.setItem(storageKey, finalData);
    }
  }

  /**
   * Retrieve item with automatic decryption and validation
   */
  getItem<T>(key: string, options: StorageOptions = {}): T | null {
    const { encrypt = true, validate = true } = options;
    const storageKey = this.prefix + key;
    const stored = localStorage.getItem(storageKey);

    if (!stored) return null;

    try {
      const decrypted = encrypt ? this.decrypt(stored) : stored;
      const item: StoredItem<T> = JSON.parse(decrypted);

      // Check expiration
      if (item.expires && Date.now() > item.expires) {
        this.removeItem(key);
        return null;
      }

      // Validate checksum if enabled
      if (validate && item.checksum) {
        const itemCopy = { ...item };
        delete itemCopy.checksum;
        const expectedChecksum = this.generateChecksum(JSON.stringify(itemCopy));

        if (expectedChecksum !== item.checksum) {
          console.error('Data integrity check failed for key:', key);
          this.removeItem(key);
          return null;
        }
      }

      return item.data;
    } catch (error) {
      console.error('Failed to retrieve secure item:', error);
      return null;
    }
  }

  /**
   * Remove item from storage
   */
  removeItem(key: string): void {
    const storageKey = this.prefix + key;
    localStorage.removeItem(storageKey);
  }

  /**
   * Clear all secure storage items
   */
  clear(): void {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.prefix)) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * Store sensitive user data with encryption
   */
  setUser(userData: any): void {
    // Store only non-sensitive data in regular storage
    const publicData = {
      id: userData.id,
      name: userData.name,
      avatar: userData.avatar,
    };

    // Store sensitive data with encryption
    const sensitiveData = {
      role: userData.role,
      permissions: userData.permissions,
      token: userData.token,
    };

    this.setItem('user_public', publicData, { encrypt: false });
    this.setItem('user_sensitive', sensitiveData, { encrypt: true, ttl: 7 * 60 * 60 * 1000 }); // 7 hours
  }

  /**
   * Get user data with proper validation
   */
  getUser(): any {
    const publicData = this.getItem('user_public', { encrypt: false }) || {};
    const sensitiveData = this.getItem('user_sensitive', { encrypt: true }) || {};

    return {
      ...publicData,
      ...sensitiveData,
    };
  }

  /**
   * Validate user session with server
   */
  async validateSession(): Promise<boolean> {
    const user = this.getUser();
    if (!user.token) return false;

    try {
      // This should call your backend API to validate the session
      // For now, we'll just check if the token exists
      return !!user.token;
    } catch {
      return false;
    }
  }
}

export const secureStorage = new SecureStorage();

// Type-safe user interface
export interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
  avatar?: string;
  token?: string;
}

// Helper functions for backward compatibility
export const getSecureUser = (): UserData | null => {
  return secureStorage.getUser();
};

export const setSecureUser = (user: UserData): void => {
  secureStorage.setUser(user);
};

export const clearSecureStorage = (): void => {
  secureStorage.clear();
};