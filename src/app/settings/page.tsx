import { getSettings } from './actions';
import { getSites } from '../sites/actions';
import { SettingsClient } from '@/components/settings-client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Configure notification preferences, score thresholds, and push notification settings.',
};

export default async function SettingsPage() {
  const [settings, sites] = await Promise.all([getSettings(), getSites()]);

  return <SettingsClient initialSettings={settings} sites={sites} />;
}
