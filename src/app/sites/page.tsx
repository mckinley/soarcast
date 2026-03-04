import { getSites, addSite, updateSite, deleteSite } from './actions';
import { SiteFormDialog } from '@/components/site-form-dialog';
import { SiteCard } from '@/components/site-card';
import { Button } from '@/components/ui/button';

export default async function SitesPage() {
  const sites = await getSites();

  // Wrapper functions that will be passed to client components
  const handleAdd = async (data: any) => {
    'use server';
    await addSite(data);
  };

  const handleUpdate = async (id: string, data: any) => {
    'use server';
    await updateSite(id, data);
  };

  const handleDelete = async (id: string) => {
    'use server';
    await deleteSite(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sites</h1>
          <p className="text-muted-foreground mt-2">
            Manage your flying sites to track weather conditions
          </p>
        </div>
        <SiteFormDialog onSubmit={handleAdd} />
      </div>

      {sites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg">
          <p className="text-lg font-medium mb-2">No sites configured yet</p>
          <p className="text-muted-foreground mb-4">
            Add your first flying site to start tracking conditions
          </p>
          <SiteFormDialog
            onSubmit={handleAdd}
            trigger={<Button>Add Your First Site</Button>}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
