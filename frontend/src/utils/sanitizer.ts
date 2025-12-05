/**
 * Input Sanitization Utility
 * Provides XSS protection for user-generated content
 */

import DOMPurify from 'dompurify';

interface SanitizeOptions {
  allowedTags?: string[];
  allowedAttributes?: string[];
  stripDangerous?: boolean;
}

class Sanitizer {
  private readonly defaultConfig = {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  };

  /**
   * Sanitize HTML content
   */
  sanitizeHTML(html: string, options?: SanitizeOptions): string {
    const config = {
      ...this.defaultConfig,
      ...(options?.allowedTags && { ALLOWED_TAGS: options.allowedTags }),
      ...(options?.allowedAttributes && { ALLOWED_ATTR: options.allowedAttributes }),
    };

    if (options?.stripDangerous) {
      return DOMPurify.sanitize(html, { ...config, FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'] });
    }

    return DOMPurify.sanitize(html, config);
  }

  /**
   * Sanitize plain text (removes all HTML)
   */
  sanitizeText(text: string): string {
    return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }

  /**
   * Sanitize notification content
   */
  sanitizeNotification(notification: any): any {
    return {
      ...notification,
      title: this.sanitizeText(notification.title || ''),
      message: this.sanitizeHTML(notification.message || '', { stripDangerous: true }),
      ...(notification.metadata && {
        metadata: this.sanitizeMetadata(notification.metadata)
      }),
    };
  }

  /**
   * Sanitize metadata recursively
   */
  private sanitizeMetadata(metadata: any): any {
    if (typeof metadata === 'string') {
      return this.sanitizeText(metadata);
    }

    if (Array.isArray(metadata)) {
      return metadata.map(item => this.sanitizeMetadata(item));
    }

    if (typeof metadata === 'object' && metadata !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(metadata)) {
        // Sanitize the key as well
        const sanitizedKey = this.sanitizeText(key);
        sanitized[sanitizedKey] = this.sanitizeMetadata(value);
      }
      return sanitized;
    }

    return metadata;
  }

  /**
   * Sanitize URL to prevent javascript: and data: protocols
   */
  sanitizeURL(url: string): string {
    const sanitized = this.sanitizeText(url);

    // Check for dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
    const lowerUrl = sanitized.toLowerCase().trim();

    for (const protocol of dangerousProtocols) {
      if (lowerUrl.startsWith(protocol)) {
        return '#';
      }
    }

    // Ensure URL is properly encoded
    try {
      const urlObj = new URL(sanitized, window.location.origin);
      // Only allow http(s) and relative URLs
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return '#';
      }
      return urlObj.toString();
    } catch {
      // If it's not a valid URL, treat it as a relative path
      if (sanitized.startsWith('/') || sanitized.startsWith('#')) {
        return sanitized;
      }
      return '#';
    }
  }

  /**
   * Sanitize form data before submission
   */
  sanitizeFormData(data: any): any {
    if (typeof data === 'string') {
      return this.sanitizeText(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeFormData(item));
    }

    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitizeFormData(value);
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Escape special characters for display in HTML
   */
  escapeHTML(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Validate and sanitize email
   */
  sanitizeEmail(email: string): string {
    const sanitized = this.sanitizeText(email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailRegex.test(sanitized)) {
      return sanitized.toLowerCase();
    }

    return '';
  }

  /**
   * Sanitize file names
   */
  sanitizeFileName(fileName: string): string {
    const sanitized = this.sanitizeText(fileName);
    // Remove any path traversal attempts
    return sanitized
      .replace(/\.\./g, '')
      .replace(/[\/\\]/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  /**
   * Sanitize document title
   */
  sanitizeDocumentTitle(title: string): string {
    const sanitized = this.sanitizeText(title);
    // Remove any characters that might cause issues in document title
    return sanitized.replace(/[<>]/g, '').substring(0, 100);
  }
}

export const sanitizer = new Sanitizer();

// Export commonly used functions
export const sanitizeHTML = (html: string, options?: SanitizeOptions) =>
  sanitizer.sanitizeHTML(html, options);

export const sanitizeText = (text: string) =>
  sanitizer.sanitizeText(text);

export const sanitizeNotification = (notification: any) =>
  sanitizer.sanitizeNotification(notification);

export const sanitizeURL = (url: string) =>
  sanitizer.sanitizeURL(url);

export const sanitizeFormData = (data: any) =>
  sanitizer.sanitizeFormData(data);

export const escapeHTML = (text: string) =>
  sanitizer.escapeHTML(text);

export const sanitizeEmail = (email: string) =>
  sanitizer.sanitizeEmail(email);

export const sanitizeFileName = (fileName: string) =>
  sanitizer.sanitizeFileName(fileName);

export const sanitizeDocumentTitle = (title: string) =>
  sanitizer.sanitizeDocumentTitle(title);