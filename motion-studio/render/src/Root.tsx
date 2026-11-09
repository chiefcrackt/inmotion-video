import React from 'react';
import { Composition } from 'remotion';
// spec.json is exported from Motion Studio 2 and copied into this folder.
import spec from '../spec.json';
import { MotionPiece } from './MotionPiece';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="motion-piece"
    component={MotionPiece}
    durationInFrames={spec.frames}
    fps={spec.fps}
    width={spec.width}
    height={spec.height}
    defaultProps={{ spec }}
  />
);
