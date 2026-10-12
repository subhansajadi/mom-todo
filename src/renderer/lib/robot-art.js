// MoM drawn with vector shapes in a 100 x 104 box.
import { D2R, rgb, ellipse, rrect, rect, linear, vertical, radial, glow, noGlow, line, FONT } from './draw.js';

export const SIZE = { w: 100, h: 104 };
export const leftShoulder = { x: 32, y: 73 };
export const rightShoulder = { x: 68, y: 73 };
export const rightPod = { x: 84, y: 41 };
export const solderPad = { x: 44, y: 92 };
export const tubeHand = { x: 85, y: 60 };

const white = rgb(0xffffff);
const whiteShade = rgb(0xd5dde8);
const outline = (a) => rgb(0xb7c2d0, a);
const blueLight = rgb(0xb4d7fb);
const blue = rgb(0x74a9e8);
const blueDark = rgb(0x4f87cc);
const screenTop = rgb(0x262e3d);
const screenBottom = rgb(0x11151c);
const cyan = (a = 1) => rgb(0x86ecff, a);
const cyanDim = rgb(0x3e8ea6);
const metal = rgb(0xb8c0cc);

/**
 * One frame of MoM. Arm angles are degrees away from hanging straight down (negative swings inward).
 * eyes: open | blink | happy | closed | focused | wide
 * screen: { kind: 'eyes' } | { kind: 'loading', progress } | { kind: 'equalizer', t }
 * prop: { kind: 'none' | 'soldering' (dab) | 'wrench' (angle) | 'controller' (at) | 'book' | 'chemistry' (tube, poof) }
 * armLayer: back | front | top
 */
export function newPose(overrides = {}) {
  return {
    eyes: 'open',
    screen: { kind: 'eyes' },
    prop: { kind: 'none' },
    leftArm: 25,
    rightArm: 25,
    leftReach: 1,
    rightReach: 1,
    armLayer: 'back',
    antenna: 0,               // extra outward lean, degrees
    look: { x: 0, y: 0 },     // where the eyes point, each axis -1...1
    chest: 0x86ecff,
    dim: false,               // sleeping: the screen face glows less
    t: 0,                     // clock for sparks, smoke and bubbles
    ...overrides,
  };
}

/** Points an arm so its hand lands on `target`. */
export function reach(pose, left, target) {
  const s = left ? leftShoulder : rightShoulder;
  const vx = target.x - s.x, vy = target.y - s.y;
  const angle = Math.atan2(left ? -vx : vx, vy) / D2R;
  const length = Math.min(1.1, Math.max(0.45, (Math.hypot(vx, vy) + 5) / 25));
  if (left) {
    pose.leftArm = angle;
    pose.leftReach = length;
  } else {
    pose.rightArm = angle;
    pose.rightReach = length;
  }
}

export function drawRobot(ctx, p) {
  antennas(ctx, p);
  earPods(ctx);
  if (p.armLayer === 'back') arms(ctx, p);
  body(ctx, p);
  propsUnderHands(ctx, p);
  if (p.armLayer === 'front') arms(ctx, p);
  head(ctx);
  face(ctx, p);
  if (p.armLayer === 'top') arms(ctx, p);
  propsOverHands(ctx, p);
}

