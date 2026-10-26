#!/usr/bin/env node

/**
 * Writes SoarCast's icons to public/: the cloud and wing mark
 * (src/components/logo.tsx) in white on a sky-blue square. Run it after
 * changing the mark.
 *
 *   node scripts/generate-icons-svg.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public');

const SKY = '#1f63d6';

function createIconSVG(size, { round = true, fill = 0.62 } = {}) {
  // The mark is drawn on a 24 unit square, centred on (12, 12.3)
  const k = (size * fill) / 24;
  const dx = size / 2 - 12 * k;
  const dy = size / 2 - 12.3 * k;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${round ? size * 0.22 : 0}" fill="${SKY}"/>
  <g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${k.toFixed(4)})" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.5 16.5H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
    <path d="M7.5 22.4C8.3 20.5 15.7 20.5 16.5 22.4"/>
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
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), createIconSVG(32, { fill: 0.8 }));
console.log('Wrote icon-192.svg, icon-512.svg, apple-touch-icon.svg and favicon.svg');
