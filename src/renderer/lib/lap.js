// One choreographed lap of Rocket League freestyle, built from what players actually do:
// hood dribble → flick → aerial off the far wall → half-flip → catch on the nose → dribble back →
// air dribble → backflip flick → half-flip → the ball drops back onto the nose.
//
// Positions use "lane" coordinates: u is distance from the end next to MoM, h is height above the ground (up is +).
// The car's own frame has its nose along +x and its roof along +y, centred on the car's middle.

const D2R = Math.PI / 180;

export const smooth = (x) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

export const g = 420;
export const ballRadius = 12;
export const ride = 18;                       // car centre height when on its wheels
export const wall = 430;
export const length = 13.0;
const hood = { x: 21, y: 17 };                // ball centre resting on the hood
const noseHit = { x: 52, y: 2 };              // ball centre touching the nose

// Timeline
export const dribbleEnd = 2.6, flickEnd = 3.4, rollEnd = 3.6, hitTime = 4.0;
const flickRelease = dribbleEnd + 0.16;
const wallTime = hitTime + 0.45, bounceTime = 5.3;
export const catchTime = 7.0, carryEnd = 9.0, airEnd = 10.3;
export const airRelease = airEnd + 0.12;
const bounce2Time = 11.7;

/** A point given in the car's own frame, in lane coordinates. */
export function world(c, p) {
  const co = Math.cos(c.pitch), si = Math.sin(c.pitch);
  return { x: c.u + c.facing * (p.x * co - p.y * si), y: c.h + p.x * si + p.y * co };
}

/** pitch: radians, + lifts the nose. facing: +1 away from MoM, -1 toward MoM, passes through 0 while rolling over. */
const car0 = (u, h, more = {}) => ({ u, h, pitch: 0, facing: 1, boost: false, ...more });

const fallTime = (h, v) => (v + Math.sqrt(v * v + 2 * g * (h - ride))) / g;

// Places
const start = 160;
const aerialBall = { x: 355, y: 150 };
const aerialPitch = 65 * D2R;
const carAtHit = (() => {
  const c = world(car0(0, 0, { pitch: aerialPitch }), noseHit);
  return { x: aerialBall.x - c.x, y: aerialBall.y - c.y };
})();
const fall1 = fallTime(carAtHit.y, 120);
const land1 = hitTime + fall1;
const land1U = carAtHit.x + 45 * fall1;
const halfFlip1End = land1 + 0.8;
const catchU = 255;
const airPitch = 50 * D2R;
const fall2 = fallTime(140, 30);
const land2 = airEnd + fall2;
const halfFlip2End = land2 + 0.8;

/** Backflip, roll over at the top, land facing the other way. Moves the car back a little. */
function halfFlip(s, u, towardMoM) {
  const peak = 105 * D2R;
  const pitch = s < 0.35 ? peak * smooth(s / 0.35) : s < 0.65 ? peak : peak * (1 - smooth((s - 0.65) / 0.35));
  const before = towardMoM ? 1 : -1;
  const roll = Math.cos(Math.PI * smooth((s - 0.35) / 0.3));
  return car0(u - before * 30 * smooth(s), ride + 32 * Math.sin(Math.PI * s), { pitch, facing: before * roll });
}

