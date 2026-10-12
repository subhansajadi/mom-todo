import { drawIcon } from './lib/robot-art.js';

// Used by scripts/make-icon.js.
window.renderIcon = () => {
  const large = document.createElement('canvas');
  large.width = large.height = 1024;
  drawIcon(large.getContext('2d'));
  const small = document.createElement('canvas');
  small.width = small.height = 256;
  const ctx = small.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(large, 0, 0, 256, 256);
  return { large: large.toDataURL('image/png'), small: small.toDataURL('image/png') };
};
