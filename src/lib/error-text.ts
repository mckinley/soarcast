/**
 * An error as one piece of text: name, message, stack and cause. Workers Logs
 * keeps an Error argument's stack frames but drops its first line, so
 * `console.error('X failed:', error)` reached the logs as "X failed:
 * at worker.js:1:2", without the reason.
 */
export function errorText(error: Error): string {
  const head = `${error.name}: ${error.message}`;
  const stack = error.stack ?? '';
  const text = stack.startsWith(head) ? stack : [head, stack].filter(Boolean).join('\n');
  const cause = error.cause;
  if (cause === undefined) return text;
  return `${text}\nCaused by: ${cause instanceof Error ? errorText(cause) : String(cause)}`;
}

/** Make console.error and console.warn log Error arguments as errorText. Call once per Worker. */
export function logErrorsAsText(): void {
  for (const level of ['error', 'warn'] as const) {
    const write = console[level].bind(console);
    console[level] = (...args: unknown[]) =>
      write(...args.map((arg) => (arg instanceof Error ? errorText(arg) : arg)));
  }
}
