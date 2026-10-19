import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Link,
  Hr,
} from '@react-email/components';
import { digestTitle } from '@/lib/notifications';
import type { DayStatus as DigestStatus } from '@/lib/verdict-display';

export interface SiteDigestItem {
  name: string;
  /** The site's page: a path on SoarCast, or a full URL */
  url?: string;
  /** go: a go for the pilot's goal at the site; flyable: safe to launch, less than the goal */
  status: DigestStatus;
  /** "Go: thermals 12:00-16:00", "Flyable: sled ride 10:00-17:00", "Not flyable" */
  headline: string;
  /** The lift on a flyable day, what stops it otherwise */
  detail?: string | null;
  concern?: string | null;
}

interface MorningDigestEmailProps {
  date: string; // e.g. "Monday, March 8, 2026"
  sites: SiteDigestItem[];
  appUrl?: string;
}

export const APP_URL = 'https://soarcast.mckinleyaviation.com';

const STATUS_COLOR: Record<DigestStatus, string> = {
  go: '#15803d',
  flyable: '#4d7c0f',
  marginal: '#b45309',
  no: '#64748b',
};
const STATUS_ORDER: Record<DigestStatus, number> = { go: 0, flyable: 1, marginal: 2, no: 3 };

/** The digest's one-line answer, also its subject: "Go today at Tiger Mountain". */
export function digestHeadline(sites: SiteDigestItem[]): string {
  return digestTitle(sites);
}

export function MorningDigestEmail({ date, sites, appUrl = APP_URL }: MorningDigestEmailProps) {
  const ordered = [...sites].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return (
    <Html>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Body style={{ backgroundColor: '#f8fafc', fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <Container
          style={{
            width: '100%',
            maxWidth: '480px',
            margin: '16px auto',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <Section style={{ backgroundColor: '#0ea5e9', padding: '20px 24px' }}>
            <Heading style={{ color: '#ffffff', margin: 0, fontSize: '20px', fontWeight: '700' }}>
              {digestHeadline(sites)}
            </Heading>
            <Text style={{ color: 'rgba(255,255,255,0.85)', margin: '4px 0 0', fontSize: '14px' }}>
              SoarCast · {date}
            </Text>
          </Section>

          <Section style={{ padding: '16px 24px' }}>
            {ordered.length === 0 ? (
              <Text style={{ color: '#6b7280', fontSize: '14px' }}>
                No flying sites yet. Visit SoarCast to add your sites.
              </Text>
            ) : (
              ordered.map((site, i) => (
                <Section
                  key={i}
                  style={{
                    padding: '10px 0',
                    borderBottom: i < ordered.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}
                >
                  <Text style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>
                    {site.url ? (
                      <Link
                        href={site.url.startsWith('/') ? `${appUrl}${site.url}` : site.url}
                        style={{ color: '#111827', textDecoration: 'none' }}
                      >
                        {site.name}
                      </Link>
                    ) : (
                      site.name
                    )}
                  </Text>
                  <Text
                    style={{
                      margin: '2px 0 0',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: STATUS_COLOR[site.status],
                    }}
                  >
                    {site.headline}
                  </Text>
                  {site.detail && (
                    <Text style={{ margin: '2px 0 0', color: '#6b7280', fontSize: '13px' }}>
                      {site.detail}
                    </Text>
                  )}
                  {site.concern && (
                    <Text style={{ margin: '2px 0 0', color: '#c2410c', fontSize: '13px' }}>
                      Watch for: {site.concern}
                    </Text>
                  )}
                </Section>
              ))
            )}
            <Text style={{ margin: '12px 0 0', color: '#9ca3af', fontSize: '12px' }}>
              A go is a flyable day with the flying you said each site is worth going for.
            </Text>
          </Section>

          <Hr style={{ borderColor: '#e5e7eb', margin: 0 }} />

          <Section style={{ padding: '20px 24px', textAlign: 'center' }}>
            <Link
              href={`${appUrl}/dashboard`}
              style={{
                backgroundColor: '#0ea5e9',
                color: '#ffffff',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: '600',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              See your week →
            </Link>
          </Section>

          <Section
            style={{ backgroundColor: '#f8fafc', padding: '16px 24px', textAlign: 'center' }}
          >
            <Text style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>
              Weather data by{' '}
              <Link href="https://open-meteo.com/" style={{ color: '#9ca3af' }}>
                Open-Meteo.com
              </Link>{' '}
              (CC BY 4.0) ·{' '}
              <Link href={`${appUrl}/settings`} style={{ color: '#9ca3af' }}>
                Manage notifications
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
