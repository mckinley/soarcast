// The ERA5 reader's WebAssembly (@openmeteo/file-format-wasm) asks for a
// fixed 64 MB of memory, half of what a Worker may use, and the season build
// ran out of memory with it. A read needs under 4 MB (6 reads at once), so
// this writes a copy of the module that asks for SHRUNK_PAGES (16 MB)
// instead, which om-wasm.ts loads. The memory can't grow: the reader keeps
// its first view of it. jobs/wrangler.toml runs this before each build, from
// the repository root.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** 64 KB pages: 16 MB */
const SHRUNK_PAGES = 256;

const from = fileURLToPath(
  new URL('../node_modules/@openmeteo/file-format-wasm/dist/om_file_format.web.wasm', import.meta.url),
);
const to = fileURLToPath(new URL('./.build/om_file_format.wasm', import.meta.url));

const wasm = fs.readFileSync(from);

function readLeb(at) {
  let value = 0;
  let shift = 0;
  let byte;
  do {
    byte = wasm[at++];
    value += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while (byte & 0x80);
  return { value, at };
}

function leb(n) {
  const out = [];
  do {
    let byte = n & 0x7f;
    n = Math.floor(n / 128);
    if (n) byte |= 0x80;
    out.push(byte);
  } while (n);
  return out;
}

// A module is an 8-byte header, then sections: an id byte, a size, the body.
// Section 5 lists memories: here one, flags 1 (a minimum and a maximum).
const parts = [wasm.subarray(0, 8)];
let memories = 0;
for (let at = 8; at < wasm.length; ) {
  const id = wasm[at];
  const size = readLeb(at + 1);
  const end = size.at + size.value;
  if (id === 5) {
    const count = readLeb(size.at);
    const flags = wasm[count.at];
    const min = readLeb(count.at + 1);
    if (count.value !== 1 || flags !== 1 || min.value < SHRUNK_PAGES)
      throw new Error(`Unexpected memory section: ${count.value} memories, flags ${flags}`);
    const body = Buffer.from([1, 1, ...leb(SHRUNK_PAGES), ...leb(SHRUNK_PAGES)]);
    parts.push(Buffer.from([5, ...leb(body.length)]), body);
    memories++;
  } else {
    parts.push(wasm.subarray(at, end));
  }
  at = end;
}
if (memories !== 1) throw new Error('No memory section in the ERA5 reader');

fs.mkdirSync(fileURLToPath(new URL('./.build/', import.meta.url)), { recursive: true });
fs.writeFileSync(to, Buffer.concat(parts));
console.log(`ERA5 reader: memory set to ${(SHRUNK_PAGES * 65536) / 2 ** 20} MB`);
