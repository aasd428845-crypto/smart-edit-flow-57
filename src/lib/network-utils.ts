/**
 * Network utilities — detect connectivity, retry with backoff
 */

export type NetworkStatus = 'online' | 'offline' | 'slow';

/** Check current network status */
export function getNetworkStatus(): NetworkStatus {
  if (!navigator.onLine) return 'offline';
  const conn = (navigator as any).connection;
  if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return 'slow';
  return 'online';
}

/** Subscribe to network changes */
export function onNetworkChange(cb: (status: NetworkStatus) => void): () => void {
  const handler = () => cb(getNetworkStatus());
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
  const conn = (navigator as any).connection;
  conn?.addEventListener?.('change', handler);
  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
    conn?.removeEventListener?.('change', handler);
  };
}

/** Retry a function with exponential backoff */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; onRetry?: (attempt: number, error: Error) => void } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, onRetry } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      if (!navigator.onLine) {
        // Wait for online before retrying
        await new Promise<void>((resolve) => {
          const handler = () => { window.removeEventListener('online', handler); resolve(); };
          window.addEventListener('online', handler);
        });
      }
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      onRetry?.(attempt + 1, err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Retry exhausted');
}
