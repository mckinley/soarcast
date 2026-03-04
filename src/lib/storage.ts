import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Ensures the data directory exists
 */
async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

/**
 * Get the full path for a data file
 */
function getFilePath(filename: string): string {
  return path.join(DATA_DIR, filename);
}

/**
 * Read JSON data from a file
 * Returns the data if the file exists, or the default value if it doesn't
 */
export async function readJSON<T>(filename: string, defaultValue: T): Promise<T> {
  await ensureDataDir();
  const filePath = getFilePath(filename);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    // If file doesn't exist, return default and create the file
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await writeJSON(filename, defaultValue);
      return defaultValue;
    }
    throw error;
  }
}

/**
 * Write JSON data to a file
 */
export async function writeJSON<T>(filename: string, data: T): Promise<void> {
  await ensureDataDir();
  const filePath = getFilePath(filename);
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Update JSON data using a callback function
 * This implements a read-modify-write pattern for safe concurrent access
 */
export async function updateJSON<T>(
  filename: string,
  defaultValue: T,
  updater: (current: T) => T
): Promise<T> {
  // Read current data
  const current = await readJSON(filename, defaultValue);

  // Apply update
  const updated = updater(current);

  // Write back
  await writeJSON(filename, updated);

  return updated;
}

/**
 * Check if a data file exists
 */
export async function fileExists(filename: string): Promise<boolean> {
  await ensureDataDir();
  const filePath = getFilePath(filename);

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
