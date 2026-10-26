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
        <h1 className="text-[28px] leading-tight font-bold tracking-tight md:text-4xl">Guide</h1>
        <p className="mt-1.5 text-muted-foreground">
          How SoarCast works and where its data comes from.
        </p>
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {pages.map((page) => (
          <li key={page.slug}>
            <Link
              to={`/guide/${page.slug}`}
              className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-accent sm:px-5"
            >
              <div className="flex-1">
                <div className="font-semibold">{page.title}</div>
                <p className="mt-0.5 text-sm text-muted-foreground">{page.summary}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
