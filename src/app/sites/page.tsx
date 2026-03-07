import { redirect } from 'next/navigation';

/**
 * Legacy "My Sites" page - now redirects to dashboard
 * The dashboard shows all sites (both favorited launch sites and custom sites) in a unified view
 */
export default function SitesPage() {
  redirect('/');
}
