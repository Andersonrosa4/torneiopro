/**
 * Volleyball 2D — Sound Effects (Web Audio API)
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function playHit() {
  try {
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = "triangle";
    o.frequency.setValueAtTime(350, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(120, c.currentTime + 0.1);
    g.gain.setValueAtTime(0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
    o.start(c.currentTime); o.stop(c.currentTime + 0.12);
  } catch {}
}

export function playPoint(won: boolean) {
  try {
    const c = getCtx();
    const notes = won ? [523, 659, 784] : [400, 320, 260];
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = won ? "sine" : "square";
      o.frequency.setValueAtTime(f, c.currentTime + i * 0.1);
      g.gain.setValueAtTime(0.12, c.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.1 + 0.18);
      o.start(c.currentTime + i * 0.1); o.stop(c.currentTime + i * 0.1 + 0.18);
    });
  } catch {}
}

export function playWhistle() {
  try {
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(900, c.currentTime);
    o.frequency.setValueAtTime(1200, c.currentTime + 0.08);
    o.frequency.setValueAtTime(900, c.currentTime + 0.18);
    g.gain.setValueAtTime(0.1, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
    o.start(c.currentTime); o.stop(c.currentTime + 0.3);
  } catch {}
}
