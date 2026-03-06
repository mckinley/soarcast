#!/usr/bin/env node

/**
 * Generate PWA icons for SoarCast
 * Creates 192x192 and 512x512 PNG icons + favicon.ico
 */

import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background gradient (blue-500 to cyan-500)
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#3b82f6'); // blue-500
  gradient.addColorStop(1, '#06b6d4'); // cyan-600

  // Rounded rectangle background
  const radius = size * 0.15;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw cloud icon (simplified)
  const cloudSize = size * 0.5;
  const cloudX = size * 0.25;
  const cloudY = size * 0.3;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.02;

  // Cloud path
  ctx.beginPath();
  // Left bump
  ctx.arc(cloudX + cloudSize * 0.2, cloudY + cloudSize * 0.3, cloudSize * 0.15, Math.PI, 0, false);
  // Top middle bump
  ctx.arc(
    cloudX + cloudSize * 0.5,
    cloudY + cloudSize * 0.15,
    cloudSize * 0.25,
    Math.PI,
    0,
    false,
  );
  // Right bump
  ctx.arc(
    cloudX + cloudSize * 0.8,
    cloudY + cloudSize * 0.3,
    cloudSize * 0.15,
    Math.PI,
    0,
    false,
  );
  // Bottom
  ctx.lineTo(cloudX + cloudSize, cloudY + cloudSize * 0.5);
  ctx.arc(
    cloudX + cloudSize * 0.5,
    cloudY + cloudSize * 0.5,
    cloudSize * 0.5,
    0,
    Math.PI,
    false,
  );
  ctx.closePath();
  ctx.fill();

  // Add wind lines to indicate soaring
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.015;
  ctx.lineCap = 'round';

  // Three curved wind lines
  for (let i = 0; i < 3; i++) {
    const yOffset = cloudY + cloudSize * 0.7 + i * (size * 0.08);
    const xOffset = cloudX + cloudSize * 0.1;

    ctx.beginPath();
    ctx.moveTo(xOffset, yOffset);
    ctx.quadraticCurveTo(
      xOffset + cloudSize * 0.4,
      yOffset - size * 0.03,
      xOffset + cloudSize * 0.8,
      yOffset,
    );
    ctx.stroke();
  }

  return canvas;
}

// Generate icons
console.log('Generating PWA icons...');

try {
  // 192x192 icon
  const icon192 = createIcon(192);
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192.toBuffer('image/png'));
  console.log('✓ Created icon-192.png');

  // 512x512 icon
  const icon512 = createIcon(512);
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512.toBuffer('image/png'));
  console.log('✓ Created icon-512.png');

  // Apple touch icon (180x180)
  const appleIcon = createIcon(180);
  fs.writeFileSync(
    path.join(publicDir, 'apple-touch-icon.png'),
    appleIcon.toBuffer('image/png'),
  );
  console.log('✓ Created apple-touch-icon.png');

  // Favicon (32x32)
  const favicon = createIcon(32);
  fs.writeFileSync(path.join(publicDir, 'favicon.png'), favicon.toBuffer('image/png'));
  console.log('✓ Created favicon.png');

  console.log('\n✓ All PWA icons generated successfully!');
} catch (error) {
  console.error('Error generating icons:', error);
  process.exit(1);
}