/** Repeatable pseudo-random number in 0..<1. */
function noise(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// MARK: Body parts

function antennas(ctx, p) {
  for (const [x, side] of [[16, -1], [84, 1]]) {
    ctx.save();
    ctx.translate(x, 35);
    ctx.rotate(side * (18 + p.antenna) * D2R);
    ctx.fillStyle = linear(ctx, -3, -22, 3, 0, [blueLight, blue]);
    ctx.fill(ellipse(-3.6, -22, 7.2, 23));
    ctx.fillStyle = rgb(0xffffff, 0.55);
    ctx.fill(ellipse(-1.7, -18.5, 2.2, 8));
    ctx.restore();
  }
}

function earPods(ctx) {
  for (const x of [16, 84]) {
    ctx.fillStyle = vertical(ctx, blueLight, blueDark, 33, 49);
    ctx.fill(ellipse(x - 5, 33, 10, 16));
    ctx.fillStyle = rgb(0xb4d7fb, 0.9);
    ctx.fill(ellipse(x - 2.2, 37, 4.4, 8));
  }
}

function arms(ctx, p) {
  arm(ctx, leftShoulder, p.leftArm, p.leftReach, true);
  arm(ctx, rightShoulder, p.rightArm, p.rightReach, false);
}

function arm(ctx, shoulder, angle, reachLen, left) {
  const a = angle * D2R;
  const dx = (left ? -1 : 1) * Math.sin(a), dy = Math.cos(a);
  ctx.save();
  ctx.translate(shoulder.x, shoulder.y);
  ctx.rotate(Math.atan2(dy, dx));
  const length = 25 * reachLen + 2;
  const limb = rrect(-2, -5.75, length, 11.5, 5.75);
  ctx.fillStyle = vertical(ctx, white, whiteShade, -5.75, 5.75);
  ctx.fill(limb);
  ctx.strokeStyle = outline(0.5);
  ctx.lineWidth = 0.6;
  ctx.stroke(limb);
  ctx.fillStyle = vertical(ctx, blueLight, blueDark, -5.75, 5.75);
  ctx.fill(rrect(-2, -5.75, Math.min(9, length * 0.4), 11.5, 4.5));
  ctx.restore();
}

function body(ctx, p) {
  const egg = ellipse(27, 56, 46, 47);
  ctx.fillStyle = vertical(ctx, white, whiteShade, 56, 103);
  ctx.fill(egg);
  ctx.strokeStyle = outline(0.5);
  ctx.lineWidth = 0.6;
  ctx.stroke(egg);

  // Blue chest band with a drip down the middle, clipped to the egg.
  ctx.save();
  ctx.clip(egg);
  const band = new Path2D();
  band.moveTo(25, 54);
  band.lineTo(75, 54);
  band.lineTo(75, 74);
  band.quadraticCurveTo(50, 81, 25, 74);
  band.closePath();
  ctx.fillStyle = vertical(ctx, blueLight, blue, 57, 86);
  ctx.fill(band);
  ctx.fill(rrect(46, 70, 8, 17, 4));
  ctx.restore();

  // Chest light
  ctx.save();
  glow(ctx, rgb(p.chest, 0.9), 4);
  ctx.fillStyle = rgb(p.chest);
  ctx.fill(ellipse(45, 63, 10, 10));
  ctx.restore();
  ctx.fillStyle = rgb(0xffffff, 0.75);
  ctx.fill(ellipse(47.5, 65.5, 5, 5));
}

function head(ctx) {
  const h = rrect(17, 16, 66, 46, 17);
  ctx.fillStyle = vertical(ctx, white, whiteShade, 16, 62);
  ctx.fill(h);
  ctx.strokeStyle = outline(0.6);
  ctx.lineWidth = 0.7;
  ctx.stroke(h);
}

// MARK: Screen face

function face(ctx, p) {
  const screen = rrect(25, 23, 50, 32, 10);
  ctx.fillStyle = vertical(ctx, screenTop, screenBottom, 23, 55);
  ctx.fill(screen);
  const ink = p.dim ? cyanDim : cyan();

  ctx.save();
  ctx.clip(screen);
  if (p.screen.kind === 'loading') loading(ctx, p.screen.progress, p.t);
  else if (p.screen.kind === 'equalizer') equalizer(ctx, p.screen.t);
  else eyes(ctx, p, ink);
  ctx.restore();

  // Corner brackets
  ctx.beginPath();
  for (const [x, y, dx, dy] of [[30, 28, 1, 1], [70, 28, -1, 1], [30, 50, 1, -1], [70, 50, -1, -1]]) {
    ctx.moveTo(x + 4 * dx, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + 4 * dy);
  }
  ctx.strokeStyle = p.dim ? rgb(0x3e8ea6, 0.75) : cyan(0.75);
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function eyes(ctx, p, ink) {
  ctx.save();
  if (!p.dim) glow(ctx, cyan(0.85), 3);
  const dx = p.look.x * 3, dy = p.look.y * 2.5;
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  for (const cx of [40, 60]) {
    const c = { x: cx + dx, y: 39 + dy };
    switch (p.eyes) {
      case 'wide':
        ctx.fill(ellipse(c.x - 5.5, c.y - 6.5, 11, 13));
        break;
      case 'focused':
        ctx.fill(rrect(c.x - 5, c.y - 2.2, 10, 4.4, 2.2));
        break;
      case 'blink':
        ctx.fill(rrect(c.x - 5, c.y - 1.2, 10, 2.4, 1.2));
        break;
      case 'happy':
        ctx.beginPath();
        ctx.moveTo(c.x - 5, c.y + 2.5);
        ctx.quadraticCurveTo(c.x, c.y - 7, c.x + 5, c.y + 2.5);
        ctx.lineWidth = 3;
        ctx.stroke();
        break;
      case 'closed':
        ctx.beginPath();
        ctx.moveTo(c.x - 4.5, c.y + 1);
        ctx.quadraticCurveTo(c.x, c.y + 5, c.x + 4.5, c.y + 1);
        ctx.lineWidth = 2.2;
        ctx.stroke();
        break;
      default:
        ctx.fill(ellipse(c.x - 4.5, c.y - 5.5, 9, 11));
    }
  }
  ctx.restore();
}

/** Self-repair: a spinning gear and a progress bar. */
function loading(ctx, progress, t) {
  ctx.save();
  glow(ctx, cyan(0.8), 2.5);
  ctx.save();
  ctx.translate(50, 36);
  ctx.rotate(t * 2.5);
  const gear = new Path2D();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    const r = Math.floor(i / 2) % 2 === 0 ? 7.5 : 5.5;
    if (i === 0) gear.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else gear.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  gear.closePath();
  gear.ellipse(0, 0, 2.5, 2.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = cyan();
  ctx.fill(gear, 'evenodd');
  ctx.restore();
  ctx.strokeStyle = cyan(0.6);
  ctx.lineWidth = 0.8;
  ctx.stroke(rrect(34, 47, 32, 3.6, 1.8));
  ctx.fillStyle = cyan();
  ctx.fill(rrect(34.8, 47.8, 30.4 * progress, 2, 1));
  ctx.restore();
}

function equalizer(ctx, t) {
  ctx.save();
  glow(ctx, cyan(0.85), 3);
  ctx.fillStyle = cyan();
  for (let i = 0; i < 5; i++) {
    const h = 4 + 15 * Math.abs(Math.sin(t * 6.9 + i * 1.3));
    const x = 35 + i * 7.5;
    ctx.fill(rrect(x - 2.3, 50 - h, 4.6, h, 1.6));
  }
  ctx.restore();
}

// MARK: Props

function propsUnderHands(ctx, p) {
  if (p.prop.kind === 'soldering') pcb(ctx);
  else if (p.prop.kind === 'book') book(ctx);
  else if (p.prop.kind === 'chemistry') flask(ctx, p.t);
}

function propsOverHands(ctx, p) {
  const prop = p.prop;
  if (prop.kind === 'soldering') iron(ctx, prop.dab, p.t);
  else if (prop.kind === 'wrench') wrench(ctx, prop.angle, p.t);
  else if (prop.kind === 'controller') controller(ctx, prop.at);
  else if (prop.kind === 'chemistry') {
    testTube(ctx, prop.tube);
    if (prop.poof != null) smokePuff(ctx, { x: 33, y: 74 }, prop.poof);
  }
}

export const ironTip = (dab) => ({ x: solderPad.x, y: solderPad.y - 3 * dab });
const ironDirection = { x: 0.67, y: -0.74 };

export function ironGrip(dab) {
  const tip = ironTip(dab);
  return { x: tip.x + ironDirection.x * 16, y: tip.y + ironDirection.y * 16 };
}

function pcb(ctx) {
  const board = rrect(33, 85, 30, 13, 2);
  ctx.fillStyle = rgb(0x1f7a4c);
  ctx.fill(board);
  ctx.strokeStyle = rgb(0x125a36);
  ctx.lineWidth = 0.8;
  ctx.stroke(board);
  const gold = 0xe6c15a;
  ctx.beginPath();
  ctx.moveTo(38, 89); ctx.lineTo(47, 89);
  ctx.moveTo(44, 92); ctx.lineTo(44, 95); ctx.lineTo(58, 95);
  ctx.strokeStyle = rgb(gold, 0.55);
  ctx.lineWidth = 0.7;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.fillStyle = rgb(0x1c1f24);
  ctx.fill(rrect(49, 87, 9, 6, 1));
  ctx.fillStyle = rgb(gold);
  for (const [x, y] of [[38, 89], [44, 92], [38, 94], [58, 95]]) ctx.fill(ellipse(x - 1.3, y - 1.3, 2.6, 2.6));
}

function iron(ctx, dab, t) {
  const tip = ironTip(dab);
  const u = ironDirection;
  const along = (d) => [tip.x + u.x * d, tip.y + u.y * d];
  line(ctx, [[tip.x, tip.y], along(7)], metal, 1.5);
  line(ctx, [along(7), along(20)], rgb(0x3a4352), 4.4);
  line(ctx, [along(8.5), along(10)], rgb(0xff8a2a), 4.6, 'butt');

  // Smoke curls up from the joint the whole time; sparks fly when the tip touches down.
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.55 + i / 3) % 1;
    const r = 1.2 + ph * 3;
    const cx = tip.x + Math.sin(ph * 6 + i) * 3, cy = tip.y - ph * 24;
    ctx.fillStyle = rgb(0xc9ced6, 0.4 * (1 - ph));
    ctx.fill(ellipse(cx - r, cy - r, r * 2, r * 2));
  }
  if (dab < 0.2) sparks(ctx, tip, Math.floor(t * 14));
}

function sparks(ctx, c, seed) {
  ctx.save();
  glow(ctx, rgb(0xffd27a), 2);
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = noise(seed * 7 + i) * 2 * Math.PI;
    const r0 = 1.5 + noise(seed * 13 + i) * 2;
    const len = 2 + noise(seed * 3 + i) * 4;
    ctx.beginPath();
    ctx.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0);
    ctx.lineTo(c.x + Math.cos(a) * (r0 + len), c.y + Math.sin(a) * (r0 + len));
    ctx.strokeStyle = i % 2 === 0 ? rgb(0xffe27a) : white;
    ctx.stroke();
  }
  ctx.restore();
}

