// The Rocket League car and ball, drawn in the strip beside MoM.
import { rgb, ellipse, rrect, rect, linear, radial, glow, clear } from './draw.js';
import * as Lap from './lap.js';

export const SIZE = { w: 560, h: 240 };
const groundY = SIZE.h - 8;
const nearX = SIZE.w - 70;

const screen = (p) => ({ x: nearX - p.x, y: groundY - p.y });

/** mirrored: true when the strip sits to MoM's right instead of its left. */
export function drawArena(ctx, s, mirrored) {
  ctx.save();
  if (mirrored) {
    ctx.translate(SIZE.w, 0);
    ctx.scale(-1, 1);
  }
  shadows(ctx, s);
  boostTrail(ctx, s.t);
  drawCar(ctx, s.car, s.t);
  const b = screen(s.ball);
  drawBall(ctx, b, s.ball.x / Lap.ballRadius + s.t * 0.6);
  ctx.restore();
}

function shadows(ctx, s) {
  const carLift = Math.min(1, (s.car.h - Lap.ride) / 150);
  const cx = nearX - s.car.u;
  const w = 74 * (1 - carLift * 0.5);
  ctx.fillStyle = `rgba(0,0,0,${0.2 * (1 - carLift * 0.7)})`;
  ctx.fill(ellipse(cx - w / 2, groundY - 3, w, 6));
  const ballLift = Math.min(1, (s.ball.y - Lap.ballRadius) / 180);
  const bw = 22 * (1 - ballLift * 0.5);
  ctx.fillStyle = `rgba(0,0,0,${0.14 * (1 - ballLift * 0.7)})`;
  ctx.fill(ellipse(nearX - s.ball.x - bw / 2, groundY - 2, bw, 4));
}

/** Fading puffs where the exhaust has been over the last few frames. */
function boostTrail(ctx, t) {
  for (let k = 6; k >= 1; k--) {
    const past = t - k * 0.035;
    if (past <= 0) continue;
    const c = Lap.car(past);
    if (!c.boost) continue;
    const p = screen(Lap.world(c, { x: -40, y: 0 }));
    const r = 6 - k * 0.6;
    const fade = 0.55 * (1 - k / 7);
    ctx.fillStyle = rgb(k < 3 ? 0xffc94d : 0xff7a1a, fade);
    ctx.fill(ellipse(p.x - r, p.y - r, r * 2, r * 2));
  }
}

// MARK: Car — an Octane in profile: chunky off-road wheels, flared fenders, tall rear wing.

function drawCar(ctx, c, t) {
  const sign = c.facing < 0 ? -1 : 1;
  const shown = sign * Math.max(0.22, Math.abs(c.facing));
  const p = screen({ x: c.u, y: c.h });
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(-shown, 1);          // lane +u runs to the screen's left
  ctx.rotate(-c.pitch);
  ctx.translate(0, Lap.ride);    // drawing origin is the ground under the car's middle
  octane(ctx, c.u / 10, c.boost, t);
  ctx.restore();
}

function poly(points, close = true) {
  const p = new Path2D();
  points.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  if (close) p.closePath();
  return p;
}

