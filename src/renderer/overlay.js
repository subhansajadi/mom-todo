// A click-through, screen-sized layer: confetti bursts and MoM's disco ball.
import { rgb, ellipse, rrect, rect, radial, linear, fitCanvas, clear } from './lib/draw.js';

const canvas = document.getElementById('c');
const palette = [0xd97757, 0x6bbf59, 0xffd34e, 0x8b6cff, 0xff6b9a, 0x4fc3f7, 0xffa94d];
const discoColors = [0xff4fa3, 0x4fd8ff, 0xffd34e, 0x8b6cff, 0x6beb8a, 0xff8a3d];

let bursts = [];
let disco = null;
let running = false;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const seconds = () => performance.now() / 1000;

function randomShape() {
  const r = Math.floor(Math.random() * 10);
  return r < 6 ? 0 : r < 8 ? 1 : 2;   // ribbons, dots, stars
}

/** Shoots confetti upward from a point. */
function burst({ x, y, count = 70, power = 1 }) {
  const particles = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + rand(-0.85, 0.85);
    const speed = rand(380, 950) * power;
    return {
      x0: x, y0: y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      drag: 2.4,                // how quickly the launch speed bleeds off
      fall: rand(110, 200),     // terminal falling speed
      delay: rand(0, 0.08), life: rand(2.6, 3.6),
      size: rand(7, 12), color: rgb(palette[Math.floor(Math.random() * palette.length)]),
      shape: randomShape(),
      rot0: rand(0, 6.28), spin: rand(-9, 9), flip: rand(4, 12),
      wobble: rand(0, 14), wobbleSpeed: rand(2, 6),
    };
  });
  bursts.push({ start: seconds(), particles });
  run();
}

function shapePath(shape, s) {
  if (shape === 1) return ellipse(-s * 0.3, -s * 0.3, s * 0.6, s * 0.6);
  if (shape === 2) {
    const p = new Path2D();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? s * 0.6 : s * 0.25;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else p.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    p.closePath();
    return p;
  }
  return rect(-s / 2, -s / 5, s, s * 0.4);
}

function drawConfetti(ctx, w, h, t) {
  for (const b of bursts) {
    const elapsed = t - b.start;
    for (const p of b.particles) {
      const tt = elapsed - p.delay;
      if (tt <= 0 || tt >= p.life) continue;
      // Velocity decays from its launch value toward a gentle fall.
      const e = (1 - Math.exp(-p.drag * tt)) / p.drag;
      const x = p.x0 + p.vx * e + Math.sin(tt * p.wobbleSpeed) * p.wobble;
      const y = p.y0 + p.fall * tt + (p.vy - p.fall) * e;
      if (y > h + 30) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (p.life - tt) / 0.6);
      ctx.translate(x, y);
      ctx.rotate(p.rot0 + p.spin * tt);
      ctx.scale(Math.cos(tt * p.flip), 1);
      ctx.fillStyle = p.color;
      ctx.fill(shapePath(p.shape, p.size));
      ctx.restore();
    }
  }
  bursts = bursts.filter((b) => t - b.start < 4);
}

