// fetch with retries on dropped connections, and errors in one line, for
// the jobs that read many files (the season build, the flown-day check).

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch, tried again a few times when the connection fails (not on an HTTP error). */
export async function fetchRetrying(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (attempt >= 3) throw error;
      await sleep(3000 * 2 ** attempt);
    }
  }
}

/** An error in a line, with the network cause fetch hides behind "fetch failed". */
export function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  return cause ? `${error.message} (${cause.code ?? cause.message})` : error.message;
}
