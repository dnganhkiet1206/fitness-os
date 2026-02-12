// Synthesized achievement chime using Web Audio API
// Apple Fitness-style ascending arpeggio with shimmer

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playAchievementSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Master gain
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.35, now);
    master.connect(ctx.destination);

    // Ascending arpeggio notes (C5, E5, G5, C6) — major chord
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const noteDuration = 0.12;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const start = now + i * noteDuration;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.6, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, start + noteDuration + 0.3);

      osc.connect(gain);
      gain.connect(master);

      osc.start(start);
      osc.stop(start + noteDuration + 0.35);
    });

    // Shimmer / sparkle overlay
    const shimmerFreqs = [1568, 2093, 2637];
    shimmerFreqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const start = now + 0.3 + i * 0.08;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);

      osc.connect(gain);
      gain.connect(master);

      osc.start(start);
      osc.stop(start + 0.55);
    });

    // Final resonant chime
    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(2093, now + 0.55);
    chimeGain.gain.setValueAtTime(0, now + 0.55);
    chimeGain.gain.linearRampToValueAtTime(0.25, now + 0.58);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    chime.connect(chimeGain);
    chimeGain.connect(master);
    chime.start(now + 0.55);
    chime.stop(now + 1.6);

  } catch {
    // Silently fail if audio not available
  }
}
