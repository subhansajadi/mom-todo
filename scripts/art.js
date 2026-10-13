// Draws the app icon, the README banner and the macOS installer background. Used by make-art.js.
import { drawIcon, drawRobot, newPose } from '../src/renderer/lib/robot-art.js';
import { rgb, ellipse, linear, vertical } from '../src/renderer/lib/draw.js';

const FONT = '-apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif';
const LOGO_ASPECT = 231 / 147;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** MCU red with a halftone of dots that grow toward the bottom right, like MCU's profile picture. */
function mcuBackground(ctx, w, h) {
  ctx.fillStyle = linear(ctx, 0, 0, w, h, [rgb(0xd40000), rgb(0xa80000), rgb(0x6e0000)]);
  ctx.fillRect(0, 0, w, h);
  const step = 26;
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      const k = Math.max(0, (x / w + y / h) / 2 - 0.25);
      const r = Math.min(step * 0.42, k * step * 0.55 + Math.sin(x * 0.013 + y * 0.021) * 1.5);
      if (r <= 0.6) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fill(ellipse(x - r, y - r, r * 2, r * 2));
    }
  }
}

/** MoM drawn big with a soft drop shadow: its 100 x 104 box scaled by `scale`, feet at (cx, bottom). */
function bigRobot(ctx, cx, bottom, scale, pose) {
  const art = canvas(ctx.canvas.width, ctx.canvas.height);
  const a = art.getContext('2d');
  a.translate(cx, bottom);
  a.scale(scale, scale);
  a.translate(-50, -104);
  drawRobot(a, pose);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8 * scale;
  ctx.shadowOffsetY = 3 * scale;
  ctx.drawImage(art, 0, 0);
  ctx.restore();
}

/** The README header: MCU logo, MoM's name and MoM itself. */
function banner(logo) {
  const W = 1600, H = 560;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  mcuBackground(ctx, W, H);

  const lh = 150;
  ctx.drawImage(logo, 90, 70, lh * LOGO_ASPECT, lh);

  ctx.fillStyle = '#fff';
  ctx.font = `800 150px ${FONT}`;
  ctx.fillText('MoM', 90, 390);
  ctx.font = `600 38px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText("The Mechatronics Course Union's desk robot.", 94, 448);
  ctx.font = `500 30px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('A to-do list for your desktop · macOS and Windows', 94, 496);

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill(ellipse(1180, 510, 280, 30));
  bigRobot(ctx, 1320, 512, 4.3, newPose({ eyes: 'happy', leftArm: 112, rightArm: 140, antenna: 6 }));
  return c;
}

/** The window people see when they open the .dmg: drag MoM into Applications. Drawn at 2x. */
function dmgBackground(logo) {
  const S = 2, W = 540, H = 380;
  const c = canvas(W * S, H * S);
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.fillStyle = vertical(ctx, '#ffffff', '#f1f2f4', 0, H);
  ctx.fillRect(0, 0, W, H);

  // Red header band with the MCU logo
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, 96);
  ctx.clip();
  mcuBackground(ctx, W, 96);
  ctx.restore();
  ctx.drawImage(logo, 24, 22, 52 * LOGO_ASPECT, 52);
  ctx.fillStyle = '#fff';
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText('MoM', 118, 52);
  ctx.font = `500 13px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('by the Mechatronics Course Union · TMU', 118, 74);

  // Arrow from the app to Applications
  ctx.strokeStyle = rgb(0xc9ccd2);
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(225, 230);
  ctx.lineTo(315, 230);
  ctx.moveTo(297, 214);
  ctx.lineTo(315, 230);
  ctx.lineTo(297, 246);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = rgb(0x6b7280);
  ctx.font = `500 13px ${FONT}`;
  ctx.fillText('Drag MoM into Applications, then open it.', W / 2, 338);
  ctx.fillStyle = rgb(0x9ca3af);
  ctx.font = `400 11px ${FONT}`;
  ctx.fillText('First launch: System Settings → Privacy & Security → Open Anyway', W / 2, 358);
  return c;
}

function scaled(src, w, h) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

window.renderArt = async (logoDataUrl) => {
  const logo = await loadImage(logoDataUrl);
  const icon = canvas(1024, 1024);
  drawIcon(icon.getContext('2d'));
  const dmg = dmgBackground(logo);
  return {
    'build/icon.png': icon.toDataURL('image/png'),
    'src/assets/icon.png': scaled(icon, 256, 256).toDataURL('image/png'),
    'build/background.png': scaled(dmg, 540, 380).toDataURL('image/png'),
    'build/background@2x.png': dmg.toDataURL('image/png'),
    'docs/banner.png': banner(logo).toDataURL('image/png'),
  };
};