export function car(t) {
  if (t < dribbleEnd) {
    const s = t / dribbleEnd;
    return car0(start + 90 * smooth(s), ride, { boost: s < 0.3 });
  }
  if (t < flickEnd) {   // front flip with the ball on the hood
    const s = (t - dribbleEnd) / (flickEnd - dribbleEnd);
    return car0(250 + 55 * s, ride + 38 * Math.sin(Math.PI * s), { pitch: -2 * Math.PI * smooth((s - 0.1) / 0.75) });
  }
  if (t < rollEnd) {
    const s = (t - flickEnd) / (rollEnd - flickEnd);
    return car0(305 + 7 * s, ride);
  }
  if (t < hitTime) {    // aerial: jump, then boost nose-up into the ball
    const s = (t - rollEnd) / (hitTime - rollEnd);
    return car0(312 + (carAtHit.x - 312) * smooth(s), ride + (carAtHit.y - ride) * (1 - (1 - s) * (1 - s)),
      { pitch: aerialPitch * smooth(s / 0.6), boost: true });
  }
  if (t < land1) {      // falling back, levelling out to land on its wheels
    const τ = t - hitTime;
    return car0(carAtHit.x + 45 * τ, carAtHit.y + 120 * τ - 0.5 * g * τ * τ, { pitch: aerialPitch * (1 - smooth(τ / fall1)) });
  }
  if (t < halfFlip1End) return halfFlip((t - land1) / 0.8, land1U, true);
  if (t < catchTime) {  // chase down the bouncing ball
    const s = (t - halfFlip1End) / (catchTime - halfFlip1End);
    return car0(land1U - 30 + (catchU - (land1U - 30)) * smooth(s), ride, { facing: -1, boost: s < 0.4 });
  }
  if (t < carryEnd) {   // hood dribble back toward MoM
    const s = (t - catchTime) / (carryEnd - catchTime);
    return car0(catchU - 105 * smooth(s), ride, { facing: -1 });
  }
  if (t < airEnd) {     // air dribble: carry the ball up on the nose
    const s = (t - carryEnd) / (airEnd - carryEnd);
    return car0(150 - 40 * smooth(s), ride + (140 - ride) * smooth(s), { pitch: airPitch * smooth(s / 0.3), facing: -1, boost: s > 0.1 });
  }
  if (t < land2) {      // backflip flick, then drop to the ground
    const τ = t - airEnd;
    return car0(110 + 25 * (τ / fall2), 140 + 30 * τ - 0.5 * g * τ * τ,
      { pitch: airPitch + (2 * Math.PI - airPitch) * smooth(τ / fall2), facing: -1 });
  }
  if (t < halfFlip2End) return halfFlip((t - land2) / 0.8, 135, false);
  return car0(start, ride);   // wait under the falling ball
}

function ballOnHood(c, t) {
  return world(c, { x: hood.x + Math.sin(t * 3) * 2, y: hood.y + Math.abs(Math.sin(t * 5)) * 1.5 });
}

/** A ballistic arc that leaves `p0` at `t0` and arrives at `p1` at `t1`. */
function arc(p0, p1, t0, t1) {
  const T = t1 - t0;
  const vu = (p1.x - p0.x) / T;
  const vh = (p1.y - p0.y + 0.5 * g * T * T) / T;
  const at = (t) => {
    const s = t - t0;
    return { x: p0.x + vu * s, y: p0.y + vh * s - 0.5 * g * s * s };
  };
  return { p1, at };
}

const a1 = arc(ballOnHood(car(flickRelease), 0), aerialBall, flickRelease, hitTime);
const a2 = arc(aerialBall, { x: wall - ballRadius, y: 165 }, hitTime, wallTime);
const a3 = arc(a2.p1, { x: 270, y: ballRadius }, wallTime, bounceTime);
const a4 = arc(a3.p1, ballOnHood(car(catchTime), 0), bounceTime, catchTime);
const a5 = arc(ballOnHood(car(airRelease), 0), { x: 235, y: ballRadius }, airRelease, bounce2Time);
const a6 = arc(a5.p1, ballOnHood(car(length), 0), bounce2Time, length);

export function ball(t) {
  if (t < flickRelease) return ballOnHood(car(t), t);
  if (t < hitTime) return a1.at(t);
  if (t < wallTime) return a2.at(t);
  if (t < bounceTime) return a3.at(t);
  if (t < catchTime) return a4.at(t);
  if (t < airRelease) return ballOnHood(car(t), t < carryEnd ? t : 0);
  if (t < bounce2Time) return a5.at(t);
  return a6.at(t);
}

/** Everything needed to draw one moment, plus how MoM should react to it. */
export function arenaState(tau) {
  const t = ((tau % length) + length) % length;
  const c = car(t);
  const b = ball(t);
  let moment = 'calm';
  if ((t >= dribbleEnd && t < hitTime + 0.3) || (t >= carryEnd + 0.3 && t < airRelease + 0.5)) moment = 'bigPlay';
  else if ((t >= catchTime && t < catchTime + 0.6) || t < 0.5) moment = 'nice';
  return {
    t,
    car: c,
    ball: b,
    progress: Math.min(1, Math.max(0, c.u / wall)),   // how far along the lane, 0 by MoM to 1 at the far end
    moment,
  };
}
