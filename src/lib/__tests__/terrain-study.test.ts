import { describe, expect, it } from 'vitest';
import {
  demFileUrl,
  heightAt,
  parseDemHeader,
  readDemGrid,
  undoFloatPredictor,
  type DemGrid,
} from '../terrain-study/dem';
import {
  faceFits,
  skylineAt,
  studyFromGrids,
  sunOnLaunch,
  terrainView,
  type TerrainStudy,
} from '../terrain-study';

describe('Copernicus files', () => {
  it('names the file by its south-west corner', () => {
    expect(demFileUrl(45, 11)).toBe(
      'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N45_00_E011_00_DEM/Copernicus_DSM_COG_10_N45_00_E011_00_DEM.tif',
    );
    expect(demFileUrl(-1, -122)).toContain('Copernicus_DSM_COG_10_S01_00_W122_00_DEM.tif');
  });
});

/** Apply TIFF's floating point predictor, as a writer does, to rows of little-endian floats. */
function applyFloatPredictor(values: Float32Array, width: number): Uint8Array<ArrayBuffer> {
  const src = new Uint8Array(values.buffer.slice(0));
  const out = new Uint8Array(src.length);
  const rowBytes = width * 4;
  for (let r = 0; r < src.length / rowBytes; r++) {
    const start = r * rowBytes;
    for (let j = 0; j < width; j++) {
      out[start + j] = src[start + 4 * j + 3];
      out[start + width + j] = src[start + 4 * j + 2];
      out[start + 2 * width + j] = src[start + 4 * j + 1];
      out[start + 3 * width + j] = src[start + 4 * j];
    }
    for (let i = start + rowBytes - 1; i > start; i--) out[i] = (out[i] - out[i - 1]) & 0xff;
  }
  return out;
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A small one-degree file: `size` heights a side in squares of `tile`,
 * each height row * 10 + column.
 */
async function makeFile(west: number, north: number, size: number, tile: number) {
  const across = size / tile;
  const tiles: Uint8Array[] = [];
  for (let ty = 0; ty < across; ty++) {
    for (let tx = 0; tx < across; tx++) {
      const v = new Float32Array(tile * tile);
      for (let r = 0; r < tile; r++) {
        for (let c = 0; c < tile; c++) v[r * tile + c] = (ty * tile + r) * 10 + tx * tile + c;
      }
      tiles.push(await deflate(applyFloatPredictor(v, tile)));
    }
  }
  // Header: TIFF signature, one IFD of 14 tags, then its arrays, then the squares
  const tags: Array<[number, number, number[]]> = [
    [256, 3, [size]],
    [257, 3, [size]],
    [258, 3, [32]],
    [259, 3, [8]],
    [277, 3, [1]],
    [317, 3, [3]],
    [322, 3, [tile]],
    [323, 3, [tile]],
    [324, 4, []], // offsets, filled below
    [325, 4, tiles.map((t) => t.length)],
    [339, 3, [3]],
    [33550, 12, [1 / size, 1 / size, 0]],
    [33922, 12, [0, 0, 0, west, north, 0]],
  ];
  const size4 = (type: number) => (type === 3 ? 2 : type === 4 ? 4 : 8);
  const ifdAt = 8;
  let extra = ifdAt + 2 + 12 * tags.length + 4;
  const extras: Array<{ at: number; type: number; values: number[] }> = [];
  const placed = tags.map(([tag, type, values]) => {
    const count = tag === 324 ? tiles.length : values.length;
    const bytes = size4(type) * count;
    if (bytes <= 4) return { tag, type, count, at: -1, values };
    const at = extra;
    extra += bytes;
    extras.push({ at, type, values });
    return { tag, type, count, at, values };
  });
  let dataAt = extra;
  const offsets = tiles.map((t) => {
    const at = dataAt;
    dataAt += t.length;
    return at;
  });
  const offsetsTag = placed.find((p) => p.tag === 324)!;
  offsetsTag.values = offsets;
  extras.find((e) => e.at === offsetsTag.at)!.values = offsets;
  const buf = new ArrayBuffer(dataAt);
  const view = new DataView(buf);
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdAt, true);
  view.setUint16(ifdAt, tags.length, true);
  const write = (at: number, type: number, values: number[]) =>
    values.forEach((v, i) => {
      if (type === 3) view.setUint16(at + 2 * i, v, true);
      else if (type === 4) view.setUint32(at + 4 * i, v, true);
      else view.setFloat64(at + 8 * i, v, true);
    });
  placed.forEach((p, i) => {
    const at = ifdAt + 2 + 12 * i;
    view.setUint16(at, p.tag, true);
    view.setUint16(at + 2, p.type, true);
    view.setUint32(at + 4, p.count, true);
    if (p.at < 0) write(at + 8, p.type, p.values);
    else view.setUint32(at + 8, p.at, true);
  });
  view.setUint32(ifdAt + 2 + 12 * tags.length, 0, true);
  for (const e of extras) write(e.at, e.type, e.values);
  tiles.forEach((t, i) => new Uint8Array(buf, offsets[i], t.length).set(t));
  return buf;
}

/** A fetch that serves byte ranges of the files given, and 404 for any other. */
function servingFetch(files: Record<string, ArrayBuffer>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const file = files[String(input)];
    if (!file) return new Response(null, { status: 404 });
    const range = /bytes=(\d+)-(\d+)/.exec(String(new Headers(init?.headers).get('Range')));
    const from = Number(range?.[1] ?? 0);
    const to = Math.min(file.byteLength - 1, Number(range?.[2] ?? file.byteLength - 1));
    return new Response(file.slice(from, to + 1), { status: 206 });
  }) as typeof fetch;
}