export function wrenchGrip(angle) {
  const a = angle * D2R;
  const lx = -5, ly = 17;
  return { x: rightPod.x + lx * Math.cos(a) - ly * Math.sin(a), y: rightPod.y + lx * Math.sin(a) + ly * Math.cos(a) };
}

function wrench(ctx, angle, t) {
  ctx.save();
  ctx.translate(rightPod.x, rightPod.y);
  ctx.rotate(angle * D2R);
  line(ctx, [[-1.5, 5], [-6, 20]], metal, 3.6);
  ctx.beginPath();
  ctx.arc(0, 0, 5, -40 * D2R, 220 * D2R, false);
  ctx.strokeStyle = metal;
  ctx.lineWidth = 2.8;
  ctx.stroke();
  ctx.restore();
  if (Math.abs(Math.sin(t * 5)) > 0.96) sparks(ctx, { x: rightPod.x + 3, y: rightPod.y - 6 }, Math.floor(t * 10));
}

function controller(ctx, c) {
  ctx.fillStyle = vertical(ctx, rgb(0x3a3f4b), rgb(0x1e2128), c.y - 6, c.y + 8);
  ctx.fill(rrect(c.x - 13, c.y - 5.5, 26, 10, 5));
  ctx.fill(ellipse(c.x - 15, c.y - 3, 10, 11));
  ctx.fill(ellipse(c.x + 5, c.y - 3, 10, 11));
  ctx.fillStyle = rgb(0x8a93a3);
  for (const x of [c.x - 3.5, c.x + 3.5]) ctx.fill(ellipse(x - 1.7, c.y + 0.3, 3.4, 3.4));
  ctx.fillStyle = rgb(0xc9ced6);
  ctx.fill(rect(c.x - 9.6, c.y - 2.4, 3.2, 1.2));
  ctx.fill(rect(c.x - 8.6, c.y - 3.4, 1.2, 3.2));
  for (const [dx, dy, hex] of [[8, -3.4, 0xffd34e], [10, -1.6, 0xff6b6b], [6, -1.6, 0x4fa3ff], [8, 0.2, 0x6bd36b]]) {
    ctx.fillStyle = rgb(hex);
    ctx.fill(ellipse(c.x + dx - 0.9, c.y + dy - 0.9, 1.8, 1.8));
  }
}

