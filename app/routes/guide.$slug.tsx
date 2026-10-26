import type { MouseEvent } from 'react';
import { Link, useLoaderData, useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import type { Route } from './+types/guide.$slug';
import { guidePage } from '~/app/lib/guide.server';

export function meta({ data }: Route.MetaArgs) {
  if (!data?.page) return [{ title: 'Guide | SoarCast' }];
  return [
    { title: `${data.page.title} | SoarCast` },
    { name: 'description', content: data.page.summary },
  ];
}

export function loader({ params }: Route.LoaderArgs) {
  const page = guidePage(params.slug);
  if (!page) throw new Response('Not found', { status: 404 });
  return { page };
}

export default function GuidePageRoute() {
  const { page } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  // The page is rendered Markdown: its links within SoarCast move like any
  // other link in the app instead of reloading the page.
  const followLink = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest('a');
    const href = link?.getAttribute('href');
    if (!href?.startsWith('/') || link?.target) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(href);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/guide"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Guide
      </Link>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight md:text-4xl">
        {page.title}
      </h1>
      <div
        className="prose prose-neutral max-w-none dark:prose-invert prose-a:underline-offset-2 prose-headings:scroll-mt-20 prose-headings:tracking-tight prose-table:my-0 prose-th:align-bottom [&_td:first-child]:font-medium [&_td:first-child]:text-foreground [&_td:first-child]:min-w-24"
        onClick={followLink}
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
    </div>
  );
}