function octane(ctx, wheelAngle, boost, t) {
  const blue = rgb(0x2c86f5), blueLight = rgb(0x62aeff), blueDark = rgb(0x134fb3);
  const trim = rgb(0x10161f), chrome = rgb(0xc5cbd3);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  if (boost) {
    const flick = Math.abs(Math.sin(t * 40)) * 5;
    ctx.fillStyle = rgb(0xff7a1a);
    ctx.fill(poly([[-37, -21], [-56 - flick, -18], [-37, -15]]));
    ctx.fillStyle = rgb(0xffe27a);
    ctx.fill(poly([[-37, -19.5], [-47 - flick / 2, -18], [-37, -16.5]]));
  }

  // Rear wing on chrome stalks
  ctx.beginPath();
  ctx.moveTo(-27, -25); ctx.lineTo(-31, -40);
  ctx.moveTo(-22, -26); ctx.lineTo(-25, -40);
  ctx.strokeStyle = chrome;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  const wing = poly([[-45, -44], [-18, -41], [-19, -38], [-44, -39.5]]);
  ctx.fillStyle = linear(ctx, 0, -44, 0, -38, [blueLight, blue]);
  ctx.fill(wing);
  ctx.strokeStyle = trim;
  ctx.lineWidth = 0.7;
  ctx.stroke(wing);
  ctx.fillStyle = trim;
  ctx.fill(rrect(-46, -46, 3, 9, 1));

  // Hull
  const hull = new Path2D();
  hull.moveTo(-35, -13);
  hull.lineTo(-37, -23);
  hull.lineTo(-20, -26);
  hull.lineTo(-13, -34);
  hull.quadraticCurveTo(-5, -36, 3, -35);
  hull.lineTo(12, -26);
  hull.quadraticCurveTo(30, -24, 38, -20);
  hull.lineTo(38, -14);
  hull.lineTo(-33, -12);
  hull.closePath();
  ctx.fillStyle = linear(ctx, 0, -35, 0, -12, [blueLight, blue, blueDark]);
  ctx.fill(hull);

  // Red fuel tank and roof scoop
  ctx.fillStyle = rgb(0xe0302b);
  ctx.fill(rrect(-29, -30.5, 11, 5.5, 2.5));
  ctx.fillStyle = rgb(0xffffff, 0.45);
  ctx.fill(rrect(-27, -29.5, 5, 1.4, 0.7));
  ctx.fillStyle = chrome;
  ctx.fill(rrect(-6, -38.5, 10, 4, 1.5));
  ctx.fillStyle = trim;
  ctx.fill(rrect(2, -38, 2, 3, 0.5));

  // Side window and black trim lines
  ctx.fillStyle = rgb(0x121822);
  ctx.fill(poly([[-10, -32.5], [1.5, -33.3], [9.5, -26.5], [-15, -26]]));
  ctx.beginPath();
  ctx.moveTo(-1, -32); ctx.lineTo(5, -27);
  ctx.strokeStyle = rgb(0xffffff, 0.45);
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-24, -20); ctx.quadraticCurveTo(4, -23, 30, -19);
  ctx.moveTo(-33, -13); ctx.lineTo(37, -14);
  ctx.strokeStyle = trim;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Fenders flaring over the wheels
  const D = Math.PI / 180;
  for (const wx of [-22, 22]) {
    const fender = new Path2D();
    fender.arc(wx, -10, 14.5, 185 * D, 355 * D, false);
    fender.arc(wx, -10, 11.5, 355 * D, 185 * D, true);
    fender.closePath();
    ctx.fillStyle = linear(ctx, 0, -25, 0, -10, [blueLight, blueDark]);
    ctx.fill(fender);
    ctx.beginPath();
    ctx.arc(wx, -10, 14.5, 185 * D, 355 * D, false);
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Bull bar and headlights
  ctx.beginPath();
  ctx.moveTo(37, -22); ctx.lineTo(42, -18); ctx.lineTo(41, -11);
  ctx.moveTo(38, -15); ctx.lineTo(41.5, -15);
  ctx.strokeStyle = chrome;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.save();
  glow(ctx, rgb(0xfff3c4), 3);
  ctx.fillStyle = rgb(0xfff8e1);
  ctx.fill(ellipse(33.5, -20.5, 4.4, 4.4));
  ctx.fill(ellipse(35, -13.5, 2.6, 2.6));
  ctx.restore();

  for (const wx of [-22, 22]) wheel(ctx, wx, -10, wheelAngle);
}

