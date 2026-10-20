// Small, dependency-free sound effects for the player. Sounds are synthesised
// with Web Audio (no audio files, no network) and can be muted globally.
const GameAudio = (() => {
  const STORAGE_KEY = 'edugame.player.sound';
  let enabled = readPreference();
  let context = null;

  function readPreference() {
    try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
  }

  function savePreference(value) {
    try { localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off'); } catch { /* private mode */ }
  }

  function audioContext() {
    if (!enabled) return null;
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      if (!context) context = new AudioCtor();
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context;
    } catch {
      return null;
    }
  }

  function tone(ctx, frequency, delay, duration, type = 'sine', volume = 0.035) {
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function play(name) {
    const ctx = audioContext();
    if (!ctx) return;
    try {
      switch (name) {
        case 'open':
          tone(ctx, 330, 0, 0.18, 'sine', 0.025);
          tone(ctx, 494, 0.08, 0.22, 'sine', 0.022);
          break;
        case 'correct':
          tone(ctx, 660, 0, 0.16, 'sine', 0.04);
          tone(ctx, 880, 0.09, 0.22, 'sine', 0.034);
          break;
        case 'match':
          tone(ctx, 560, 0, 0.12, 'triangle', 0.03);
          tone(ctx, 740, 0.07, 0.16, 'triangle', 0.026);
          break;
        case 'wrong':
          tone(ctx, 240, 0, 0.2, 'sawtooth', 0.022);
          tone(ctx, 170, 0.12, 0.26, 'sawtooth', 0.018);
          break;
        case 'hint':
          tone(ctx, 520, 0, 0.16, 'sine', 0.028);
          tone(ctx, 780, 0.14, 0.24, 'sine', 0.024);
          break;
        case 'item':
          tone(ctx, 880, 0, 0.12, 'triangle', 0.03);
          tone(ctx, 1175, 0.1, 0.2, 'triangle', 0.026);
          break;
        case 'stage':
          tone(ctx, 392, 0, 0.14, 'sine', 0.028);
          tone(ctx, 523, 0.11, 0.22, 'sine', 0.026);
          break;
        case 'reward':
          [523, 659, 784, 1047].forEach((frequency, index) => {
            tone(ctx, frequency, index * 0.11, 0.34, 'sine', 0.03);
          });
          break;
        case 'toggle':
          tone(ctx, 620, 0, 0.08, 'triangle', 0.02);
          break;
        default:
          tone(ctx, 440, 0, 0.06, 'sine', 0.014);
      }
    } catch {
      // Audio is decorative; a failed context must never break gameplay.
    }
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    savePreference(enabled);
    return enabled;
  }

  function toggle() {
    return setEnabled(!enabled);
  }

  return {
    play,
    isEnabled: () => enabled,
    setEnabled,
    toggle
  };
})();
