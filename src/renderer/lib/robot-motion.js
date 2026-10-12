// What MoM does in each mood: its activities, the task-done cheer and the dance.
import { newPose, reach, ironGrip, wrenchGrip, tubeHand } from './robot-art.js';
import { arenaState } from './lap.js';

/** Things MoM gets up to on its own while you work, and what it says now and then when it starts. */
export const ACTIVITIES = {
  soldering: 'Soldering time 🔥',
  fixing: 'Self-maintenance 🔧',
  rocketLeague: 'One more match 🎮',
  reading: 'Studying 📖',
  chemistry: 'Science! 🧪',
};

const partyColors = [0xff6b9a, 0xffd34e, 0x6bbf59, 0x8b6cff, 0x86ecff];

/**
 * MoM's pose and position at a moment in time. It always floats a little above its shadow.
 * mood: idle | happy | party | sleepy
 * since: seconds since the current mood started
 * activity: what MoM is busy with, shown only while idle and not being looked at
 * tau: seconds since the activity started
 * arenaSide: -1 when the Rocket League car plays to MoM's left, +1 to its right
 */
export function robotFrame({ mood, hovering, t, since, look, activity, tau, panelOpen, arenaSide = -1 }) {
  const f = { pose: newPose({ t }), dx: 0, dy: 0, tilt: 0, shadow: 1 };
  const pose = f.pose;
  const blink = t % 4.3 < 0.15;
  const float = Math.sin(t * 2.2);
  f.dy = -4 + float * 2;
  f.shadow = 0.9 - float * 0.06;
  pose.antenna = Math.sin(t * 1.4) * 3;
  pose.leftArm = 25 + Math.sin(t * 2.2) * 4;
  pose.rightArm = 25 + Math.sin(t * 2.2 + 0.6) * 4;

  switch (mood) {
    case 'idle':
      pose.eyes = blink ? 'blink' : 'open';
      pose.look = look;
      if (panelOpen) {
        pose.look = { x: -1, y: 0.4 };   // reading the list with you
      } else if (!hovering && activity) {
        perform(f, activity, tau, t, blink, float, arenaSide);
      }
      break;
    case 'sleepy':
      pose.eyes = 'closed';
      pose.dim = true;
      pose.antenna = 14;
      pose.leftArm = 12;
      pose.rightArm = 12;
      f.dy = -1 + float * 0.8;
      f.shadow = 1;
      break;
    case 'happy':
      pose.eyes = 'happy';
      pose.leftArm = 112 + Math.sin(t * 18) * 14;
      pose.rightArm = 112 + Math.sin(t * 18 + Math.PI) * 14;
      pose.antenna = Math.sin(t * 22) * 12;
      pose.chest = 0xffffff;
      if (since < 0.9) {
        const h = Math.abs(Math.sin((since * Math.PI) / 0.45));
        f.dy = -4 - 18 * h;
        f.shadow = 0.9 - 0.35 * h;
      }
      break;
    case 'party':
      dance(f, t);
      break;
  }

  // Hovering wakes MoM up: it stops what it's doing, looks at you and waves.
  if (hovering && (mood === 'idle' || mood === 'sleepy')) {
    f.pose = newPose({
      t,
      eyes: blink ? 'blink' : 'open',
      look,
      antenna: Math.sin(t * 1.4) * 3,
      leftArm: 25 + Math.sin(t * 2.2) * 4,
      rightArm: 120 + Math.sin(t * 12) * 18,
    });
    f.dy = -4 + float * 2;
    f.shadow = 0.9 - float * 0.06;
    f.tilt = 0;
  }
  return f;
}