/** A disco ball that drops in on a string, spins its lights over the screen, then rises away. */
function drawDisco(ctx, w, h, t) {
  const radius = 52;
  const d = disco;
  const e = t - d.start;
  const enter = Math.min(1, e / 1.4);
  const exit = Math.max(0, Math.min(1, (e - (d.duration - 1.1)) / 1.1));
  // Drops in with a little overshoot, then rises back out.
  const settle = 1 - Math.pow(1 - enter, 3) + Math.sin(enter * Math.PI) * 0.08;
  const top = -radius - 10;
  const c = { x: d.x, y: top + (d.drop - top) * settle * (1 - exit * exit) };
  const lights = Math.min(1, Math.max(0, (e - 1.0) / 0.6)) * (1 - exit);

  // Coloured spots drifting across the whole screen
  if (lights > 0) {
    for (let i = 0; i < 14; i++) {
      const px = w * (0.5 + 0.47 * Math.sin(e * (0.35 + i * 0.031) + i * 2.1));
      const py = h * (0.5 + 0.47 * Math.sin(e * (0.29 + i * 0.027) + i * 1.3));
      const r = 40 + ((i * 37) % 60);
      ctx.fillStyle = radial(ctx, px, py, r, [rgb(discoColors[i % 6], 0.42 * lights), clear]);
      ctx.fill(ellipse(px - r, py - r, r * 2, r * 2));
    }
    // Beams turning around the ball
    const reach = Math.hypot(w, h);
    for (let i = 0; i < 10; i++) {
      const a = e * 0.5 + (i / 10) * 2 * Math.PI;
      const beam = new Path2D();
      beam.moveTo(c.x, c.y);
      beam.lineTo(c.x + Math.cos(a - 0.025) * reach, c.y + Math.sin(a - 0.025) * reach);
      beam.lineTo(c.x + Math.cos(a + 0.025) * reach, c.y + Math.sin(a + 0.025) * reach);
      beam.closePath();
      ctx.fillStyle = linear(ctx, c.x, c.y, c.x + Math.cos(a) * 700, c.y + Math.sin(a) * 700,
        [rgb(discoColors[i % 6], 0.3 * lights), clear]);
      ctx.fill(beam);
    }
  }

  // String and cap
  ctx.beginPath();
  ctx.moveTo(c.x, 0);
  ctx.lineTo(c.x, c.y - radius);
  ctx.strokeStyle = rgb(0x9aa3af);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = rgb(0x8a93a0);
  ctx.fill(rrect(c.x - 6, c.y - radius - 6, 12, 8, 2));

  // Mirrored facets that slide sideways as the ball turns
  const ball = ellipse(c.x - radius, c.y - radius, radius * 2, radius * 2);
  ctx.save();
  ctx.clip(ball);
  const cell = 9;
  const shift = (e * 9) % cell;
  const turn = Math.floor((e * 9) / cell);
  const n = Math.floor((radius * 2) / cell) + 1;
  for (let row = 0; row < n; row++) {
    for (let col = -1; col < n; col++) {
      const seed = (col - turn) * 31 + row * 17;
      const level = 0.55 + 0.4 * Math.sin(e * 4 + seed);
      const g = Math.round(level * 255);
      ctx.fillStyle = Math.abs(seed) % 9 === 0 ? rgb(discoColors[Math.abs(seed) % 6], 0.9) : `rgb(${g},${g},${g})`;
      ctx.fill(rect(c.x - radius + col * cell + shift, c.y - radius + row * cell, cell - 0.9, cell - 0.9));
    }
  }
  ctx.fillStyle = radial(ctx, c.x - radius * 0.35, c.y - radius * 0.4, radius * 1.5,
    ['rgba(255,255,255,0.35)', clear, 'rgba(0,0,0,0.5)']);
  ctx.fill(ball);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke(ball);

  // Twinkles on the surface
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) {
    const ph = (e * 0.9 + i / 3) % 1;
    const a = i * 2.3 + Math.floor(e * 0.9 + i / 3) * 1.7;
    const px = c.x + Math.cos(a) * radius * 0.55, py = c.y + Math.sin(a) * radius * 0.55;
    const s = Math.sin(ph * Math.PI) * 9;
    const star = new Path2D();
    star.moveTo(px, py - s); star.lineTo(px + s * 0.22, py); star.lineTo(px, py + s); star.lineTo(px - s * 0.22, py); star.closePath();
    star.moveTo(px - s, py); star.lineTo(px, py + s * 0.22); star.lineTo(px + s, py); star.lineTo(px, py - s * 0.22); star.closePath();
    ctx.fill(star);
  }

  if (e > d.duration) disco = null;
}

function frame() {
  const w = window.innerWidth, h = window.innerHeight;
  const ctx = fitCanvas(canvas, w, h);
  const t = seconds();
  if (disco) drawDisco(ctx, w, h, t);
  drawConfetti(ctx, w, h, t);
  if (bursts.length || disco) {
    requestAnimationFrame(frame);
  } else {
    running = false;
  }
}

function run() {
  if (running) return;
  running = true;
  requestAnimationFrame(frame);
}

window.mom.on('burst', burst);
window.mom.on('disco', ({ x, drop, duration }) => {
  disco = { start: seconds(), x, drop, duration };
  run();
});
window.mom.on('clear', () => {
  bursts = [];
  disco = null;
  fitCanvas(canvas, window.innerWidth, window.innerHeight);
});
