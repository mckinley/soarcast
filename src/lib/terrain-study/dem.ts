// Heights from the Copernicus elevation model (GLO-30: a height every arc
// second, about 30 m), read straight from its open copy on Amazon. Each file
// is one degree of latitude and longitude, a cloud-optimized GeoTIFF: a
// short header, then the heights in squares of 1024 by 1024, each squeezed
// on its own. A window of heights costs one small read for each file's
// header and one read for each square it touches. The file also holds the
// same heights at half and a quarter of the detail (overviews), which far
// ground reads from. Files exist only over land: the sea is height 0.
//
// Licence: free use with the credit in COPERNICUS_DEM_CREDIT.

export const DEM_ROOT = 'https://copernicus-dem-30m.s3.amazonaws.com';

export const COPERNICUS_DEM_CREDIT =
  '© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA. All rights reserved.';

/** How much of each file's header is read first. The headers seen are about 1.3 KB. */
const HEADER_BYTES = 16 * 1024;

type Fetch = typeof fetch;

/** The file holding the degree whose south-west corner is (latFloor, lonFloor). */
export function demFileUrl(latFloor: number, lonFloor: number): string {
  const lat = `${latFloor >= 0 ? 'N' : 'S'}${String(Math.abs(latFloor)).padStart(2, '0')}`;
  const lon = `${lonFloor >= 0 ? 'E' : 'W'}${String(Math.abs(lonFloor)).padStart(3, '0')}`;
  const name = `Copernicus_DSM_COG_10_${lat}_00_${lon}_00_DEM`;
  return `${DEM_ROOT}/${name}/${name}.tif`;
}

/** One level of detail in a file: level 0 is full detail, each next one half as fine. */
export interface DemLevel {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  offsets: number[];
  counts: number[];
  predictor: number;
}

export interface DemFile {
  url: string;
  /** The file's north-west corner and its full-detail step, degrees */
  west: number;
  north: number;
  dLon: number;
  dLat: number;
  levels: DemLevel[];
}

const TYPE_BYTES: Record<number, number> = { 1: 1, 3: 2, 4: 4, 12: 8, 16: 8 };

function readValues(view: DataView, type: number, count: number, at: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    if (type === 3) out.push(view.getUint16(at + 2 * i, true));
    else if (type === 4) out.push(view.getUint32(at + 4 * i, true));
    else if (type === 12) out.push(view.getFloat64(at + 8 * i, true));
    else if (type === 16) out.push(Number(view.getBigUint64(at + 8 * i, true)));
    else out.push(view.getUint8(at + i));
  }
  return out;
}

/**
 * The levels and placement in a GeoTIFF header (classic little-endian TIFF,
 * as the Copernicus files are). Tags whose values lie past the bytes given
 * throw, so a caller can read more.
 */
export function parseDemHeader(bytes: ArrayBuffer, url: string): DemFile {
  const view = new DataView(bytes);
  if (view.getUint16(0, true) !== 0x4949 || view.getUint16(2, true) !== 42) {
    throw new Error(`${url} is not a little-endian TIFF`);
  }
  const levels: DemLevel[] = [];
  let scale: number[] | null = null;
  let tie: number[] | null = null;
  let ifd = view.getUint32(4, true);
  while (ifd && ifd + 2 <= bytes.byteLength) {
    const n = view.getUint16(ifd, true);
    const tags = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const at = ifd + 2 + 12 * i;
      const tag = view.getUint16(at, true);
      const type = view.getUint16(at + 2, true);
      const count = view.getUint32(at + 4, true);
      const size = (TYPE_BYTES[type] ?? 1) * count;
      const where = size <= 4 ? at + 8 : view.getUint32(at + 8, true);
      if (where + size > bytes.byteLength) throw new RangeError(`${url}: header longer than read`);
      tags.set(tag, readValues(view, type, count, where));
    }
    const one = (tag: number) => tags.get(tag)?.[0] ?? 0;
    if (one(259) !== 8 || one(258) !== 32 || one(339) !== 3) {
      throw new Error(`${url}: expected deflated 32-bit float heights`);
    }
    levels.push({
      width: one(256),
      height: one(257),
      tileWidth: one(322),
      tileHeight: one(323),
      offsets: tags.get(324) ?? [],
      counts: tags.get(325) ?? [],
      predictor: one(317) || 1,
    });
    scale ??= tags.get(33550) ?? null;
    tie ??= tags.get(33922) ?? null;
    ifd = view.getUint32(ifd + 2 + 12 * n, true);
  }
  if (!levels.length || !scale || !tie) throw new Error(`${url}: no heights or placement`);
  return { url, west: tie[3], north: tie[4], dLon: scale[0], dLat: scale[1], levels };
}