function book(ctx) {
  ctx.fillStyle = rgb(0xfff6e0);
  ctx.fill(rrect(37, 74, 26, 4, 1));
  ctx.fillStyle = vertical(ctx, rgb(0xf2b34a), rgb(0xd98e2b), 76, 97);
  ctx.fill(rrect(35, 76, 30, 21, 2.5));
  ctx.fillStyle = rgb(0xb8741f);
  ctx.fill(rrect(35, 76, 4, 21, 2));
  ctx.fillStyle = rgb(0xffffff, 0.92);
  ctx.font = `900 6.5px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MTE', 52, 83.5);
  ctx.fillStyle = rgb(0xffffff, 0.6);
  ctx.fill(rrect(45, 88.5, 14, 1.4, 0.7));
}

function flask(ctx, t) {
  const glass = new Path2D();
  glass.moveTo(30.8, 78);
  glass.lineTo(30.8, 86);
  glass.lineTo(23.5, 98);
  glass.quadraticCurveTo(33, 102, 42.5, 98);
  glass.lineTo(35.2, 86);
  glass.lineTo(35.2, 78);
  glass.closePath();
  ctx.fillStyle = rgb(0xffffff, 0.25);
  ctx.fill(glass);
  ctx.save();
  ctx.clip(glass);
  ctx.fillStyle = vertical(ctx, rgb(0xf2b84b), rgb(0xd98e2b), 91, 101);
  ctx.fill(rect(20, 91, 26, 12));
  ctx.restore();
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.8 + i * 0.25) % 1;
    const y = 97 - ph * 17;
    const x = 33 + Math.sin(ph * 9 + i) * 1.6;
    const r = 0.7 + ph * 0.6;
    ctx.fillStyle = rgb(0xffffff, 0.8 * (1 - ph));
    ctx.fill(ellipse(x - r, y - r, r * 2, r * 2));
  }
  ctx.strokeStyle = rgb(0xffffff, 0.9);
  ctx.lineWidth = 0.8;
  ctx.stroke(glass);
  ctx.fillStyle = rgb(0xffffff, 0.9);
  ctx.fill(rrect(29.8, 77, 6.4, 2, 1));
}

function testTube(ctx, angle) {
  ctx.save();
  ctx.translate(tubeHand.x, tubeHand.y);
  ctx.rotate(angle * D2R);
  const tube = rrect(-2.6, -14, 5.2, 18, 2.6);
  ctx.fillStyle = rgb(0xffffff, 0.25);
  ctx.fill(tube);
  ctx.save();
  ctx.clip(tube);
  ctx.fillStyle = rgb(0x5fd068);
  ctx.fill(rect(-3, -4, 6, 9));
  ctx.restore();
  ctx.strokeStyle = rgb(0xffffff, 0.95);
  ctx.lineWidth = 0.7;
  ctx.stroke(tube);
  ctx.fillStyle = rgb(0xffffff, 0.9);
  ctx.fill(rrect(-3.4, -14.6, 6.8, 1.6, 0.8));
  ctx.restore();
}

function smokePuff(ctx, c, s) {
  for (const [dx, dy, k] of [[-3, 0, 1], [3, -2, 0.85], [0, -6, 1.15]]) {
    const r = (3 + s * 7) * k;
    const x = c.x + dx * (1 + s), y = c.y + dy * (1 + s) - s * 8;
    ctx.fillStyle = rgb(0xd5dae1, 0.75 * (1 - s));
    ctx.fill(ellipse(x - r, y - r, r * 2, r * 2));
  }
}

// MARK: App icon

/** The app icon: MoM cheering on a red tile. Draws into a 1024 x 1024 canvas. */
export function drawIcon(ctx) {
  ctx.fillStyle = vertical(ctx, rgb(0xd8262e), rgb(0x8e0f15), 100, 924);
  ctx.fill(rrect(100, 100, 824, 824, 185));

  const art = document.createElement('canvas');
  art.width = 1024;
  art.height = 1024;
  const a = art.getContext('2d');
  a.translate(512, 522);
  a.scale(6.2, 6.2);
  a.translate(-50, -52);
  drawRobot(a, newPose({ eyes: 'happy', leftArm: 112, rightArm: 112 }));

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 14;
  ctx.drawImage(art, 0, 0);
  ctx.restore();
}

export { noGlow, radial };
