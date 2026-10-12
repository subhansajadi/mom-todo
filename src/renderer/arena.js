import { fitCanvas } from './lib/draw.js';
import { drawArena, SIZE } from './lib/arena-art.js';
import { arenaState } from './lib/lap.js';

const canvas = document.getElementById('c');
let game = null;   // { start (ms), mirrored }
let last = 0;

function loop(ts) {
  if (!game) return;
  requestAnimationFrame(loop);
  if (ts - last < 1000 / 50 - 2) return;
  last = ts;
  const ctx = fitCanvas(canvas, SIZE.w, SIZE.h);
  drawArena(ctx, arenaState((Date.now() - game.start) / 1000), game.mirrored);
}

window.mom.on('start', ({ start, mirrored }) => {
  const wasRunning = !!game;
  game = { start, mirrored };
  canvas.classList.add('on');
  if (!wasRunning) requestAnimationFrame(loop);
});

window.mom.on('stop', () => {
  canvas.classList.remove('on');
  setTimeout(() => { if (!canvas.classList.contains('on')) game = null; }, 300);
});
