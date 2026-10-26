// Types for secrets.mjs, so TypeScript scripts can import it.
// From the pjmgmt env-vars standard (scripts/automations/templates/secrets.d.mts).
export function parseDotenv(text: string): Record<string, string>
export function fileValues(root?: string): Record<string, string>
export function lookup(
  name: string,
  env?: Record<string, string | undefined>,
  files?: Record<string, string>
): { value: string; source: 'environment' | 'local file' } | null
export function secret(name: string): string | null
export function requireSecret(name: string): string
