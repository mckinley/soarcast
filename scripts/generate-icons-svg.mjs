#!/usr/bin/env node

/**
 * Generate PWA icon SVGs for SoarCast
 * Creates SVG files that can be used directly or converted to PNG
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

function createIconSVG(size) {
  const radius = size * 0.15;
  const cloudSize = size * 0.5;
  const cloudX = size * 0.25;
  const cloudY = size * 0.3;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Rounded rectangle background -->
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bgGrad)"/>

  <!-- Cloud shape -->
  <g fill="white">
    <ellipse cx="${cloudX + cloudSize * 0.2}" cy="${cloudY + cloudSize * 0.3}" rx="${cloudSize * 0.15}" ry="${cloudSize * 0.15}"/>
    <ellipse cx="${cloudX + cloudSize * 0.5}" cy="${cloudY + cloudSize * 0.15}" rx="${cloudSize * 0.25}" ry="${cloudSize * 0.25}"/>
    <ellipse cx="${cloudX + cloudSize * 0.8}" cy="${cloudY + cloudSize * 0.3}" rx="${cloudSize * 0.15}" ry="${cloudSize * 0.15}"/>
    <ellipse cx="${cloudX + cloudSize * 0.5}" cy="${cloudY + cloudSize * 0.5}" rx="${cloudSize * 0.5}" ry="${cloudSize * 0.35}"/>
  </g>

  <!-- Wind lines -->
  <g stroke="white" stroke-width="${size * 0.015}" stroke-linecap="round" fill="none">
    <path d="M ${cloudX + cloudSize * 0.1},${cloudY + cloudSize * 0.7} Q ${cloudX + cloudSize * 0.5},${cloudY + cloudSize * 0.67} ${cloudX + cloudSize * 0.9},${cloudY + cloudSize * 0.7}"/>
    <path d="M ${cloudX + cloudSize * 0.1},${cloudY + cloudSize * 0.78} Q ${cloudX + cloudSize * 0.5},${cloudY + cloudSize * 0.75} ${cloudX + cloudSize * 0.9},${cloudY + cloudSize * 0.78}"/>
    <path d="M ${cloudX + cloudSize * 0.1},${cloudY + cloudSize * 0.86} Q ${cloudX + cloudSize * 0.5},${cloudY + cloudSize * 0.83} ${cloudX + cloudSize * 0.9},${cloudY + cloudSize * 0.86}"/>
  </g>
</svg>`;
}

// Generate SVG icons
console.log('Generating PWA icon SVGs...');

try {
  // 192x192 icon SVG
  fs.writeFileSync(path.join(publicDir, 'icon-192.svg'), createIconSVG(192));
  console.log('✓ Created icon-192.svg');

  // 512x512 icon SVG
  fs.writeFileSync(path.join(publicDir, 'icon-512.svg'), createIconSVG(512));
  console.log('✓ Created icon-512.svg');

  // Apple touch icon SVG (180x180)
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.svg'), createIconSVG(180));
  console.log('✓ Created apple-touch-icon.svg');

  // Favicon SVG (32x32)
  const faviconSVG = createIconSVG(32);
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSVG);
  console.log('✓ Created favicon.svg');

  // Also create a simple favicon.ico placeholder message
  console.log('\nNote: SVG icons created. For production, convert SVGs to PNG using:');
  console.log('  - Online tool: https://convertio.co/svg-png/');
  console.log('  - CLI: npm install -g sharp-cli && sharp input.svg -o output.png');
  console.log('\n✓ All PWA icon SVGs generated successfully!');
} catch (error) {
  console.error('Error generating icons:', error);
  process.exit(1);
}