describe('reading heights', () => {
  it('undoes the floating point predictor', () => {
    const v = new Float32Array([1.5, -2.25, 1000.125, 0, 3e5, 7, 8, 9]);
    const back = undoFloatPredictor(applyFloatPredictor(v, 4), 4, 2);
    expect(Array.from(new Float32Array(back.buffer))).toEqual(Array.from(v));
  });

  it('reads the header of a file', async () => {
    const url = demFileUrl(45, 11);
    const file = parseDemHeader(await makeFile(11, 46, 16, 8), url);
    expect(file).toMatchObject({ west: 11, north: 46, dLat: 1 / 16 });
    expect(file.levels[0]).toMatchObject({ width: 16, tileWidth: 8, predictor: 3 });
    expect(file.levels[0].offsets).toHaveLength(4);
  });

  it('reads a window of heights from the squares it touches, sea as 0', async () => {
    const url = demFileUrl(45, 11);
    const fetcher = servingFetch({ [url]: await makeFile(11, 46, 16, 8) });
    // Near the file's east edge: the window runs into a file that doesn't exist
    const grid = await readDemGrid(45.5, 11.95, 9000, 0, fetcher);
    expect(grid.dLat).toBe(1 / 16);
    // Each cell holds the file's nearest height: row * 10 + column
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const lon = grid.west + c * grid.dLon;
        const row = Math.round((46 - (grid.north - r * grid.dLat)) * 16);
        const col = Math.min(15, Math.round((lon - 11) * 16));
        expect(grid.z[r * grid.cols + c]).toBe(lon >= 12 ? 0 : row * 10 + col);
      }
    }
    expect(heightAt(grid, 45.5, 12.2)).toBe(0);
  });
});

/** A grid round (lat, lon) with heights from a function of meters east and north. */
function gridOf(
  lat: number,
  lon: number,
  radius: number,
  step: number,
  height: (east: number, north: number) => number,
): DemGrid {
  const dLat = step / 111_320;
  const dLon = step / (111_320 * Math.cos((lat * Math.PI) / 180));
  const n = Math.ceil((2 * radius) / step) + 1;
  const north = lat + (radius / step) * dLat;
  const west = lon - (radius / step) * dLon;
  const z = new Float32Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) z[r * n + c] = height(c * step - radius, radius - r * step);
  }
  return { north, west, dLat, dLon, rows: n, cols: n, z };
}

describe('the study', () => {
  const lat = 46;
  const lon = 8;
  // A slope falling to the south at 15°, with a mountain 1,000 m higher 4 km east
  const ground = (east: number, north: number) =>
    1000 +
    north * Math.tan((15 * Math.PI) / 180) +
    1000 * Math.exp(-(((east - 4000) / 800) ** 2) - (north / 800) ** 2);
  const near = gridOf(lat, lon, 1600, 30, ground);
  const far = gridOf(lat, lon, 15200, 60, ground);
  const study = studyFromGrids(near, far, lat, lon);

  it('finds the way the slope faces and the wind it suits', () => {
    expect(study.ground).toBe(1000);
    expect(study.face.direction).toBe(180);
    expect(study.face.slope).toBeCloseTo(15, 0);
    expect([...study.suggestion.good, ...study.suggestion.ok]).toContain(180);
    expect(faceFits(study.face, [225])).toBe(true);
    expect(faceFits(study.face, [270])).toBe(false);
  });

  it('marks the lee of higher ground upwind', () => {
    const from = (d: number) => study.upwind.find((u) => u.direction === d)!;
    // The mountain to the east
    expect(from(90).lee).toBe(true);
    expect(from(90).distance).toBeGreaterThan(3000);
    // The slope above the launch: wind over the back
    expect(from(0).lee).toBe(true);
    // Down the slope there is nothing higher
    expect(from(180).height).toBeNull();
    expect(from(180).lee).toBe(false);
  });

  it('reads the skyline', () => {
    expect(skylineAt(study.horizon, 90)).toBeGreaterThan(10);
    expect(skylineAt(study.horizon, 180)).toBeLessThan(0);
  });

  it('says when the sun is on the launch', () => {
    const open: Pick<TerrainStudy, 'latitude' | 'longitude' | 'face' | 'horizon'> = {
      latitude: 46,
      longitude: 8,
      face: { direction: 180, slope: 15 },
      horizon: new Array(72).fill(0),
    };
    const march = sunOnLaunch(open, '2026-03-20', 'Europe/Zurich');
    expect(march.first! < '07:30').toBe(true);
    expect(march.last! > '17:30').toBe(true);
    expect(march.hours).toBeGreaterThan(10);
    // The mountain to the east hides the early sun
    const shaded = sunOnLaunch({ ...open, horizon: study.horizon }, '2026-03-20', 'Europe/Zurich');
    expect(shaded.first! > march.first!).toBe(true);
    // A steep north face gets no sun in December
    const north = sunOnLaunch(
      { ...open, face: { direction: 0, slope: 40 } },
      '2026-12-15',
      'Europe/Zurich',
    );
    expect(north).toEqual({ first: null, last: null, hours: 0 });
  });

  it('gives today and the 15th of each month', () => {
    const view = terrainView(study, '2026-10-22', 'Europe/Zurich');
    expect(view.months).toHaveLength(12);
    expect(view.today?.first).toMatch(/^\d\d:\d\d$/);
    expect(terrainView(study, null, null)).toEqual({ study, today: null, months: null });
  });
});
