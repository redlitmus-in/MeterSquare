/**
 * Request Deduplication Utility
 * Prevents duplicate concurrent API calls to the same endpoint
 */

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

class RequestDeduplicator {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private readonly TTL = 1000; // 1 second TTL for deduplication

  /**
   * Deduplicate requests to the same endpoint
   * If a request to the same endpoint is already pending, return the existing promise
   */
  deduplicate<T>(
    key: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    // Clean up old requests
    this.cleanupOldRequests();

    // Check if there's a pending request for this key
    const pending = this.pendingRequests.get(key);
    if (pending) {
      console.log(`[RequestDeduplicator] Returning cached promise for: ${key}`);
      return pending.promise as Promise<T>;
    }

    // Create new request
    console.log(`[RequestDeduplicator] Creating new request for: ${key}`);
    const promise = requestFn()
      .finally(() => {
        // Remove from pending after completion
        this.pendingRequests.delete(key);
      });

    // Store the pending request
    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now()
    });

    return promise;
  }

  /**
   * Clean up requests older than TTL
   */
  private cleanupOldRequests(): void {
    const now = Date.now();
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.TTL) {
        this.pendingRequests.delete(key);
      }
    }
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.pendingRequests.clear();
  }
}

// Create a singleton instance
export const requestDeduplicator = new RequestDeduplicator();