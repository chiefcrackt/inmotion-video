import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

// Mirrors motion-studio/model.mjs frameState(): same start times and lengths,
// so the render matches the browser preview.
type Spec = {
  fps: number;
  width: number;
  height: number;
  frames: number;
  background: 'navy' | 'green';
  events: { at: number; type: string }[];
  scene: { eyebrow: string; headline: string; sub: string };
  brand: {
    enabled: boolean;
    navy: string;
    gold: string;
    teal: string;
    paper: string;
    font: string;
    headlineWeight: number;
    eyebrowWeight: number;
    safeZone: { top: number; bottom: number };
  };
};

export const MotionPiece: React.FC<{ spec: Spec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const t = frame / spec.fps;
  const { brand, scene, width, height } = spec;
  const scale = width / 1920;
  const pad = 120 * scale;
  const textTop =
    brand.safeZone.top * scale +
    (height - brand.safeZone.top - brand.safeZone.bottom) * 0.35;

  const eyebrowOpacity = interpolate(t, [0.2, 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headlineProgress = interpolate(t, [0.5, 0.9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOpacity = interpolate(t, [1.0, 1.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const crtOff = spec.events.some((e) => e.type === 'crt-off' && t >= e.at);
  const glitch = spec.events.some((e) => e.type === 'glitch' && Math.abs(t - e.at) < 0.1);

  const background = spec.background === 'green' ? '#00B140' : brand.navy;
  if (crtOff && spec.background !== 'green') {
    return <AbsoluteFill style={{ background: '#000' }} />;
  }

  const rise = (1 - headlineProgress) * 40 * scale;
  const shift = glitch ? 14 * scale : 0;
  const headlineStyle: React.CSSProperties = {
    position: 'absolute',
    left: pad,
    top: textTop + rise,
    fontFamily: brand.font,
    fontWeight: brand.headlineWeight,
    fontSize: 150 * scale,
    textTransform: 'uppercase',
    color: brand.paper,
    opacity: headlineProgress,
    lineHeight: 1,
  };

  return (
    <AbsoluteFill style={{ background }}>
      {brand.enabled && spec.background !== 'green' && (
        <>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10 * scale, background: brand.gold }} />
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 200 * scale,
              width: 60 * scale,
              height: 160 * scale,
              background: brand.teal,
              transform: 'skewX(-30deg)',
            }}
          />
        </>
      )}
      {scene.eyebrow && (
        <div
          style={{
            position: 'absolute',
            left: pad,
            top: textTop - 70 * scale,
            fontFamily: brand.font,
            fontWeight: brand.eyebrowWeight,
            fontSize: 34 * scale,
            letterSpacing: 4 * scale,
            textTransform: 'uppercase',
            color: brand.gold,
            opacity: eyebrowOpacity,
          }}
        >
          {scene.eyebrow}
        </div>
      )}
      {glitch && (
        <>
          <div style={{ ...headlineStyle, left: pad - shift, color: brand.teal }}>{scene.headline}</div>
          <div style={{ ...headlineStyle, left: pad + shift, color: brand.gold }}>{scene.headline}</div>
        </>
      )}
      <div style={headlineStyle}>{scene.headline}</div>
      {scene.sub && (
        <div
          style={{
            position: 'absolute',
            left: pad,
            top: textTop + 150 * scale + 40 * scale,
            fontFamily: brand.font,
            fontWeight: 700,
            fontSize: 56 * scale,
            color: brand.paper,
            opacity: subOpacity,
          }}
        >
          {scene.sub}
        </div>
      )}
      {brand.enabled && spec.background !== 'green' && (
        <div
          style={{
            position: 'absolute',
            left: pad,
            bottom: (brand.safeZone.bottom || 60 * scale) - 20 * scale,
            fontFamily: brand.font,
            fontWeight: 700,
            fontSize: 36 * scale,
            color: brand.paper,
            display: 'flex',
            alignItems: 'center',
            gap: 30 * scale,
          }}
        >
          <span style={{ width: 24 * scale, height: 24 * scale, borderRadius: 12 * scale, background: brand.teal, display: 'inline-block' }} />
          TRISTAN.INMOTION
        </div>
      )}
    </AbsoluteFill>
  );
};