function wheel(ctx, cx, cy, angle) {
  const r = 10;
  ctx.fillStyle = rgb(0x23252b);
  ctx.fill(ellipse(cx - r, cy - r, r * 2, r * 2));
  // Chunky tread blocks
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = angle + (i * Math.PI) / 6;
    ctx.moveTo(cx + Math.cos(a) * (r - 2.2), cy + Math.sin(a) * (r - 2.2));
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.strokeStyle = rgb(0x41444c);
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.fillStyle = rgb(0x15171b);
  ctx.fill(ellipse(cx - 6, cy - 6, 12, 12));
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = angle + (i * 2 * Math.PI) / 5;
    ctx.moveTo(cx + Math.cos(a) * 1.5, cy + Math.sin(a) * 1.5);
    ctx.lineTo(cx + Math.cos(a) * 5.6, cy + Math.sin(a) * 5.6);
  }
  ctx.strokeStyle = rgb(0xc0913f);
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.fillStyle = rgb(0xd5dae1);
  ctx.fill(ellipse(cx - 1.5, cy - 1.5, 3, 3));
}

// MARK: Ball — metal tread panels on one side, dark hex mesh on the other, framed by a rim, with an orange core light.

function drawBall(ctx, c, spin) {
  const r = Lap.ballRadius;
  const sphere = ellipse(c.x - r, c.y - r, r * 2, r * 2);
  ctx.save();
  ctx.clip(sphere);
  ctx.fillStyle = rgb(0x9aa4b1);
  ctx.fill(sphere);

  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(spin);

  // Dark mesh half with a hex dot pattern
  ctx.fillStyle = rgb(0x4f4e47);
  ctx.fill(rect(-r, -r, r * 1.05, r * 2));
  const dots = new Path2D();
  let row = 0;
  for (let y = -r + 1.2; y < r; y += 1.9, row++) {
    for (let x = -r + 1.2 + (row % 2 === 0 ? 0 : 1.1); x < 0.5; x += 2.2) {
      dots.moveTo(x + 0.5, y);
      dots.ellipse(x, y, 0.5, 0.5, 0, 0, Math.PI * 2);
    }
  }
  ctx.fillStyle = rgb(0x8b897d);
  ctx.fill(dots);

  // Metal half: rows of rounded tread bumps
  for (let k = 0; k < 5; k++) {
    const yy = -r + 1.8 + k * 4.6;
    for (let j = 0; j < 2; j++) {
      const xx = 2.5 + j * 4.8 + (k % 2 === 0 ? 0 : 2.2);
      const bump = rrect(xx, yy, 4, 3, 1.2);
      ctx.fillStyle = rgb(0xb9c3cf);
      ctx.fill(bump);
      ctx.strokeStyle = rgb(0x6a7584);
      ctx.lineWidth = 0.4;
      ctx.stroke(bump);
    }
  }

  // Rim between the halves and around the core
  ctx.beginPath();
  ctx.moveTo(0.8, -r); ctx.quadraticCurveTo(4, 0, 0.8, r);
  ctx.moveTo(-r, 6); ctx.quadraticCurveTo(-5, 4.5, 0.8, 7.5);
  ctx.strokeStyle = rgb(0xa8a08a);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'butt';
  ctx.stroke();

  const core = { x: -5, y: -4 };
  const bracket = new Path2D();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const rr = i % 2 === 0 ? 4.6 : 2;
    const x = core.x + Math.cos(a) * rr, y = core.y + Math.sin(a) * rr;
    if (i === 0) bracket.moveTo(x, y);
    else bracket.lineTo(x, y);
  }
  bracket.closePath();
  ctx.fillStyle = rgb(0xa7adb5);
  ctx.fill(bracket);
  ctx.save();
  glow(ctx, rgb(0xff7a1a), 3);
  ctx.fillStyle = rgb(0xffb13d);
  ctx.fill(ellipse(core.x - 1.8, core.y - 1.8, 3.6, 3.6));
  ctx.restore();
  ctx.restore();

  // Light from the top left
  ctx.fillStyle = radial(ctx, c.x - r * 0.4, c.y - r * 0.45, r * 1.6, ['rgba(255,255,255,0.4)', clear, 'rgba(0,0,0,0.45)']);
  ctx.fill(sphere);
  ctx.restore();
}
