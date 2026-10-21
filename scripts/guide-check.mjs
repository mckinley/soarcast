// Lists the Guide pages a change may have made wrong: the pages whose
// `covers` front matter names a file the change touches. It never fails.
// The writing rules and how to act on the list are in src/guide/README.md.
//
//   npm run guide:check            # this branch against origin/main, plus uncommitted files
//   npm run guide:check -- HEAD~3  # against another base

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PAGES_DIR = 'src/guide/pages';
const base = process.argv[2] ?? 'origin/main';

function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const changed = new Set([
  ...git('diff', '--name-only', `${base}...HEAD`),
  ...git('diff', '--name-only', 'HEAD'),
  ...git('ls-files', '--others', '--exclude-standard'),
]);

function covers(text) {
  const front = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
  const list = front.match(/^covers:\s*\n((?:\s+-\s+.+\n?)*)/m)?.[1] ?? '';
  return [...list.matchAll(/^\s+-\s+(.+)$/gm)].map((m) => m[1].trim());
}

const hits = [];
for (const name of readdirSync(PAGES_DIR).filter((n) => n.endsWith('.md'))) {
  const file = path.posix.join(PAGES_DIR, name);
  const touched = covers(readFileSync(file, 'utf8')).filter((c) =>
    [...changed].some((f) => f === c || f.startsWith(c.endsWith('/') ? c : `${c}/`)),
  );
  if (touched.length || changed.has(file)) hits.push({ file, touched });
}

console.log(`${changed.size} files changed against ${base}.`);
if (hits.length === 0) {
  console.log('No Guide page covers them.');
} else {
  console.log('Read these Guide pages in full and fix anything the change made wrong:');
  for (const { file, touched } of hits) {
    console.log(`  ${file}${touched.length ? `  (covers ${touched.join(', ')})` : '  (changed)'}`);
  }
}
console.log(
  'Also ask: does the change add something a pilot would need explained, or remove something a page describes?',
);
