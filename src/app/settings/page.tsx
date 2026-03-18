import { getSettings } from './actions';
import { getUserFavoriteSites } from '../sites/browse/actions';
import { SettingsClient } from '@/components/settings-client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings',
  description:
    'Configure notification preferences, score thresholds, and push notification settings.',
};

export default async function SettingsPage() {
  const [settings, favoriteSites] = await Promise.all([getSettings(), getUserFavoriteSites()]);

  const sites = favoriteSites.map((fav) => ({
    id: fav.id,
    name: fav.name,
    latitude: parseFloat(fav.latitude),
    longitude: parseFloat(fav.longitude),
    elevation: fav.elevation ?? 0,
    customMaxWind: fav.favorite.customMaxWind,
    defaultMaxWind: fav.maxWindSpeed,
  }));

  return <SettingsClient initialSettings={settings} sites={sites} />;
}
