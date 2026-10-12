// Small canvas helpers shared by every drawing.

export const D2R = Math.PI / 180;

/** `0xRRGGBB` to a CSS colour. */
export const rgb = (hex, a = 1) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

export const clear = 'rgba(0,0,0,0)';

export function ellipse(x, y, w, h) {
  const p = new Path2D();
  p.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  return p;
}

export function rrect(x, y, w, h, r) {
  const p = new Path2D();
  if (w <= 0 || h <= 0) return p;
  p.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  return p;
}

export function rect(x, y, w, h) {
  const p = new Path2D();
  p.rect(x, y, w, h);
  return p;
}

/** A gradient with its colours spread evenly from (x0, y0) to (x1, y1). */
export function linear(ctx, x0, y0, x1, y1, colors) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
  return g;
}

export const vertical = (ctx, top, bottom, y0, y1) => linear(ctx, 0, y0, 0, y1, [top, bottom]);

export function radial(ctx, cx, cy, r, colors) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
  return g;
}

/** A soft glow around whatever is drawn next. Canvas blur ignores the transform, so scale it here. */
export function glow(ctx, color, radius) {
  const m = ctx.getTransform();
  ctx.shadowColor = color;
  ctx.shadowBlur = radius * 2 * Math.hypot(m.a, m.b);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function noGlow(ctx) {
  ctx.shadowColor = clear;
  ctx.shadowBlur = 0;
}

export function line(ctx, points, color, width, cap = 'round') {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.stroke();
}

export const FONT = 'ui-rounded, "SF Pro Rounded", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';

/** Canvas sized for the screen's pixel density. Returns the 2D context. */
export function fitCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

/** Seconds on a clock every window shares. */
export const now = () => Date.now() / 1000;
