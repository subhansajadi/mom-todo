import { D2R, ellipse, fitCanvas, now, FONT, rgb } from './lib/draw.js';
import { drawRobot } from './lib/robot-art.js';
import { robotFrame, ACTIVITIES } from './lib/robot-motion.js';
import * as sounds from './lib/sounds.js';

const { send, invoke, on, platform } = window.mom;

const WINDOW = { w: 230, h: 180 };
const SPRITE_AT = { x: 120, y: 58 };   // MoM's 100 x 112 box inside the window

const cheers = ['Nice!', 'Yay! ✨', 'Crushed it!', 'One down!', 'Woohoo!', 'Look at you go!',
  'Boom! 💥', 'So good!', 'Yesss!', 'Another one! 🙌', 'MoM approves 🤖'];

const state = {
  remaining: 0,
  total: 0,
  hovering: false,
  panelOpen: false,
  override: null,          // a mood that's playing for a while: happy or party
  moodStart: now(),
  bubble: null,
  activity: null,
  activityStart: now(),
  arenaSide: -1,
  look: { x: 0, y: 0 },
  soundOn: true,
  paused: false,           // the screen is locked or the computer is asleep
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (lo, hi) => lo + Math.random() * (hi - lo);

/** Sleeps when there's nothing left to do, otherwise idles, unless an animation is playing. */
const mood = () => state.override ?? (state.remaining === 0 ? 'sleepy' : 'idle');

/** Whether MoM is visibly busy with an activity right now. */
const isBusy = () => state.activity != null && mood() === 'idle' && !state.hovering && !state.panelOpen;

function bubbleText() {
  if (state.bubble) return state.bubble;
  if (!state.hovering) return null;
  if (state.remaining > 0) return state.remaining === 1 ? '1 thing to do' : `${state.remaining} things to do`;
  return state.total === 0 ? 'Click me to add tasks!' : 'All done ✨';
}

// MARK: Moods, speech and activities

let moodTimer, bubbleTimer, activityTimer;
let lastActivity = null;

function play(m, seconds) {
  clearTimeout(moodTimer);
  state.override = m;
  state.moodStart = now();
  moodTimer = setTimeout(() => {
    state.override = null;
    state.moodStart = now();
    changed();
  }, seconds * 1000);
  changed();
}

function say(text, seconds = 2.4) {
  clearTimeout(bubbleTimer);
  state.bubble = text;
  bubbleTimer = setTimeout(() => {
    state.bubble = null;
    changed();
  }, seconds * 1000);
  changed();
}

/** Starts MoM's loop of idling and doing its own thing. */
function startActivities(pinned) {
  if (pinned && pinned in ACTIVITIES) {
    state.activity = pinned;
    state.activityStart = now();
    return changed();
  }
  scheduleActivity(between(6, 12));
}

function scheduleActivity(delay) {
  clearTimeout(activityTimer);
  activityTimer = setTimeout(beginActivity, delay * 1000);
}

function beginActivity() {
  const next = pick(Object.keys(ACTIVITIES).filter((a) => a !== lastActivity));
  lastActivity = next;
  state.activity = next;
  state.activityStart = now();
  if (isBusy() && !state.bubble && Math.random() < 0.35) say(ACTIVITIES[next], 2.2);
  activityTimer = setTimeout(() => {
    state.activity = null;
    changed();
    scheduleActivity(between(8, 16));
  }, between(25, 40) * 1000);
  changed();
}

// MARK: Celebrations

function sound(name) {
  if (!state.soundOn) return;
  try {
    sounds[name]();
  } catch {}
}

function celebrate(remaining) {
  if (remaining === 0) return party();
  play('happy', 1.3);
  say(Math.random() < 0.5 ? pick(cheers) : remaining === 1 ? 'Just 1 left!' : `${remaining} to go!`, 2.2);
  send('mascot:confetti');
  sound('pop');
}

/** A disco ball drops from the top of the screen and MoM dances. */
function party() {
  const length = 9;
  play('party', length - 0.6);
  say('ALL DONE!! 🪩', 3);
  send('mascot:disco', { seconds: length });
  sound('fanfare');
  setTimeout(() => say('Dance break 🕺', 3.5), 3600);
}

// MARK: Bubble, badge and the Rocket League strip

const spriteEl = document.getElementById('sprite');
const badgeEl = document.getElementById('badge');
const bubblesEl = document.getElementById('bubbles');
let shownBubble = null;
let arenaKey = null;

function changed() {
  spriteEl.classList.toggle('hover', state.hovering);

  const showBadge = state.remaining > 0 && mood() !== 'party';
  badgeEl.classList.toggle('hidden', !showBadge);
  if (showBadge) badgeEl.textContent = String(state.remaining);

  const text = bubbleText();
  if (text !== shownBubble) {
    shownBubble = text;
    for (const old of bubblesEl.querySelectorAll('.bubble:not(.out)')) {
      old.classList.add('out');
      setTimeout(() => old.remove(), 220);
    }
    if (text) {
      const b = document.createElement('div');
      b.className = 'bubble';
      b.textContent = text;
      bubblesEl.append(b);
    }
  }

  // The car plays beside MoM only while MoM is actually holding the controller.
  const want = isBusy() && state.activity === 'rocketLeague';
  const key = want ? state.activityStart : null;
  if (key !== arenaKey) {
    arenaKey = key;
    send('mascot:arena', { show: want, start: state.activityStart * 1000 });
  }
}

// MARK: Drawing

const canvas = document.getElementById('art');
let lastFrame = 0;

/** A little "z" that drifts up and fades out while sleeping. */
function drawZ(ctx, t, x, y) {
  const phase = (t % 2.4) / 2.4;
  ctx.globalAlpha = 1 - phase;
  ctx.fillStyle = rgb(0x8c9bb0);
  ctx.font = `800 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('z', x + phase * 8, y - phase * 18);
  ctx.globalAlpha = 1;
}

function render() {
  const t = now();
  const m = mood();
  const f = robotFrame({
    mood: m,
    hovering: state.hovering,
    t,
    since: t - state.moodStart,
    look: state.look,
    activity: state.activity,
    tau: t - state.activityStart,
    panelOpen: state.panelOpen,
    arenaSide: state.arenaSide,
  });
  const ctx = fitCanvas(canvas, WINDOW.w, WINDOW.h);
  ctx.translate(SPRITE_AT.x, SPRITE_AT.y);

  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  const sw = 52 * f.shadow;
  ctx.fill(ellipse(50 - sw / 2, 112 - 7, sw, 7));

  ctx.save();
  ctx.translate(50 + f.dx, 112 + f.dy - 4);   // rotate around the bottom of MoM
  ctx.rotate(f.tilt * D2R);
  ctx.translate(-50, -104);
  drawRobot(ctx, f.pose);
  if (m === 'sleepy' && !state.hovering) drawZ(ctx, t, 88, 16);
  ctx.restore();
}

function loop(ts) {
  if (state.paused) return;   // 'paused' starts the loop again
  requestAnimationFrame(loop);
  const m = mood();
  const lively = m === 'happy' || m === 'party' || state.hovering;
  const fps = lively ? 30 : isBusy() ? 24 : 15;
  if (ts - lastFrame < 1000 / fps - 2) return;
  lastFrame = ts;
  render();
}

// MARK: Pointer

const isMac = platform === 'darwin';
spriteEl.addEventListener('mousedown', (e) => {
  if (e.button === 0 && !(isMac && e.ctrlKey)) send('mascot:grab-start');
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) send('mascot:grab-end');
});
spriteEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  send('mascot:menu');
});

// MARK: Messages from the app

on('hover', (h) => { state.hovering = h; changed(); });
on('look', (l) => { state.look = l; });
on('panel-open', (open) => { state.panelOpen = open; changed(); });
on('counts', ({ remaining, total }) => { state.remaining = remaining; state.total = total; changed(); });
on('completed', (remaining) => celebrate(remaining));
on('party', () => party());
on('say', (text) => say(text));
on('about', () => {
  play('happy', 1.3);
  say("I'm MoM, MCU's mascot 🤖", 2.6);
  setTimeout(() => say('Made by MCU at TMU ❤️', 3), 2700);   // the bubble fits about 28 characters
});
on('sound', (onOff) => { state.soundOn = onOff; });
on('arena-side', (side) => { state.arenaSide = side; });
on('paused', (p) => {
  const was = state.paused;
  state.paused = p;
  if (was && !p) {
    arenaKey = null;   // bring the Rocket League car back if MoM was mid-game
    changed();
    requestAnimationFrame(loop);
  }
});

on('hiding', ({ hours, shortcutTaken }) => {
  say(hours === 1 ? 'Back in an hour 👋' : `Back in ${hours} hours 👋`, 1.7);
  setTimeout(() => say(shortcutTaken ? 'Open MoM to bring me back' : `${shortcut} brings me back`, 1.7), 1700);
});

// Updates: MoM announces a new version once, and answers "Check for Updates…" from the menu.
const shortcut = isMac ? '⌃⌥T' : 'Ctrl+Alt+T';
on('update', ({ event, version }) => {
  if (event === 'nudge') {
    play('happy', 1.3);
    say('New update! 🎁', 2.6);
    setTimeout(() => say("Click me to see what's new", 3.2), 2700);
  } else if (event === 'up-to-date') {
    say("I'm up to date ✅", 2.6);
  } else if (event === 'check-failed') {
    say("Couldn't check for updates", 2.8);
  } else if (event === 'dev-build') {
    say('No updates in dev mode', 2.6);
  }
});

const hello = await invoke('mascot:hello');
Object.assign(state, { remaining: hello.remaining, total: hello.total, soundOn: hello.soundOn, paused: hello.paused });
changed();
startActivities(hello.activity);
if (!state.paused) requestAnimationFrame(loop);
const greetings = hello.update?.whatsNew
  ? ["I just got updated! ✨", "Click me to see what's new"]
  : [state.remaining === 0 ? "Hi, I'm MoM from MCU 👋" : `Hi! ${state.remaining} to do today`];
if (hello.shortcutTaken) greetings.push(`${shortcut} is taken 😕`, 'Click me to open your list');
greetings.forEach((text, i) => setTimeout(() => {
  if (i === 0 && hello.update?.whatsNew) play('happy', 1.3);
  say(text, 3);
}, 800 + i * 3200));
