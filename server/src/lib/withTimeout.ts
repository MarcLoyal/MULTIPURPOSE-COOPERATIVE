/**
 * A hung DB connection (bad pooler host/port, network ACL, etc.) otherwise
 * blocks until something external kills it — the OS's TCP timeout, or
 * Vercel's function execution limit — which looks like "never responds"
 * rather than a clear error. Wrap any connection-dependent call that
 * should fail fast instead.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      promise.finally(() => clearTimeout(timer));
    }),
  ]);
}
