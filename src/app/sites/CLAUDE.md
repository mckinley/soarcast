# Sites Module

## Server Actions Pattern

This module uses Next.js 15 Server Actions for data mutations:

1. **actions.ts** - Contains the core CRUD operations (getSites, addSite, updateSite, deleteSite)
   - All functions are marked with 'use server' at the file level
   - Uses `revalidatePath('/sites')` after mutations to refresh the UI
   - Mutations use `updateJSON` from storage.ts for safe read-modify-write operations

2. **page.tsx** - Server Component that calls server actions
   - Wraps action functions with inline 'use server' functions when passing to client components
   - This pattern is required because client components can't directly import server action modules

3. **Client Components** - Accept server actions as props
   - SiteFormDialog receives an onSubmit function that's a wrapped server action
   - SiteCard receives onUpdate and onDelete functions

## Form Validation

- Client-side validation in SiteFormDialog provides immediate feedback
- Wind directions: comma-separated input (e.g., "180, 225, 270") converted to number array
- Coordinates: latitude -90 to 90, longitude -180 to 180
- All numeric fields validated for proper ranges

## Data Flow

1. User interacts with form → Client component
2. Client component calls server action (passed as prop)
3. Server action mutates data/sites.json via storage utilities
4. revalidatePath() invalidates cache
5. Next.js re-renders with fresh data automatically
