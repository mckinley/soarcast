import { createAuthClient } from 'better-auth/react';

// Better Auth client — used only in client-side components.
// Uses relative URL so it works with any domain.
export const authClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/auth`
      : 'https://soarcast.mckinleydigital.com/api/auth',
});
