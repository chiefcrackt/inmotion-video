import { preset, CATEGORIES } from './model.mjs';
// All factory sounds are synthesized; no licensed or third-party samples.
const recipes = [
  ['Cyber Glitch', 0, 'square', 780, 120, 0.48, 24, 180, 1800, 0.35],
  ['Signal Corruption', 0, 'noise', 240, 180, 0.85, 38, 500, 3200, 0.6],
  ['Digital Stutter', 0, 'sawtooth', 460, 920, 0.65, 16, 80, 6000, 0.2],
  ['Data Transmission', 0, 'sine', 1800, 2600, 1.1, 30, 900, 9000, 0.05],
  ['Retro Computer', 0, 'square', 220, 880, 0.38, 8, 0, 4500, 0.1],
  ['Heavy Impact', 1, 'sine', 180, 35, 0.7, 0, 0, 1400, 0.3],
  ['Sub Bass Hit', 1, 'sine', 85, 28, 1, 0, 0, 600, 0.1],
  ['Metallic Slam', 1, 'triangle', 1200, 180, 0.55, 0, 800, 6500, 0.5],
  ['Cinematic Boom', 1, 'sine', 110, 32, 1.8, 0, 25, 2400, 0.25],
  ['Punch Transient', 1, 'noise', 300, 100, 0.15, 0, 0, 9000, 0.65],
  ['Fast Whoosh', 2, 'noise', 220, 1800, 0.35, 0, 0, 6500, 0.05],
  ['Reverse Sweep', 2, 'noise', 100, 900, 1.2, 0, 0, 4200, 0.1],
  ['Speed Ramp', 2, 'sawtooth', 65, 1400, 0.8, 0, 60, 5000, 0.2],
  ['Air Swipe', 2, 'noise', 200, 800, 0.55, 0, 0, 14000, 0],
  ['Laser Pass', 2, 'sine', 2800, 80, 0.4, 0, 120, 9000, 0.15],
  ['Mechanical Lock', 3, 'square', 340, 80, 0.22, 12, 160, 2200, 0.35],
  ['Hydraulic Release', 3, 'noise', 400, 60, 1, 0, 0, 3000, 0.25],
  ['Servo Movement', 3, 'sawtooth', 110, 440, 0.85, 18, 240, 1800, 0.15],
  ['Gear Ratchet', 3, 'triangle', 600, 140, 0.6, 45, 170, 3800, 0.4],
  ['Power Switch', 3, 'square', 90, 240, 0.18, 0, 400, 1700, 0.5],
  ['Data Confirm', 4, 'sine', 880, 1320, 0.3, 0, 0, 12000, 0],
  ['UI Click', 4, 'noise', 1000, 800, 0.035, 0, 0, 14000, 0.1],
  ['Warning Alert', 4, 'square', 660, 660, 0.9, 6, 120, 2800, 0.1],
  ['Scanner Pulse', 4, 'sine', 1400, 400, 0.65, 10, 70, 5000, 0.05],
  ['Soft Notification', 4, 'triangle', 523, 1046, 0.65, 0, 0, 7500, 0],
  ['Dark Riser', 5, 'sawtooth', 40, 320, 3.5, 0, 25, 2000, 0.2],
  ['Suspense Drone', 5, 'triangle', 55, 58, 5, 0, 7, 900, 0.1],
  ['Electronic Hum', 5, 'sine', 60, 60, 4, 0, 12, 1200, 0.15],
  ['Deep Space', 5, 'noise', 50, 120, 4.5, 0, 0, 700, 0.1],
  ['Tension Pulse', 5, 'sawtooth', 82, 110, 3, 4, 35, 1600, 0.2],
];
export const FACTORY = recipes.map(
  (
    [
      name,
      c,
      source,
      frequency,
      endFrequency,
      duration,
      pulse,
      modDepth,
      lowpass,
      distortion,
    ],
    i,
  ) => {
    const atmosphere = c === 5,
      whoosh = c === 2,
      impact = c === 1;
    const main = {
      name: 'Body',
      source:
        source === 'noise' && (whoosh || atmosphere || c === 3)
          ? 'filtered-noise'
          : source,
      frequency,
      endFrequency,
      duration,
      pulse,
      modDepth,
      modRate: 15 + i * 3,
      lowpass,
      distortion,
      volume: 0.45,
      attack: atmosphere ? 0.6 : whoosh ? duration * 0.5 : 0.002,
      decay: impact ? 0.08 : 0.15,
      sustain: impact ? 0.08 : 0.65,
      release: atmosphere ? 1 : 0.15,
      fadeIn: whoosh ? duration * 0.65 : 0.002,
      fadeOut: whoosh ? 0.04 : 0.08,
      reverb: atmosphere ? 0.35 : impact ? 0.2 : 0.06,
      reverbTime: atmosphere ? 2 : 1,
      reverse: name === 'Reverse Sweep',
    };
    const accent = {
      name: impact ? 'Transient' : 'Accent',
      source: impact ? 'noise' : 'sine',
      frequency: frequency * 1.5,
      endFrequency: Math.max(25, endFrequency * 0.75),
      duration: impact ? 0.07 : duration * 0.65,
      start: impact ? 0 : duration * 0.18,
      volume: impact ? 0.28 : 0.12,
      pan: i % 2 ? 0.25 : -0.25,
      lowpass: impact ? 8000 : 4000,
      highpass: impact ? 1000 : 20,
      attack: 0.002,
      sustain: 0.15,
      release: 0.15,
      delay: c === 0 || c === 4 ? 0.28 : 0,
      delayTime: 0.09 + i * 0.003,
    };
    return preset({
      version: 1,
      id: `factory-${i}`,
      name,
      category: CATEGORIES[c],
      seed: 1001 + i * 733,
      layers: [main, accent],
    });
  },
);

