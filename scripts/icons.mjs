// Genera los íconos PNG de la PWA a partir de los SVG de icons/ (ADR 0027).
// Uso: npm run icons. Los PNG se suben al repo: solo hay que regenerarlos si cambia un SVG.

import { copyFile } from 'node:fs/promises';
import sharp from 'sharp';

const outputs = [
  // [SVG de origen, PNG de salida, tamaño en px]
  ['icons/icon.svg', 'public/pwa-192.png', 192],
  ['icons/icon.svg', 'public/pwa-512.png', 512],
  ['icons/icon-maskable.svg', 'public/maskable-512.png', 512],
  // iOS redondea las esquinas por su cuenta: necesita el fondo hasta el borde.
  ['icons/icon-maskable.svg', 'public/apple-touch-icon.png', 180],
  ['icons/shortcut-mic.svg', 'public/shortcut-mic-96.png', 96],
];

for (const [source, target, size] of outputs) {
  await sharp(source, { density: 300 }).resize(size, size).png().toFile(target);
  console.log(`${target} (${String(size)} px)`);
}

// El navegador de la compu usa el SVG directo como favicon: se ve nítido en cualquier tamaño.
await copyFile('icons/icon.svg', 'public/favicon.svg');
console.log('public/favicon.svg');
