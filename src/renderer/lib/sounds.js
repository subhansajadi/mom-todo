// Little synthesized sounds, so nothing depends on the operating system's sound files.

let ac = null;
const audio = () => (ac ??= new AudioContext());

function tone(c, { at, freq, to, type = 'sine', peak, length }) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + length * 0.6);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + length + 0.02);
}

/** A task checked off. */
export function pop() {
  const c = audio();
  const t = c.currentTime;
  tone(c, { at: t, freq: 880, to: 360, peak: 0.32, length: 0.14 });
  tone(c, { at: t + 0.05, freq: 1320, type: 'triangle', peak: 0.08, length: 0.12 });
}

/** Everything done: a rising fanfare. */
export function fanfare() {
  const c = audio();
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const last = i === 3;
    tone(c, { at: t + i * 0.1, freq: f, type: 'triangle', peak: last ? 0.22 : 0.16, length: last ? 0.9 : 0.22 });
    tone(c, { at: t + i * 0.1, freq: f * 2, type: 'sine', peak: 0.04, length: last ? 0.6 : 0.15 });
  });
}
