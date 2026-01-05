/**
 * Centralized Error Handling Utility
 * Provides consistent error handling, logging, and reporting
 */

import { ApiError } from '@/types';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorCategory = 'network' | 'validation' | 'auth' | 'permission' | 'system' | 'unknown';

interface ErrorContext {
  userId?: string;
  sessionId?: string;
  action?: string;
  component?: string;
  timestamp: Date;
  userAgent: string;
  url: string;
}

interface ErrorReport {
  id: string;
  message: string;
  stack?: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  context: ErrorContext;
  handled: boolean;
  reported: boolean;
}

class ErrorHandler {
  private static instance: ErrorHandler;
  private errorQueue: ErrorReport[] = [];
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly BATCH_INTERVAL = 30000; // 30 seconds
  private batchTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.setupGlobalHandlers();
    this.startBatchReporting();
  }

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalHandlers(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event.reason, 'high', 'system', {
        action: 'unhandled_promise_rejection',
      });
      event.preventDefault();
    });

    // Handle general errors
    window.addEventListener('error', (event) => {
      this.handleError(event.error || event.message, 'high', 'system', {
        action: 'global_error',
        component: event.filename,
      });
      event.preventDefault();
    });
  }

  /**
   * Start batch reporting of errors
   */
  private startBatchReporting(): void {
    this.batchTimer = setInterval(() => {
      if (this.errorQueue.length > 0) {
        this.flushErrors();
      }
    }, this.BATCH_INTERVAL);
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get error context
   */
  private getErrorContext(additionalContext?: Partial<ErrorContext>): ErrorContext {
    return {
      timestamp: new Date(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: sessionStorage.getItem('session_id') || undefined,
      ...additionalContext,
    };
  }

  /**
   * Categorize error based on its type and message
   */
  private categorizeError(error: Error | string): ErrorCategory {
    const errorMessage = typeof error === 'string' ? error : error.message;

    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return 'network';
    }
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return 'validation';
    }
    if (errorMessage.includes('auth') || errorMessage.includes('unauthorized')) {
      return 'auth';
    }
    if (errorMessage.includes('permission') || errorMessage.includes('forbidden')) {
      return 'permission';
    }
    if (errorMessage.includes('system') || errorMessage.includes('internal')) {
      return 'system';
    }

    return 'unknown';
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: Error | string, category: ErrorCategory): ErrorSeverity {
    // Auth and permission errors are always high severity
    if (category === 'auth' || category === 'permission') {
      return 'high';
    }

    // Network errors are medium severity
    if (category === 'network') {
      return 'medium';
    }

    // Validation errors are low severity
    if (category === 'validation') {
      return 'low';
    }

    // Check for specific error patterns
    const errorMessage = typeof error === 'string' ? error : error.message;
    if (errorMessage.includes('critical') || errorMessage.includes('fatal')) {
      return 'critical';
    }

    return 'medium';
  }

  /**
   * Handle error with proper logging and reporting
   */
  handleError(
    error: Error | string | unknown,
    severity?: ErrorSeverity,
    category?: ErrorCategory,
    context?: Partial<ErrorContext>
  ): void {
    try {
      // Convert to Error object if needed
      const errorObj = error instanceof Error ? error : new Error(String(error));

      // Auto-categorize if not provided
      const errorCategory = category || this.categorizeError(errorObj);
      const errorSeverity = severity || this.determineSeverity(errorObj, errorCategory);

      const report: ErrorReport = {
        id: this.generateErrorId(),
        message: errorObj.message,
        stack: errorObj.stack,
        severity: errorSeverity,
        category: errorCategory,
        context: this.getErrorContext(context),
        handled: true,
        reported: false,
      };

      // Log to console based on severity
      this.logError(report);

      // Add to queue for batch reporting
      this.queueError(report);

      // Notify user for critical errors
      if (errorSeverity === 'critical') {
        this.notifyUser(report);
      }
    } catch (handlerError) {
      // Fallback logging if error handler itself fails
      console.error('Error handler failed:', handlerError);
      console.error('Original error:', error);
    }
  }

  /**
   * Log error to console
   */
  private logError(report: ErrorReport): void {
    const logStyle = this.getLogStyle(report.severity);

    console.group(`%c[${report.severity.toUpperCase()}] ${report.category}`, logStyle);
    console.error('Message:', report.message);
    console.error('Context:', report.context);
    if (report.stack) {
      console.error('Stack:', report.stack);
    }
    console.groupEnd();
  }

  /**
   * Get console log style based on severity
   */
  private getLogStyle(severity: ErrorSeverity): string {
    switch (severity) {
      case 'critical':
        return 'color: white; background: red; padding: 2px 5px; font-weight: bold;';
      case 'high':
        return 'color: white; background: orange; padding: 2px 5px; font-weight: bold;';
      case 'medium':
        return 'color: black; background: yellow; padding: 2px 5px;';
      case 'low':
        return 'color: white; background: blue; padding: 2px 5px;';
      default:
        return '';
    }
  }

  /**
   * Queue error for batch reporting
   */
  private queueError(report: ErrorReport): void {
    this.errorQueue.push(report);

    // Maintain queue size limit
    if (this.errorQueue.length > this.MAX_QUEUE_SIZE) {
      this.errorQueue.shift();
    }

    // Flush immediately for critical errors
    if (report.severity === 'critical') {
      this.flushErrors();
    }
  }

  /**
   * Flush error queue to server
   */
  private async flushErrors(): Promise<void> {
    if (this.errorQueue.length === 0) return;

    const errors = [...this.errorQueue];
    this.errorQueue = [];

    try {
      // In production, send to your error reporting service
      // await apiClient.post('/errors/batch', { errors });

      // For now, just log that we would report these
      console.info(`Would report ${errors.length} errors to server`);

      // Mark as reported
      errors.forEach(err => err.reported = true);
    } catch (reportError) {
      console.error('Failed to report errors:', reportError);
      // Re-queue failed errors
      this.errorQueue.unshift(...errors);
    }
  }

  /**
   * Notify user about critical errors
   */
  private notifyUser(report: ErrorReport): void {
    // In production, use your notification system
    console.warn('Critical error notification:', report.message);

    // You could integrate with your notification store here
    // notificationStore.addNotification({
    //   type: 'error',
    //   title: 'System Error',
    //   message: 'A critical error occurred. Please refresh the page or contact support.',
    // });
  }

  /**
   * Handle API errors specifically
   */
  handleApiError(error: ApiError, context?: Partial<ErrorContext>): void {
    const severity = error.code.startsWith('5') ? 'high' : 'medium';
    const category = error.code === '401' ? 'auth' : error.code === '403' ? 'permission' : 'network';

    this.handleError(
      error.message,
      severity,
      category,
      {
        ...context,
        action: `api_${error.code}`,
      }
    );
  }

  /**
   * Handle validation errors
   */
  handleValidationError(field: string, message: string, context?: Partial<ErrorContext>): void {
    this.handleError(
      `Validation failed for ${field}: ${message}`,
      'low',
      'validation',
      context
    );
  }

  /**
   * Handle network errors
   */
  handleNetworkError(url: string, error: Error, context?: Partial<ErrorContext>): void {
    this.handleError(
      `Network request failed for ${url}: ${error.message}`,
      'medium',
      'network',
      {
        ...context,
        action: `network_request_${url}`,
      }
    );
  }

  /**
   * Create error boundary handler
   */
  createErrorBoundaryHandler(componentName: string) {
    return (error: Error, errorInfo: React.ErrorInfo) => {
      this.handleError(error, 'high', 'system', {
        component: componentName,
        action: 'react_error_boundary',
        ...errorInfo,
      });
    };
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    bySeverity: Record<ErrorSeverity, number>;
    byCategory: Record<ErrorCategory, number>;
  } {
    const stats = {
      total: this.errorQueue.length,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      byCategory: { network: 0, validation: 0, auth: 0, permission: 0, system: 0, unknown: 0 },
    };

    this.errorQueue.forEach(error => {
      stats.bySeverity[error.severity]++;
      stats.byCategory[error.category]++;
    });

    return stats;
  }

  /**
   * Clear error queue
   */
  clearErrors(): void {
    this.errorQueue = [];
  }

  /**
   * Cleanup on unmount
   */
  cleanup(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    this.flushErrors();
  }
}

export const errorHandler = ErrorHandler.getInstance();

// Export convenience functions
export const handleError = (
  error: Error | string | unknown,
  severity?: ErrorSeverity,
  category?: ErrorCategory,
  context?: Partial<ErrorContext>
) => errorHandler.handleError(error, severity, category, context);

export const handleApiError = (error: ApiError, context?: Partial<ErrorContext>) =>
  errorHandler.handleApiError(error, context);

export const handleValidationError = (field: string, message: string, context?: Partial<ErrorContext>) =>
  errorHandler.handleValidationError(field, message, context);

export const handleNetworkError = (url: string, error: Error, context?: Partial<ErrorContext>) =>
  errorHandler.handleNetworkError(url, error, context);

export const createErrorBoundaryHandler = (componentName: string) =>
  errorHandler.createErrorBoundaryHandler(componentName);