// Session provider is no longer needed with Better Auth.
// Better Auth manages sessions via httpOnly cookies automatically.
// Use authClient.useSession() from ~/app/lib/auth-client for client-side session access.
// This file is kept as a no-op wrapper during migration.

export function SessionProvider({ children }: { children: React.ReactNode; session?: unknown }) {
  return <>{children}</>;
}
