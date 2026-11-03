import { render as renderSound } from '../shared/sound/engine.mjs';
import { cueTimes } from './model.mjs';
export async function soundtrack(s) {
  const Offline =
    globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Offline)
    throw Error(
      'Audio rendering is unavailable. Choose Silent to export video.',
    );
  const ctx = new Offline(2, Math.ceil(s.duration * 48000), 48000);
  if (s.sound !== 'none') {
    const pulse = s.sound === 'pulse';
    const { buffer } = await renderSound({
      version: 1,
      name: 'T.im ' + s.sound,
      seed: 42,
      layers: [
        {
          source: pulse ? 'sine' : 'filtered-noise',
          duration: pulse ? 0.24 : 0.65,
          frequency: pulse ? 420 : 200,
          endFrequency: pulse ? 120 : 1600,
          volume: 0.5,
          lowpass: pulse ? 3000 : 3500,
          highpass: pulse ? 30 : 300,
          attack: 0.025,
          decay: 0.12,
          sustain: 0.15,
          release: 0.2,
          fadeIn: 0.025,
          fadeOut: 0.16,
        },
      ],
    });
    for (const t of cueTimes(s)) {
      const source = ctx.createBufferSource(),
        gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = s.volume / 100;
      source.connect(gain).connect(ctx.destination);
      source.start(t);
    }
  }
  return ctx.startRendering();
}
