// A value stored as gzipped JSON in a TEXT column, base64-encoded. D1 hands
// BLOB columns back as arrays of numbers, so text is the compact way to keep
// bytes there. A week's forecast for one place is about 450 KB as JSON and
// about 120 KB this way.

const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The value as gzipped JSON, base64-encoded. */
export async function gzipJson(value: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(value)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/** The value gzipJson stored. */
export async function gunzipJson<T>(text: string): Promise<T> {
  const stream = new Blob([fromBase64(text)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as T;
}
