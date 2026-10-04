/**
 * Cinematic "danger" sound engine for the unofficial-app warning.
 *
 * Ported from the supplied reference: six layered voices (deep sub rumble, a
 * two-tone klaxon, a piercing warbling alert, periodic impact hits, a sweeping
 * noise tension bed and a detuned metallic scrape), a generated convolution
 * reverb and a compressor. It starts the moment the warning appears and stops
 * when it goes away.
 *
 * The master level is intentionally capped (it should feel powerful and
 * unsettling without being deafening).
 */

const MASTER_VOLUME = 0.4;
const FADE_IN_SECONDS = 1.2;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let running = false;
let started = false;

const timers: number[] = [];
const sources: AudioScheduledSourceNode[] = [];

function getCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

function makeDistortionCurve(amount: number): Float32Array {
  const n = 44100;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function createImpulseResponse(c: AudioContext, duration: number, decay: number): AudioBuffer {
  const rate = c.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = c.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function track(source: AudioScheduledSourceNode): void {
  sources.push(source);
}

function later(fn: () => void, ms: number): void {
  timers.push(window.setTimeout(fn, ms));
}

function every(fn: () => void, ms: number): void {
  timers.push(window.setInterval(fn, ms));
}

function initGraph(c: AudioContext): void {
  const masterGain = c.createGain();
  masterGain.gain.value = 0.0001;

  const compressor = c.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 6;
  compressor.ratio.value = 14;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  masterGain.connect(compressor);
  compressor.connect(c.destination);

  const reverbNode = c.createConvolver();
  reverbNode.buffer = createImpulseResponse(c, 3.0, 2.4);
  const reverbSend = c.createGain();
  reverbSend.gain.value = 0.42;
  reverbNode.connect(reverbSend);
  reverbSend.connect(masterGain);

  // Layer 1 — deep sub rumble.
  const subOsc = c.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = 38;
  const subOsc2 = c.createOscillator();
  subOsc2.type = 'triangle';
  subOsc2.frequency.value = 42;
  const subGain = c.createGain();
  subGain.gain.value = 0.55;
  const subPulse = c.createOscillator();
  subPulse.type = 'sine';
  subPulse.frequency.value = 0.55;
  const subPulseGain = c.createGain();
  subPulseGain.gain.value = 0.32;
  subPulse.connect(subPulseGain);
  subPulseGain.connect(subGain.gain);
  subOsc.connect(subGain);
  subOsc2.connect(subGain);
  subGain.connect(masterGain);
  subGain.connect(reverbNode);
  subPulse.start();
  subOsc.start();
  subOsc2.start();
  track(subPulse);
  track(subOsc);
  track(subOsc2);

  // Layer 2 — klaxon (alternating two-tone siren).
  const klaxonBus = c.createGain();
  klaxonBus.gain.value = 0.0001;
  const klaxonFilter = c.createBiquadFilter();
  klaxonFilter.type = 'lowpass';
  klaxonFilter.frequency.value = 2400;
  klaxonFilter.Q.value = 4;
  const klaxonDist = c.createWaveShaper();
  klaxonDist.curve = makeDistortionCurve(20) as unknown as typeof klaxonDist.curve;
  klaxonDist.oversample = '4x';
  klaxonBus.connect(klaxonFilter);
  klaxonFilter.connect(klaxonDist);
  klaxonDist.connect(masterGain);
  klaxonDist.connect(reverbNode);

  const scheduleKlaxon = () => {
    if (!running || !ctx) return;
    const now = ctx.currentTime;
    const toneDur = 0.42;
    const tone = (freq: number, startAt: number) => {
      const o = ctx!.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, startAt);
      const g = ctx!.createGain();
      g.gain.setValueAtTime(0, startAt);
      g.gain.linearRampToValueAtTime(0.22, startAt + 0.02);
      g.gain.setValueAtTime(0.22, startAt + toneDur - 0.04);
      g.gain.linearRampToValueAtTime(0, startAt + toneDur);
      o.connect(g);
      g.connect(klaxonBus);
      o.start(startAt);
      o.stop(startAt + toneDur + 0.02);
    };
    tone(620, now);
    tone(415, now + toneDur);
    later(scheduleKlaxon, toneDur * 2 * 1000);
  };
  klaxonBus.gain.setValueAtTime(0.0001, c.currentTime);
  klaxonBus.gain.exponentialRampToValueAtTime(1, c.currentTime + 0.8);
  scheduleKlaxon();

  // Layer 3 — piercing high alert with fast tremolo.
  const highOsc = c.createOscillator();
  highOsc.type = 'sine';
  highOsc.frequency.value = 1850;
  const highGain = c.createGain();
  highGain.gain.value = 0.05;
  const tremolo = c.createOscillator();
  tremolo.type = 'sine';
  tremolo.frequency.value = 6.5;
  const tremoloGain = c.createGain();
  tremoloGain.gain.value = 0.045;
  tremolo.connect(tremoloGain);
  tremoloGain.connect(highGain.gain);
  tremolo.start();
  highOsc.connect(highGain);
  highGain.connect(masterGain);
  highGain.connect(reverbNode);
  highOsc.start();
  track(tremolo);
  track(highOsc);

  // Layer 4 — percussive impact hits.
  const playImpact = () => {
    if (!running || !ctx) return;
    const now = ctx.currentTime;

    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(85, now);
    boom.frequency.exponentialRampToValueAtTime(28, now + 0.55);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0, now);
    boomGain.gain.linearRampToValueAtTime(0.9, now + 0.008);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    boom.connect(boomGain);
    boomGain.connect(masterGain);
    boomGain.connect(reverbNode);
    boom.start(now);
    boom.stop(now + 0.75);

    const crack = ctx.createOscillator();
    crack.type = 'sawtooth';
    crack.frequency.setValueAtTime(1400, now);
    crack.frequency.exponentialRampToValueAtTime(240, now + 0.18);
    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.value = 900;
    crackFilter.Q.value = 3;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0, now);
    crackGain.gain.linearRampToValueAtTime(0.35, now + 0.004);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(masterGain);
    crackGain.connect(reverbNode);
    crack.start(now);
    crack.stop(now + 0.28);
  };
  later(playImpact, 300);
  every(playImpact, 2000);

  // Layer 5 — sweeping noise tension bed.
  const noiseBuffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
  const nd = noiseBuffer.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noiseSrc = c.createBufferSource();
  noiseSrc.buffer = noiseBuffer;
  noiseSrc.loop = true;
  const noiseFilter = c.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 500;
  noiseFilter.Q.value = 6;
  const sweepLFO = c.createOscillator();
  sweepLFO.type = 'sine';
  sweepLFO.frequency.value = 0.18;
  const sweepGain = c.createGain();
  sweepGain.gain.value = 900;
  sweepLFO.connect(sweepGain);
  sweepGain.connect(noiseFilter.frequency);
  sweepLFO.start();
  const noiseGain = c.createGain();
  noiseGain.gain.value = 0.085;
  noiseSrc.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseGain.connect(reverbNode);
  noiseSrc.start();
  track(sweepLFO);
  track(noiseSrc);

  // Layer 6 — detuned metallic scrape.
  const scrapeBus = c.createGain();
  scrapeBus.gain.value = 0.035;
  const scrapeHP = c.createBiquadFilter();
  scrapeHP.type = 'highpass';
  scrapeHP.frequency.value = 1800;
  scrapeBus.connect(scrapeHP);
  scrapeHP.connect(masterGain);
  scrapeHP.connect(reverbNode);
  [1, 1.006, 0.994].forEach((mult) => {
    const saw = c.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = 2200 * mult;
    saw.connect(scrapeBus);
    saw.start();
    track(saw);
  });
  const scrapeLFO = c.createOscillator();
  scrapeLFO.type = 'sine';
  scrapeLFO.frequency.value = 0.7;
  const scrapeLFOGain = c.createGain();
  scrapeLFOGain.gain.value = 0.03;
  scrapeLFO.connect(scrapeLFOGain);
  scrapeLFOGain.connect(scrapeBus.gain);
  scrapeLFO.start();
  track(scrapeLFO);
  master = masterGain;
  reverb = reverbNode;
}

/** Starts the warning sound (idempotent). Safe to call without a gesture. */
export function startDangerSound(): void {
  const Ctor = getCtor();
  if (!Ctor) return;
  try {
    if (!ctx) {
      ctx = new Ctor({ latencyHint: 'interactive' });
    }
    if (!started) {
      started = true;
      initGraph(ctx);
    }
    if (running) return;

    const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    void resume
      .then(() => {
        if (!ctx || !master) return;
        running = true;
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(MASTER_VOLUME, now + FADE_IN_SECONDS);
      })
      .catch(() => {
        // Retried on the next interaction.
      });
  } catch {
    // Audio is best-effort.
  }
}

/** Stops and tears down the warning sound. */
export function stopDangerSound(): void {
  running = false;
  while (timers.length) {
    const id = timers.pop();
    if (id !== undefined) {
      window.clearTimeout(id);
      window.clearInterval(id);
    }
  }
  while (sources.length) {
    const src = sources.pop();
    try {
      src?.stop();
    } catch {
      // already stopped
    }
  }
  if (ctx) {
    try {
      void ctx.close();
    } catch {
      // ignore
    }
  }
  ctx = null;
  master = null;
  reverb = null;
  started = false;
}

export function isDangerSoundRunning(): boolean {
  return running;
}
