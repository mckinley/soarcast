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
  Row,
  Column,
} from '@react-email/components';

interface SiteDigestItem {
  name: string;
  slug?: string;
  score: number;
  label: 'Epic' | 'Great' | 'Good' | 'Fair' | 'Poor';
}

interface MorningDigestEmailProps {
  date: string; // e.g. "Monday, March 8, 2026"
  sites: SiteDigestItem[];
  appUrl?: string;
}

const labelColors: Record<string, string> = {
  Epic: '#a855f7',
  Great: '#22c55e',
  Good: '#3b82f6',
  Fair: '#eab308',
  Poor: '#9ca3af',
};

export function MorningDigestEmail({
  date,
  sites,
  appUrl = 'https://soarcast.app',
}: MorningDigestEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f8fafc', fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <Container style={{ maxWidth: '480px', margin: '32px auto', backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          {/* Header */}
          <Section style={{ backgroundColor: '#0ea5e9', padding: '24px 32px' }}>
            <Heading style={{ color: '#ffffff', margin: 0, fontSize: '22px', fontWeight: '700' }}>
              🪂 SoarCast Morning Digest
            </Heading>
            <Text style={{ color: 'rgba(255,255,255,0.85)', margin: '4px 0 0', fontSize: '14px' }}>
              {date}
            </Text>
          </Section>

          {/* Site forecasts */}
          <Section style={{ padding: '24px 32px' }}>
            {sites.length === 0 ? (
              <Text style={{ color: '#6b7280', fontSize: '14px' }}>
                No flying sites configured. Visit SoarCast to add your favorite sites.
              </Text>
            ) : (
              <>
                <Text style={{ color: '#374151', fontSize: '15px', fontWeight: '600', margin: '0 0 16px' }}>
                  Today&apos;s Conditions
                </Text>
                {sites.map((site, i) => (
                  <Row key={i} style={{ marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                    <Column style={{ width: '70%' }}>
                      <Text style={{ margin: 0, fontWeight: '600', color: '#111827', fontSize: '15px' }}>
                        {site.name}
                      </Text>
                      <Text style={{ margin: '2px 0 0', color: '#6b7280', fontSize: '13px' }}>
                        Score: {site.score}/100
                      </Text>
                    </Column>
                    <Column style={{ width: '30%', textAlign: 'right' }}>
                      <span style={{
                        backgroundColor: labelColors[site.label] || '#9ca3af',
                        color: '#ffffff',
                        borderRadius: '20px',
                        padding: '3px 12px',
                        fontSize: '13px',
                        fontWeight: '600',
                        display: 'inline-block',
                      }}>
                        {site.label}
                      </span>
                    </Column>
                  </Row>
                ))}
              </>
            )}
          </Section>

          <Hr style={{ borderColor: '#e5e7eb', margin: 0 }} />

          {/* CTA */}
          <Section style={{ padding: '20px 32px', textAlign: 'center' }}>
            <Link
              href={appUrl}
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
              View Full Forecast →
            </Link>
          </Section>

          {/* Footer */}
          <Section style={{ backgroundColor: '#f8fafc', padding: '16px 32px', textAlign: 'center' }}>
            <Text style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>
              SoarCast · Paragliding Soaring Forecast ·{' '}
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
