// Flying destinations pilots travel to, for "Where to fly" on the Year page.
// The season build (scripts/seasons/build.ts) finds each one's launch in
// pgsites (a listed site matching `match` within 30 km of the point, in the
// country) and rates its past two years like any other site.

export interface Destination {
  slug: string;
  /** Place and main launch, as pilots call them */
  name: string;
  countryCode: string;
  /** Roughly the main launch; the listed site found near it is what's rated */
  latitude: number;
  longitude: number;
  /** SQL LIKE patterns for the launch's name on Paragliding Earth, best first */
  match: string[];
}

function d(
  slug: string,
  name: string,
  countryCode: string,
  latitude: number,
  longitude: number,
  match: string[],
): Destination {
  return { slug, name, countryCode, latitude, longitude, match };
}

export const DESTINATIONS: Destination[] = [
  // Europe
  d('annecy', 'Annecy (Col de la Forclaz)', 'fr', 45.81, 6.25, [
    '%Forclaz%',
    '%Planfait%',
    '%Montmin%',
  ]),
  d('chamonix', 'Chamonix (Planpraz)', 'fr', 45.93, 6.86, ['%Planpraz%', '%Brevent%', '%Brévent%']),
  d('st-andre', 'Saint-André-les-Alpes (Chalvet)', 'fr', 43.97, 6.5, ['%Chalvet%', '%Andr%Alpes%']),
  d('laragne', 'Laragne (Montagne de Chabre)', 'fr', 44.3, 5.79, ['%Chabre%', '%Laragne%']),
  d('st-hilaire', 'Saint-Hilaire du Touvet', 'fr', 45.31, 5.89, ['%Hilaire%']),
  d('dune-du-pilat', 'Dune du Pilat', 'fr', 44.59, -1.21, ['%Pilat%', '%Pyla%']),
  d('grindelwald', 'Grindelwald (First)', 'ch', 46.66, 8.05, ['%First%', '%Grindelwald%']),
  d('interlaken', 'Interlaken (Amisbühl)', 'ch', 46.69, 7.85, ['%Amisb%', '%Beatenberg%']),
  d('fiesch', 'Fiesch (Kühboden)', 'ch', 46.41, 8.12, ['%hboden%', '%Fiesch%']),
  d('greifenburg', 'Greifenburg (Emberger Alm)', 'at', 46.76, 13.14, [
    '%Emberger%',
    '%Greifenburg%',
  ]),
  d('koessen', 'Kössen (Unterberg)', 'at', 47.65, 12.43, ['%Unterberg%', '%ssen%']),
  d('zillertal', 'Zillertal (Penken)', 'at', 47.17, 11.85, ['%Penken%', '%Mayrhofen%']),
  d('lienz', 'Lienz (Zettersfeld)', 'at', 46.85, 12.79, ['%Zettersfeld%', '%Lienz%']),
  d('bassano', 'Bassano del Grappa', 'it', 45.81, 11.72, ['%Bassano%', '%Semonzo%', '%Grappa%']),
  d('feltre', 'Feltre (Monte Avena)', 'it', 46.03, 11.83, ['%Avena%', '%Feltre%']),
  d('gemona', 'Gemona (Monte Cuarnan)', 'it', 46.29, 13.17, ['%Cuarnan%', '%Gemona%']),
  d('monte-cucco', 'Monte Cucco', 'it', 43.37, 12.73, ['%Cucco%']),
  d('tolmin', 'Tolmin (Kobala)', 'si', 46.19, 13.72, ['%Kobala%', '%Tolmin%', '%Kobarid%']),
  d('ager', 'Àger (Sant Alís)', 'es', 42.04, 0.75, ['%Sant Al%', '%Ager%', '%Àger%']),
  d('organya', 'Organyà', 'es', 42.21, 1.33, ['%Organy%']),
  d('algodonales', 'Algodonales (Lijar)', 'es', 36.88, -5.4, ['%Lijar%', '%Algodonales%']),
  d('piedrahita', 'Piedrahita (Peña Negra)', 'es', 40.43, -5.3, ['%Negra%', '%Piedrahita%']),
  d('castejon', 'Castejón de Sos (El Gallinero)', 'es', 42.53, 0.48, ['%Gallinero%', '%Castej%']),
  d('linhares', 'Linhares da Beira', 'pt', 40.54, -7.44, ['%Linhares%']),
  d('oludeniz', 'Ölüdeniz (Babadağ)', 'tr', 36.53, 29.17, ['%Babada%', '%deniz%']),
  d('krusevo', 'Kruševo', 'mk', 41.37, 21.24, ['%Kru%evo%']),
  d('sopot', 'Sopot', 'bg', 42.67, 24.75, ['%Sopot%']),
  d('gudauri', 'Gudauri', 'ge', 42.47, 44.48, ['%Gudauri%']),
  // The Americas
  d('valle-de-bravo', 'Valle de Bravo (El Peñón)', 'mx', 19.2, -100.12, [
    '%Pe%on%',
    '%Valle de Bravo%',
  ]),
  d('tapalpa', 'Tapalpa', 'mx', 19.95, -103.77, ['%Tapalpa%']),
  d('roldanillo', 'Roldanillo', 'co', 4.42, -76.13, ['%Roldanillo%']),
  d('medellin', 'Medellín (San Félix)', 'co', 6.34, -75.62, ['%San F%lix%', '%Medell%']),
  d('bucaramanga', 'Bucaramanga (Ruitoque)', 'co', 7.03, -73.1, ['%Ruitoque%', '%Bucaramanga%']),
  d('quixada', 'Quixadá', 'br', -4.97, -39.01, ['%Quixad%']),
  d('valadares', 'Governador Valadares (Ibituruna)', 'br', -18.88, -41.97, [
    '%Ibituruna%',
    '%Valadares%',
  ]),
  d('iquique', 'Iquique (Alto Hospicio)', 'cl', -20.27, -70.1, ['%Hospicio%', '%Iquique%']),
  d('lima', 'Lima (Miraflores)', 'pe', -12.13, -77.04, ['%Miraflores%', '%Lima%']),
  d('bariloche', 'Bariloche (Cerro Otto)', 'ar', -41.15, -71.36, ['%Otto%', '%Bariloche%']),
  d('la-cumbre', 'La Cumbre (Cuchi Corral)', 'ar', -30.97, -64.55, ['%Cuchi%', '%Cumbre%']),
  d('owens-valley', 'Owens Valley (Walts Point)', 'us', 36.42, -118.1, ['%Walt%', '%Owens%']),
  d('point-of-the-mountain', 'Point of the Mountain', 'us', 40.46, -111.9, [
    '%Point of the Mountain%',
    '%Flight Park%',
  ]),
  d('torrey-pines', 'Torrey Pines', 'us', 32.89, -117.25, ['%Torrey%']),
  d('chelan', 'Chelan Butte', 'us', 47.8, -120.05, ['%Chelan%']),
  d('woodrat', 'Woodrat Mountain', 'us', 42.23, -123.03, ['%Woodrat%']),
  d('lookout-mountain', 'Lookout Mountain', 'us', 34.65, -85.42, ['%Lookout%']),
  d('golden', 'Golden (Mount 7)', 'ca', 51.25, -116.92, ['%Mount 7%', '%Mt%7%', '%Golden%']),
  // Asia, Oceania and Africa
  d('bir', 'Bir Billing', 'in', 32.07, 76.73, ['%Billing%', '%Bir%']),
  d('kamshet', 'Kamshet', 'in', 18.76, 73.55, ['%Shelar%', '%Tower Hill%', '%Kamshet%']),
  d('pokhara', 'Pokhara (Sarangkot)', 'np', 28.24, 83.95, ['%Sarangkot%', '%Pokhara%']),
  d('bright', 'Bright (Mystic)', 'au', -36.74, 146.97, ['%Mystic%', '%Bright%']),
  d('manilla', 'Manilla (Mt Borah)', 'au', -30.69, 150.69, ['%Borah%', '%Manilla%']),
  d('stanwell-park', 'Stanwell Park', 'au', -34.23, 150.99, ['%Stanwell%', '%Bald Hill%']),
  d('queenstown', 'Queenstown (Coronet Peak)', 'nz', -44.93, 168.73, ['%Coronet%', '%Queenstown%']),
  d('wanaka', 'Wanaka (Treble Cone)', 'nz', -44.63, 168.91, ['%Treble%', '%Wanaka%']),
  d('porterville', 'Porterville', 'za', -33.0, 19.03, ['%Porterville%', '%Dasklip%']),
  d('cape-town', 'Cape Town (Signal Hill)', 'za', -33.92, 18.4, ['%Signal Hill%', '%Lion%']),
];

export const DESTINATION_BY_SLUG = new Map(DESTINATIONS.map((x) => [x.slug, x]));
