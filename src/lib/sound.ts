// Simple WebAudio-based sound cues for moves/check/mate without audio files.
let audioCtx: AudioContext | null = null;

function beep(freq: number, durationMs: number, type: OscillatorType = 'sine') {
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.value = freq;
    osc.connect(gain); gain.connect(audioCtx.destination);
    gain.gain.value = 0.06;
    osc.start();
    setTimeout(() => osc.stop(), durationMs);
  } catch {}
}

export function playMoveSound() { beep(600, 80, 'triangle'); }
export function playCaptureSound() { beep(220, 140, 'sawtooth'); }
export function playCheckSound() { beep(880, 200, 'square'); }
export function playMateSound() { beep(440, 400, 'square'); }

// Simple speech synthesis helper
export function speak(text: string, rate: number = 1.0, lang: string = 'vi-VN') {
  try {
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.lang = lang;
    synth.cancel(); // stop any ongoing speech
    synth.speak(u);
  } catch {}
}

// -------- Ambient Music (gentle background) --------
type AmbientState = {
  master: GainNode | null;
  filter: BiquadFilterNode | null;
  oscs: OscillatorNode[];
  gains: GainNode[];
  intervalId: number | null;
  playing: boolean;
};

const ambient: AmbientState = {
  master: null,
  filter: null,
  oscs: [],
  gains: [],
  intervalId: null,
  playing: false,
};

function ensureCtx() {
  if (typeof window === 'undefined') return null;
  audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
  return audioCtx;
}

const CHORDS = [
  // Am, F, C, G (gentle loop)
  [220.00, 261.63, 329.63],   // A, C, E
  [174.61, 220.00, 261.63],   // F, A, C
  [261.63, 329.63, 392.00],   // C, E, G
  [196.00, 246.94, 392.00],   // G, B, G (octave)
];

export function startAmbientMusic(volume: number = 0.03) {
  try {
    const ctx = ensureCtx();
    if (!ctx) return false;
    ctx.resume?.();
    // master
    ambient.master = ambient.master || ctx.createGain();
    ambient.master.gain.value = volume;
    ambient.master.connect(ctx.destination);
    // soft lowpass filter
    ambient.filter = ambient.filter || ctx.createBiquadFilter();
    ambient.filter.type = 'lowpass';
    ambient.filter.frequency.value = 1200; // soften highs
    ambient.filter.connect(ambient.master);

    // if already playing, just ensure volume and return
    if (ambient.playing) {
      ambient.master.gain.value = volume;
      return true;
    }

    // build triad oscillators
    ambient.oscs = [ctx.createOscillator(), ctx.createOscillator(), ctx.createOscillator()];
    ambient.gains = [ctx.createGain(), ctx.createGain(), ctx.createGain()];
    const baseChord = CHORDS[0];
    ambient.oscs.forEach((osc, i) => {
      osc.type = i === 1 ? 'triangle' : 'sine';
      osc.frequency.value = baseChord[i];
      // mild detune for warmth
      osc.detune.value = i === 2 ? 4 : (i === 0 ? -3 : 1);
      const g = ambient.gains[i];
      g.gain.value = i === 1 ? 0.12 : 0.10; // balance voices
      osc.connect(g); g.connect(ambient.filter as BiquadFilterNode);
      osc.start();
    });

    // progression every ~7s with gentle ramps
    let idx = 0;
    ambient.intervalId = window.setInterval(() => {
      idx = (idx + 1) % CHORDS.length;
      const next = CHORDS[idx];
      ambient.oscs.forEach((osc, i) => {
        try {
          const now = ctx.currentTime;
          osc.frequency.cancelScheduledValues(now);
          osc.frequency.linearRampToValueAtTime(next[i], now + 2.0);
        } catch {}
      });
    }, 7000);

    ambient.playing = true;
    return true;
  } catch {
    return false;
  }
}

export function stopAmbientMusic() {
  try {
    const ctx = ensureCtx();
    if (!ctx) return;
    ambient.intervalId && clearInterval(ambient.intervalId);
    ambient.intervalId = null;
    ambient.oscs.forEach((o) => { try { o.stop(); } catch {} });
    ambient.oscs = [];
    ambient.gains = [];
    ambient.playing = false;
  } catch {}
}

export function setAmbientVolume(volume: number) {
  try {
    const ctx = ensureCtx();
    if (!ctx || !ambient.master) return;
    ambient.master.gain.value = Math.max(0, Math.min(volume, 0.2));
  } catch {}
}

export function isAmbientPlaying() {
  return ambient.playing;
}

// -------- MP3 Track Background Music --------
let bgAudio: HTMLAudioElement | null = null;

export function startTrackMusic(url: string = '/music/thien-ly-oi.mp3', volume: number = 0.3) {
  try {
    if (typeof window === 'undefined') return false;
    // candidates: simplified name then original diacritics
    const candidates = [
      url,
      '/music/Thiên Lý Ơi (DJ EchoBay Remix).mp3',
    ];
    bgAudio = bgAudio || new Audio();
    bgAudio.loop = true;
    bgAudio.volume = Math.max(0, Math.min(volume, 1));
    let idx = 0;
    const tryPlay = (): Promise<boolean> => {
      const u = candidates[idx];
      bgAudio!.src = encodeURI(u);
      const p = bgAudio!.play();
      if (p && typeof p.then === 'function') {
        return p.then(() => true).catch(() => {
          idx++;
          if (idx < candidates.length) return tryPlay();
          return false;
        });
      }
      return Promise.resolve(true);
    };
    return tryPlay();
  } catch {
    return false as any;
  }
}

export function stopTrackMusic() {
  try {
    bgAudio?.pause();
  } catch {}
}

export function setTrackVolume(volume: number) {
  try {
    if (bgAudio) bgAudio.volume = Math.max(0, Math.min(volume, 1));
  } catch {}
}

export function isTrackPlaying() {
  return !!(bgAudio && !bgAudio.paused);
}