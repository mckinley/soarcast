#!/usr/bin/env node

/**
 * Writes SoarCast's icons to public/: the wing mark (src/components/logo.tsx)
 * in white on a sky-blue square. Run it after changing the mark.
 *
 *   node scripts/generate-icons-svg.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public');

const SKY = '#1f63d6';

function createIconSVG(size, { round = true, fill = 0.6 } = {}) {
  // The mark is drawn on a 32 unit square, centred on (16, 18)
  const k = (size * fill) / 32;
  const dx = size / 2 - 16 * k;
  const dy = size / 2 - 18 * k;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${round ? size * 0.22 : 0}" fill="${SKY}"/>
  <g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${k.toFixed(4)})" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 13.5C8.5 7.3 23.5 7.3 28 13.5" stroke-width="4"/>
    <path d="M6.8 14.6L16 25L25.2 14.6" stroke-width="1.6"/>
    <circle cx="16" cy="26.4" r="2.3" fill="#ffffff" stroke="none"/>
  </g>
</svg>
`;
}

// Maskable icons fill the square: the phone rounds it itself
fs.writeFileSync(path.join(publicDir, 'icon-192.svg'), createIconSVG(192, { round: false }));
fs.writeFileSync(path.join(publicDir, 'icon-512.svg'), createIconSVG(512, { round: false }));
fs.writeFileSync(
  path.join(publicDir, 'apple-touch-icon.svg'),
  createIconSVG(180, { round: false }),
);
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), createIconSVG(32, { fill: 0.76 }));
console.log('Wrote icon-192.svg, icon-512.svg, apple-touch-icon.svg and favicon.svg');