// Data-kit hits from the T.im data videos (ghost races, replays, tier reels).
// Hand-built so they match the Beat Bed / Tier List kit; ids continue the factory list.
const hit = (o) => ({
  volume: 0.32,
  attack: 0.004,
  decay: 0.12,
  sustain: 0.25,
  release: 0.12,
  fadeIn: 0.002,
  fadeOut: 0.05,
  ...o,
});
const kit = [
  [
    'Synth Stab',
    1,
    [
      hit({ name: 'Root', source: 'square', frequency: 329.63, endFrequency: 329.63, duration: 0.32, lowpass: 2600, pan: -0.15 }),
      hit({ name: 'Third', source: 'square', frequency: 392, endFrequency: 392, duration: 0.32, lowpass: 2600 }),
      hit({ name: 'Fifth', source: 'square', frequency: 493.88, endFrequency: 493.88, duration: 0.32, lowpass: 2600, pan: 0.15 }),
      hit({ name: 'Detune', source: 'sawtooth', frequency: 331.6, endFrequency: 331.6, duration: 0.32, lowpass: 2200, volume: 0.2, reverb: 0.12 }),
    ],
  ],
  [
    'Mile Tick',
    4,
    [
      hit({ name: 'Tick', source: 'square', frequency: 1760, endFrequency: 1760, duration: 0.07, lowpass: 4000, volume: 0.3, sustain: 0.6 }),
      hit({ name: 'Tock', source: 'square', frequency: 2349, endFrequency: 2349, duration: 0.07, start: 0.07, lowpass: 4000, volume: 0.22, sustain: 0.6 }),
    ],
  ],
  [
    'Finish Chime',
    4,
    [
      hit({ name: 'Note 1', source: 'square', frequency: 1318.5, endFrequency: 1318.5, duration: 0.3, lowpass: 6000, volume: 0.22, reverb: 0.2 }),
      hit({ name: 'Note 2', source: 'square', frequency: 1975.5, endFrequency: 1975.5, duration: 0.3, start: 0.06, lowpass: 6000, volume: 0.2, reverb: 0.2 }),
      hit({ name: 'Note 3', source: 'square', frequency: 2637, endFrequency: 2637, duration: 0.3, start: 0.12, lowpass: 6000, volume: 0.18, reverb: 0.2 }),
    ],
  ],
  [
    'Down Sweep',
    2,
    [
      hit({ name: 'Sweep', source: 'sawtooth', frequency: 900, endFrequency: 40, duration: 0.45, lowpass: 3000, volume: 0.36, sustain: 0.6 }),
      hit({ name: 'Sub', source: 'sine', frequency: 95, endFrequency: 30, duration: 0.75, volume: 0.5, sustain: 0.4, release: 0.3 }),
    ],
  ],
  [
    'CRT Power-Down',
    0,
    [
      hit({ name: 'Whine', source: 'sine', frequency: 2400, endFrequency: 60, duration: 0.55, volume: 0.22, sustain: 0.7, release: 0.2 }),
      hit({ name: 'Static', source: 'filtered-noise', frequency: 3000, endFrequency: 800, duration: 0.18, highpass: 1500, volume: 0.2, sustain: 0.3 }),
      hit({ name: 'Thump', source: 'sine', frequency: 120, endFrequency: 38, duration: 0.4, start: 0.42, volume: 0.45, sustain: 0.3 }),
      hit({ name: 'Click', source: 'noise', frequency: 1000, endFrequency: 1000, duration: 0.03, start: 0.5, highpass: 3000, volume: 0.3, sustain: 0.2 }),
    ],
  ],
];
kit.forEach(([name, c, layers], i) =>
  FACTORY.push(
    preset({
      version: 1,
      id: `factory-${30 + i}`,
      name,
      category: CATEGORIES[c],
      seed: 52001 + i * 733,
      layers,
    }),
  ),
);
