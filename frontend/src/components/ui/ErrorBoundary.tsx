import React, { Component, ErrorInfo, ReactNode } from 'react';
import CreativeErrorPage from './CreativeErrorPage';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Production-ready error boundary component
 * Catches JavaScript errors anywhere in the child component tree
 * and displays a fallback UI instead of the crashed component
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Store error info in state
    this.setState({ 
      error, 
      errorInfo 
    });
    
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('Error caught by boundary:', error, errorInfo);
    }

    // In production, you would log to an error reporting service
    // Example: Sentry.captureException(error, { extra: errorInfo });
    
    // You could also send to your analytics service
    // analytics.track('error', { error: error.message, stack: error.stack });
  }

  override render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // TEMPORARY: Show error details in both development and production
      // Remove this block and uncomment the production error page below when debugging is complete
      return (
        <div className="bg-red-50 border-2 border-red-500 rounded-lg p-6 m-4">
          <h2 className="text-red-700 font-bold text-xl mb-3">⚠️ Component Error</h2>
          <div className="bg-white rounded p-4 mb-3">
            <p className="text-red-600 font-mono text-sm">
              {this.state.error?.message || 'Unknown error'}
            </p>
          </div>
          <details className="cursor-pointer">
            <summary className="text-gray-700 font-semibold mb-2">View Stack Trace</summary>
            <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-64">
              {this.state.error?.stack}
            </pre>
            {this.state.errorInfo && (
              <div className="mt-3">
                <p className="text-gray-700 font-semibold mb-2">Component Stack:</p>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-64">
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}
          </details>
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-2">
              Environment: {import.meta.env.MODE} | 
              Build: {import.meta.env.PROD ? 'Production' : 'Development'}
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Reload Page
            </button>
            <button 
              onClick={() => this.setState({ hasError: false, error: undefined })} 
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Try Again
            </button>
          </div>
        </div>
      );

      // PRODUCTION ERROR PAGE - Currently disabled for debugging
      // Uncomment this block and remove the above when debugging is complete
      /*
      return (
        <CreativeErrorPage 
          variant="liquid-motion"
          errorCode="500"
          errorTitle="Application Error"
          errorMessage="Something unexpected happened. Please refresh the page or try again."
          onRefresh={() => window.location.reload()}
          showBackButton={false}
        />
      );
      */
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 