/** A file's header, or null where there is no file (the sea). */
export async function openDemFile(url: string, fetcher: Fetch = fetch): Promise<DemFile | null> {
  for (let bytes = HEADER_BYTES; bytes <= 8 * HEADER_BYTES; bytes *= 4) {
    const res = await fetcher(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
    if (res.status === 404 || res.status === 403) return null;
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    const body = await res.arrayBuffer();
    try {
      return parseDemHeader(body, url);
    } catch (error) {
      if (!(error instanceof RangeError) || body.byteLength < bytes) throw error;
    }
  }
  throw new Error(`${url}: header too long`);
}

/**
 * Undo TIFF's floating point predictor (3) on one square, in place: each
 * row's bytes were split by significance (all first bytes, then all
 * second bytes ...) and stored as differences.
 */
export function undoFloatPredictor(bytes: Uint8Array, width: number, rows: number): Uint8Array {
  const rowBytes = width * 4;
  const out = new Uint8Array(bytes.length);
  for (let r = 0; r < rows; r++) {
    const start = r * rowBytes;
    for (let i = start + 1; i < start + rowBytes; i++) bytes[i] = (bytes[i] + bytes[i - 1]) & 0xff;
    for (let j = 0; j < width; j++) {
      // Most significant byte first in the split row, little-endian out
      out[start + 4 * j] = bytes[start + 3 * width + j];
      out[start + 4 * j + 1] = bytes[start + 2 * width + j];
      out[start + 4 * j + 2] = bytes[start + width + j];
      out[start + 4 * j + 3] = bytes[start + j];
    }
  }
  return out;
}

async function inflate(compressed: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One square of heights, row by row. */
export async function readDemTile(
  file: DemFile,
  level: number,
  index: number,
  fetcher: Fetch = fetch,
): Promise<Float32Array> {
  const l = file.levels[level];
  const from = l.offsets[index];
  const res = await fetcher(file.url, {
    headers: { Range: `bytes=${from}-${from + l.counts[index] - 1}` },
  });
  if (!res.ok) throw new Error(`${file.url} square ${index} answered ${res.status}`);
  let bytes = await inflate(await res.arrayBuffer());
  if (bytes.length !== l.tileWidth * l.tileHeight * 4) {
    throw new Error(`${file.url} square ${index} has ${bytes.length} bytes`);
  }
  if (l.predictor === 3) bytes = undoFloatPredictor(bytes, l.tileWidth, l.tileHeight);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
}

/** Heights on a regular grid of latitude and longitude, north row first. */
export interface DemGrid {
  north: number;
  west: number;
  dLat: number;
  dLon: number;
  rows: number;
  cols: number;
  z: Float32Array;
}

const M_PER_DEG = 111_320;

/**
 * Heights within `radiusM` of a place, at one level of detail (0: about
 * 30 m, 1: about 60 m). Reads every file and square the window touches, one
 * square at a time so only one is held at once.
 */
export async function readDemGrid(
  latitude: number,
  longitude: number,
  radiusM: number,
  level: number,
  fetcher: Fetch = fetch,
): Promise<DemGrid> {
  const files = new Map<string, Promise<DemFile | null>>();
  const fileAt = (latFloor: number, lonFloor: number) => {
    const url = demFileUrl(latFloor, lonFloor);
    if (!files.has(url)) files.set(url, openDemFile(url, fetcher));
    return files.get(url)!;
  };
  const home = await fileAt(Math.floor(latitude), Math.floor(longitude));
  // The grid's step: the home file's at this level (files nearer the poles are narrower)
  const homeLevel = home?.levels[level];
  const dLat =
    home && homeLevel
      ? (home.dLat * home.levels[0].height) / homeLevel.height
      : (1 / 3600) * 2 ** level;
  const dLon = home && homeLevel ? (home.dLon * home.levels[0].width) / homeLevel.width : dLat;
  const halfLat = radiusM / M_PER_DEG;
  const halfLon = radiusM / (M_PER_DEG * Math.cos((latitude * Math.PI) / 180));
  const rows = Math.ceil((2 * halfLat) / dLat) + 1;
  const cols = Math.ceil((2 * halfLon) / dLon) + 1;
  const north = latitude + halfLat;
  const west = longitude - halfLon;
  const z = new Float32Array(rows * cols);

  // Which square of which file holds each cell
  const squares = new Map<string, { file: DemFile; index: number; cells: number[] }>();
  const openFiles = new Map<string, DemFile | null>();
  for (let r = 0; r < rows; r++) {
    const lat = Math.max(-89.9999, Math.min(89.9999, north - r * dLat));
    for (let c = 0; c < cols; c++) {
      let lon = west + c * dLon;
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;
      const latFloor = Math.floor(lat);
      const lonFloor = Math.floor(lon);
      const key = `${latFloor},${lonFloor}`;
      if (!openFiles.has(key)) openFiles.set(key, await fileAt(latFloor, lonFloor));
      const file = openFiles.get(key);
      const l = file?.levels[level];
      if (!file || !l) continue;
      const stepLon = (file.dLon * file.levels[0].width) / l.width;
      const stepLat = (file.dLat * file.levels[0].height) / l.height;
      const px = Math.min(l.width - 1, Math.max(0, Math.round((lon - file.west) / stepLon)));
      const py = Math.min(l.height - 1, Math.max(0, Math.round((file.north - lat) / stepLat)));
      const tx = Math.floor(px / l.tileWidth);
      const ty = Math.floor(py / l.tileHeight);
      const index = ty * Math.ceil(l.width / l.tileWidth) + tx;
      const squareKey = `${key}#${index}`;
      let square = squares.get(squareKey);
      if (!square) squares.set(squareKey, (square = { file, index, cells: [] }));
      square.cells.push(r * cols + c, (py % l.tileHeight) * l.tileWidth + (px % l.tileWidth));
    }
  }
  for (const { file, index, cells } of squares.values()) {
    const heights = await readDemTile(file, level, index, fetcher);
    for (let i = 0; i < cells.length; i += 2) z[cells[i]] = heights[cells[i + 1]];
  }
  return { north, west, dLat, dLon, rows, cols, z };
}

/** The height at a place inside a grid, between its four nearest cells. */
export function heightAt(grid: DemGrid, latitude: number, longitude: number): number {
  const y = (grid.north - latitude) / grid.dLat;
  const x = (longitude - grid.west) / grid.dLon;
  const r0 = Math.max(0, Math.min(grid.rows - 2, Math.floor(y)));
  const c0 = Math.max(0, Math.min(grid.cols - 2, Math.floor(x)));
  const fy = Math.max(0, Math.min(1, y - r0));
  const fx = Math.max(0, Math.min(1, x - c0));
  const at = (r: number, c: number) => grid.z[r * grid.cols + c];
  return (
    at(r0, c0) * (1 - fx) * (1 - fy) +
    at(r0, c0 + 1) * fx * (1 - fy) +
    at(r0 + 1, c0) * (1 - fx) * fy +
    at(r0 + 1, c0 + 1) * fx * fy
  );
}

/** Whether a place lies inside a grid. */
export function inGrid(grid: DemGrid, latitude: number, longitude: number): boolean {
  const y = (grid.north - latitude) / grid.dLat;
  const x = (longitude - grid.west) / grid.dLon;
  return y >= 0 && x >= 0 && y <= grid.rows - 1 && x <= grid.cols - 1;
}