function perform(f, activity, tau, t, blink, float, arenaSide) {
  const pose = f.pose;
  switch (activity) {
    case 'soldering': {
      const dab = Math.max(0, Math.sin(tau * 2.6));
      pose.prop = { kind: 'soldering', dab };
      pose.armLayer = 'front';
      reach(pose, true, { x: 35, y: 91 });
      reach(pose, false, ironGrip(dab));
      pose.eyes = blink ? 'blink' : 'focused';
      pose.look = { x: -0.35, y: 1 };
      f.dy = -4 + float;
      break;
    }
    case 'fixing':
      if (tau < 21) {
        const angle = Math.sin(tau * 5) * 16;
        pose.prop = { kind: 'wrench', angle };
        pose.armLayer = 'top';
        reach(pose, false, wrenchGrip(angle));
        pose.screen = { kind: 'loading', progress: Math.min(1, tau / 20) };
        f.tilt = 3;
      } else {
        pose.eyes = 'happy';   // all patched up
      }
      break;
    case 'rocketLeague': {
      const c = { x: 50 + Math.sin(t * 31) * 0.35, y: 85 + Math.cos(t * 23) * 0.35 };
      pose.prop = { kind: 'controller', at: c };
      pose.armLayer = 'front';
      reach(pose, true, { x: c.x - 11, y: c.y + 3 });
      reach(pose, false, { x: c.x + 11, y: c.y + 3 });
      const game = arenaState(tau);
      // Eyes follow the car along the ground and the ball up into the air.
      const ballHeight = Math.min(1, game.ball.y / 180);
      pose.look = { x: arenaSide * (0.3 + 0.7 * game.progress), y: 0.8 - 1.5 * ballHeight };
      f.tilt = -arenaSide * (game.car.boost ? 3 : 1.2);   // leaning into it
      if (game.moment === 'bigPlay') {
        pose.eyes = 'wide';
        pose.antenna = Math.sin(t * 20) * 8;
      } else if (game.moment === 'nice') {
        pose.eyes = 'happy';
        f.dy = -4 - 5 * Math.abs(Math.sin(t * 9));
      }
      break;
    }
    case 'reading':
      pose.prop = { kind: 'book' };
      pose.armLayer = 'front';
      reach(pose, true, { x: 36, y: 88 });
      reach(pose, false, { x: 64, y: 88 });
      if (tau % 13 > 11.5) {
        pose.look = { x: 0, y: -0.1 };   // glances up at you
      } else {
        const s = (tau % 2.6) / 2.6;
        const x = s < 0.85 ? -0.8 + (1.6 * s) / 0.85 : 0.8 - (1.6 * (s - 0.85)) / 0.15;
        pose.look = { x, y: 1 };
      }
      break;
    case 'chemistry': {
      const phase = tau % 7;
      const poof = phase > 5.5 ? (phase - 5.5) / 1.4 : null;
      pose.prop = { kind: 'chemistry', tube: -20 + Math.sin(t * 4) * 18, poof };
      pose.armLayer = 'front';
      reach(pose, true, { x: 33, y: 85 });
      reach(pose, false, tubeHand);
      if (poof != null) {
        pose.eyes = 'wide';
        pose.look = { x: -0.9, y: 0.7 };
        f.tilt = -3;
      } else {
        pose.look = { x: 0.9, y: -0.5 };
      }
      break;
    }
  }
}

/** A stiff, on-the-beat robot dance. */
function dance(f, t) {
  const pose = f.pose;
  const b = t * 2.2;
  const beat = Math.floor(b);
  const bounce = Math.abs(Math.sin(Math.PI * (b - beat)));
  const moves = [[150, 20], [20, 150], [95, 95], [160, 160]];
  const [left, right] = moves[Math.floor(beat / 2) % moves.length];
  pose.leftArm = left;
  pose.rightArm = right;
  pose.antenna = beat % 2 === 0 ? 12 : -3;
  pose.chest = partyColors[beat % partyColors.length];
  if (Math.floor(beat / 4) % 2 === 0) pose.eyes = 'happy';
  else pose.screen = { kind: 'equalizer', t };
  f.dy = -4 - 9 * bounce;
  f.dx = Math.floor(beat / 2) % 2 === 0 ? -5 : 5;
  f.tilt = beat % 2 === 0 ? -6 : 6;
  f.shadow = 0.9 - 0.3 * bounce;
}
