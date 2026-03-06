// Database retry utilities with exponential backoff
// Handles transient failures and timeouts

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  timeoutMs: 10000,
};

/**
 * Sleeps for the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // Common transient database errors
  const retryablePatterns = [
    'timeout',
    'econnrefused',
    'econnreset',
    'etimedout',
    'network',
    'socket hang up',
    'temporarily unavailable',
    'too many connections',
    'connection reset',
    'broken pipe',
  ];

  return retryablePatterns.some((pattern) => message.includes(pattern));
}

/**
 * Executes a database operation with exponential backoff retry
 * @param operation - Async function to execute
 * @param options - Retry configuration
 * @returns Result of the operation
 * @throws Error if all retries exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Execute with timeout
      return await withTimeout(operation(), opts.timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on final attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelayMs,
      );

      console.warn(
        `DB operation failed (attempt ${attempt + 1}/${opts.maxRetries + 1}): ${lastError.message}. Retrying in ${delay}ms...`,
      );

      await sleep(delay);
    }
  }

  // All retries exhausted
  throw new Error(
    `DB operation failed after ${opts.maxRetries + 1} attempts: ${lastError!.message}`,
  );
}

/**
 * Executes a database query with retry logic
 * Usage: await queryWithRetry(() => db.select().from(table))
 */
export async function queryWithRetry<T>(
  query: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  return withRetry(query, options);
}

/**
 * Executes a database transaction with retry logic
 * Usage: await transactionWithRetry(async (tx) => { ... })
 */
export async function transactionWithRetry<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: (tx: any) => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const { db } = await import('@/db');

  return withRetry(async () => {
    return await db.transaction(transaction);
  }, options);
}
