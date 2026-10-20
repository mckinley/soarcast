// Flying areas pilots travel to, for "Where to fly" on the Planning page, and
// the launches each one is rated at. There's no standard way to divide the
// world into flying areas, so this is our own hand-picked list of trip
// destinations: an area is a few launches within AREA_RADIUS_KM of its
// middle, so a trip based in one place can fly whichever suits the day. An
// area is a go on a day when any of its launches is. The season build
// (scripts/seasons/build.ts) finds each launch in pgsites (a listed site
// matching `match` within 30 km of the point, in the country) and rates its
// past two years like any other site.

/** Every launch in an area is within this distance of the area's middle. */
export const AREA_RADIUS_KM = 100;

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
  /** The area it's in (`Area.slug`) */
  area: string;
}

export interface Area {
  slug: string;
  name: string;
  /** The middle of its launches */
  latitude: number;
  longitude: number;
  launches: Array<Omit<Destination, 'area'>>;
}

function d(
  slug: string,
  name: string,
  countryCode: string,
  latitude: number,
  longitude: number,
  match: string[],
): Omit<Destination, 'area'> {
  return { slug, name, countryCode, latitude, longitude, match };
}

function area(slug: string, name: string, launches: Area['launches']): Area {
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return {
    slug,
    name,
    latitude: mean(launches.map((l) => l.latitude)),
    longitude: mean(launches.map((l) => l.longitude)),
    launches,
  };
}

