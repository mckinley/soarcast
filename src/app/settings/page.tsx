import { getSettings } from './actions';
import { getSites } from '../sites/actions';
import { SettingsClient } from '@/components/settings-client';

export default async function SettingsPage() {
  const [settings, sites] = await Promise.all([getSettings(), getSites()]);

  return <SettingsClient initialSettings={settings} sites={sites} />;
}
