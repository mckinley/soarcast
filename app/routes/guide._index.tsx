import { Link, useLoaderData } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { guidePages } from '~/app/lib/guide.server';

export function meta() {
  return [
    { title: 'Guide | SoarCast' },
    { name: 'description', content: 'How SoarCast works and where its data comes from.' },
  ];
}

export function loader() {
  return { pages: guidePages() };
}

export default function GuideIndex() {
  const { pages } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Guide</h1>
        <p className="mt-1 text-muted-foreground">
          How SoarCast works and where its data comes from.
        </p>
      </div>
      <ul className="divide-y rounded-md border">
        {pages.map((page) => (
          <li key={page.slug}>
            <Link
              to={`/guide/${page.slug}`}
              className="flex items-center gap-3 p-4 transition-colors hover:bg-accent"
            >
              <div className="flex-1">
                <div className="font-medium">{page.title}</div>
                <p className="text-sm text-muted-foreground">{page.summary}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