export const AREAS: Area[] = [
  // Europe
  area('northern-french-alps', 'Northern French Alps', [
    d('annecy', 'Annecy (Col de la Forclaz)', 'fr', 45.81, 6.25, [
      '%Forclaz%',
      '%Planfait%',
      '%Montmin%',
    ]),
    d('chamonix', 'Chamonix (Planpraz)', 'fr', 45.93, 6.86, [
      '%Planpraz%',
      '%Brevent%',
      '%Brévent%',
    ]),
    d('st-hilaire', 'Saint-Hilaire du Touvet', 'fr', 45.31, 5.89, ['%Hilaire%']),
  ]),
  area('southern-french-alps', 'Southern French Alps', [
    d('st-andre', 'Saint-André-les-Alpes (Chalvet)', 'fr', 43.97, 6.5, [
      '%Chalvet%',
      '%Andr%Alpes%',
    ]),
    d('laragne', 'Laragne (Montagne de Chabre)', 'fr', 44.3, 5.79, ['%Chabre%', '%Laragne%']),
  ]),
  area('french-atlantic', 'French Atlantic coast', [
    d('dune-du-pilat', 'Dune du Pilat', 'fr', 44.59, -1.21, ['%Pilat%', '%Pyla%']),
  ]),
  area('swiss-alps', 'Swiss Alps', [
    d('grindelwald', 'Grindelwald (First)', 'ch', 46.66, 8.05, ['%First%', '%Grindelwald%']),
    d('interlaken', 'Interlaken (Amisbühl)', 'ch', 46.69, 7.85, ['%Amisb%', '%Beatenberg%']),
    d('fiesch', 'Fiesch (Kühboden)', 'ch', 46.41, 8.12, ['%hboden%', '%Fiesch%']),
  ]),
  area('austrian-alps', 'Austrian Alps', [
    d('greifenburg', 'Greifenburg (Emberger Alm)', 'at', 46.76, 13.14, [
      '%Emberger%',
      '%Greifenburg%',
    ]),
    d('koessen', 'Kössen (Unterberg)', 'at', 47.65, 12.43, ['%Unterberg%', '%ssen%']),
    d('zillertal', 'Zillertal (Penken)', 'at', 47.17, 11.85, ['%Penken%', '%Mayrhofen%']),
    d('lienz', 'Lienz (Zettersfeld)', 'at', 46.85, 12.79, ['%Zettersfeld%', '%Lienz%']),
  ]),
  area('italian-alps', 'Italian Alps and Dolomites', [
    d('bassano', 'Bassano del Grappa', 'it', 45.81, 11.72, ['%Bassano%', '%Semonzo%', '%Grappa%']),
    d('feltre', 'Feltre (Monte Avena)', 'it', 46.03, 11.83, ['%Avena%', '%Feltre%']),
    d('gemona', 'Gemona (Monte Cuarnan)', 'it', 46.29, 13.17, ['%Cuarnan%', '%Gemona%']),
  ]),
  area('central-italy', 'Central Italy', [
    d('monte-cucco', 'Monte Cucco', 'it', 43.37, 12.73, ['%Cucco%']),
  ]),
  area('slovenia', 'Soča Valley', [
    d('tolmin', 'Tolmin (Kobala)', 'si', 46.19, 13.72, ['%Kobala%', '%Tolmin%', '%Kobarid%']),
  ]),
  area('spanish-pyrenees', 'Spanish Pyrenees', [
    d('ager', 'Àger (Sant Alís)', 'es', 42.04, 0.75, ['%Sant Al%', '%Ager%', '%Àger%']),
    d('organya', 'Organyà', 'es', 42.21, 1.33, ['%Organy%']),
    d('castejon', 'Castejón de Sos (El Gallinero)', 'es', 42.53, 0.48, ['%Gallinero%', '%Castej%']),
  ]),
  area('central-spain', 'Central Spain', [
    d('piedrahita', 'Piedrahita (Peña Negra)', 'es', 40.43, -5.3, ['%Negra%', '%Piedrahita%']),
  ]),
  area('southern-spain', 'Southern Spain', [
    d('algodonales', 'Algodonales (Lijar)', 'es', 36.88, -5.4, ['%Lijar%', '%Algodonales%']),
    d('loja', 'Loja', 'es', 37.15, -4.15, ['%Loja%']),
    d('pegalajar', 'Pegalajar (Siete Pilillas)', 'es', 37.75, -3.65, ['%Pilillas%', '%Pegalajar%']),
  ]),
  area('portugal', 'Serra da Estrela', [
    d('linhares', 'Linhares da Beira', 'pt', 40.54, -7.44, ['%Linhares%']),
  ]),
  area('turkey', 'Turkish Riviera', [
    d('oludeniz', 'Ölüdeniz (Babadağ)', 'tr', 36.53, 29.17, ['%Babada%', '%deniz%']),
  ]),
  area('north-macedonia', 'North Macedonia', [
    d('krusevo', 'Kruševo', 'mk', 41.37, 21.24, ['%Kru%evo%']),
  ]),
  area('bulgaria', 'Bulgaria', [d('sopot', 'Sopot', 'bg', 42.67, 24.75, ['%Sopot%'])]),
  area('caucasus', 'Caucasus', [d('gudauri', 'Gudauri', 'ge', 42.47, 44.48, ['%Gudauri%'])]),
  // The Americas
  area('central-mexico', 'Central Mexico', [
    d('valle-de-bravo', 'Valle de Bravo (El Peñón)', 'mx', 19.2, -100.12, [
      '%Pe%on%',
      '%Valle de Bravo%',
    ]),
  ]),
  area('jalisco', 'Jalisco', [d('tapalpa', 'Tapalpa', 'mx', 19.95, -103.77, ['%Tapalpa%'])]),
  area('cauca-valley', 'Cauca Valley', [
    d('roldanillo', 'Roldanillo', 'co', 4.42, -76.13, ['%Roldanillo%']),
  ]),
  area('antioquia', 'Antioquia', [
    d('medellin', 'Medellín (San Félix)', 'co', 6.34, -75.62, ['%San F%lix%', '%Medell%']),
  ]),
  area('santander', 'Santander', [
    d('bucaramanga', 'Bucaramanga (Ruitoque)', 'co', 7.03, -73.1, ['%Ruitoque%', '%Bucaramanga%']),
  ]),
  area('northeast-brazil', 'Northeast Brazil', [
    d('quixada', 'Quixadá', 'br', -4.97, -39.01, ['%Quixad%']),
  ]),
  area('southeast-brazil', 'Southeast Brazil', [
    d('valadares', 'Governador Valadares (Ibituruna)', 'br', -18.88, -41.97, [
      '%Ibituruna%',
      '%Valadares%',
    ]),
  ]),
  area('northern-chile', 'Northern Chile', [
    d('iquique', 'Iquique (Alto Hospicio)', 'cl', -20.27, -70.1, ['%Hospicio%', '%Iquique%']),
  ]),
  area('peru-coast', 'Peruvian coast', [
    d('lima', 'Lima (Miraflores)', 'pe', -12.13, -77.04, ['%Miraflores%', '%Lima%']),
  ]),
  area('patagonia', 'Patagonia', [
    d('bariloche', 'Bariloche (Cerro Otto)', 'ar', -41.15, -71.36, ['%Otto%', '%Bariloche%']),
  ]),
  area('cordoba', 'Córdoba hills', [
    d('la-cumbre', 'La Cumbre (Cuchi Corral)', 'ar', -30.97, -64.55, ['%Cuchi%', '%Cumbre%']),
  ]),
  area('eastern-sierra', 'Eastern Sierra', [
    d('owens-valley', 'Owens Valley (Walts Point)', 'us', 36.42, -118.1, ['%Walt%', '%Owens%']),
  ]),
  area('utah', 'Utah', [
    d('point-of-the-mountain', 'Point of the Mountain', 'us', 40.46, -111.9, [
      '%Point of the Mountain%',
      '%Flight Park%',
    ]),
  ]),
  area('southern-california', 'Southern California', [
    d('torrey-pines', 'Torrey Pines', 'us', 32.89, -117.25, ['%Torrey%']),
  ]),
  area('central-washington', 'Central Washington', [
    d('chelan', 'Chelan Butte', 'us', 47.8, -120.05, ['%Chelan%']),
  ]),
  area('southern-oregon', 'Southern Oregon', [
    d('woodrat', 'Woodrat Mountain', 'us', 42.23, -123.03, ['%Woodrat%']),
  ]),
  area('appalachians', 'Southern Appalachians', [
    d('lookout-mountain', 'Lookout Mountain', 'us', 34.65, -85.42, ['%Lookout%']),
  ]),
  area('canadian-rockies', 'Canadian Rockies', [
    d('golden', 'Golden (Mount 7)', 'ca', 51.25, -116.92, ['%Mount 7%', '%Mt%7%', '%Golden%']),
  ]),
  // Asia, Oceania and Africa
  area('himachal', 'Himachal Pradesh', [
    d('bir', 'Bir Billing', 'in', 32.07, 76.73, ['%Billing%', '%Bir%']),
  ]),
  area('western-ghats', 'Western Ghats', [
    d('kamshet', 'Kamshet', 'in', 18.76, 73.55, ['%Shelar%', '%Tower Hill%', '%Kamshet%']),
  ]),
  area('nepal', 'Nepal', [
    d('pokhara', 'Pokhara (Sarangkot)', 'np', 28.24, 83.95, ['%Sarangkot%', '%Pokhara%']),
  ]),
  area('northern-thailand', 'Northern Thailand', [
    d('chiang-mai', 'Chiang Mai (Doi Pha-Phueng)', 'th', 18.84, 99.18, [
      '%Pha-Phueng%',
      '%Pha Phueng%',
    ]),
  ]),
  area('phetchabun', 'Phetchabun', [
    d('phu-thap-boek', 'Phu Thap Boek', 'th', 16.9, 101.11, ['%Thap Boek%']),
  ]),
  area('victorian-alps', 'Victorian Alps', [
    d('bright', 'Bright (Mystic)', 'au', -36.74, 146.97, ['%Mystic%', '%Bright%']),
  ]),
  area('north-west-slopes', 'North West Slopes', [
    d('manilla', 'Manilla (Mt Borah)', 'au', -30.69, 150.69, ['%Borah%', '%Manilla%']),
  ]),
  area('illawarra', 'Illawarra coast', [
    d('stanwell-park', 'Stanwell Park', 'au', -34.23, 150.99, ['%Stanwell%', '%Bald Hill%']),
  ]),
  area('southern-lakes', 'Southern Lakes, New Zealand', [
    d('queenstown', 'Queenstown (Coronet Peak)', 'nz', -44.93, 168.73, [
      '%Coronet%',
      '%Queenstown%',
    ]),
    d('wanaka', 'Wanaka (Treble Cone)', 'nz', -44.63, 168.91, ['%Treble%', '%Wanaka%']),
  ]),
  area('western-cape', 'Western Cape', [
    d('porterville', 'Porterville', 'za', -33.0, 19.03, ['%Porterville%', '%Dasklip%']),
    d('cape-town', 'Cape Town (Signal Hill)', 'za', -33.92, 18.4, ['%Signal Hill%', '%Lion%']),
  ]),
];

export const DESTINATIONS: Destination[] = AREAS.flatMap((a) =>
  a.launches.map((l) => ({ ...l, area: a.slug })),
);

export const DESTINATION_BY_SLUG = new Map(DESTINATIONS.map((x) => [x.slug, x]));
export const AREA_BY_SLUG = new Map(AREAS.map((a) => [a.slug, a]));
