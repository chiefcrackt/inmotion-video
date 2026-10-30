/* Distinct scenes share the existing stride clock, tiling and palette treatment. */
(() => {
  const { strip, motion, mix, alpha, color } = window.RiverParallax;
  const definitions = {
    cyberpunk: {
      name: 'Cyberpunk city run',
      layers: ['distant', 'middle', 'ground'],
    },
    mountain: {
      name: 'Mountain trail',
      layers: ['distant', 'middle', 'ground', 'foreground'],
    },
  };
  const cache = new Map();
  const mod = (x, period) => ((x % period) + period) % period;
  const ids = ['riverside', ...Object.keys(definitions)];
  function load(id) {
    if (id === 'riverside') return window.RiverRiverside.load();
    const definition = definitions[id];
    if (!definition) return Promise.reject(Error('Choose a moving scene.'));
    if (cache.has(id)) return cache.get(id).pending;
    const entry = { images: {}, bottoms: {} };
    cache.set(id, entry);
    entry.pending = Promise.all(
      definition.layers.map(
        (layer) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              entry.images[layer] = image;
              if (layer === 'middle' || layer === 'distant') {
                const c = document.createElement('canvas');
                c.width = image.width;
                c.height = image.height;
                const ctx = c.getContext('2d');
                ctx.drawImage(image, 0, 0);
                const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
                let bottom = c.height - 1;
                rows: for (; bottom >= 0; bottom--)
                  for (let x = 0; x < c.width; x++)
                    if (pixels[(bottom * c.width + x) * 4 + 3] > 24) break rows;
                entry.bottoms[layer] = Math.max(1, bottom + 1);
              }
              resolve();
            };
            image.onerror = () =>
              reject(
                Error(
                  'The ' +
                    definition.name.toLowerCase() +
                    ' artwork could not load. Please try again.',
                ),
              );
            image.src =
              layer === 'foreground'
                ? 'scenes/riverside/reeds.webp'
                : 'scenes/' + id + '/' + layer + '.webp';
          }),
      ),
    ).catch((error) => {
      cache.delete(id);
      throw error;
    });
    return entry.pending;
  }
  function ready(id) {
    if (id === 'riverside') return window.RiverRiverside.ready;
    return (
      !!definitions[id] &&
      definitions[id].layers.every((layer) => cache.get(id)?.images[layer])
    );
  }
  function artwork(entry, layer, theme) {
    const image = entry.images[layer];
    return theme === 'tim'
      ? image
      : window.TimBackgrounds.themedImage(image, [
          color('#0E1A2E', theme),
          color('#F6F4EF', theme),
          color('#2E9BAD', theme),
        ]);
  }
  function drawBack(id, ctx, g, time, speed, theme) {
    if (id === 'riverside')
      return window.RiverRiverside.drawBack(ctx, g, time, speed, theme);
    if (!ready(id)) return;
    const entry = cache.get(id),
      city = id === 'cyberpunk',
      { W, H, gy } = g,
      m = motion(g, time, speed);
    const navy = color('#0E1A2E', theme),
      teal = color('#2E9BAD', theme),
      gold = color('#E8C96A', theme);
    const pathTop = gy - H * 0.105;
    ctx.save();
    const sky = ctx.createLinearGradient(0, 0, 0, pathTop);
    sky.addColorStop(0, navy);
    sky.addColorStop(1, mix(navy, teal, city ? 0.18 : 0.31));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // Stationary sky lights accentuate the difference between sky and moving land.
    if (city) {
      for (let i = 0; i < 34; i++) {
        const x = mod(i * H * 0.273, W),
          y = H * (0.06 + ((i * 17) % 29) / 100);
        ctx.fillStyle = alpha(i % 4 ? teal : gold, 0.12 + (i % 3) * 0.05);
        ctx.fillRect(x, y, H * 0.0015, H * 0.0015);
      }
      const haze = ctx.createLinearGradient(0, H * 0.3, 0, pathTop);
      haze.addColorStop(0, alpha(teal, 0));
      haze.addColorStop(1, alpha(teal, 0.2));
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, pathTop);
    } else {
      const x = W * 0.73,
        y = H * 0.19,
        r = H * 0.058;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      glow.addColorStop(0, alpha(gold, 0.28));
      glow.addColorStop(1, alpha(gold, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H * 0.6);
      ctx.fillStyle = alpha(gold, 0.7);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const farBase = city ? pathTop - H * 0.095 : H * 0.57;
    const farHeight = H * (city ? 0.62 : 0.6);
    strip(
      ctx,
      artwork(entry, 'distant', theme),
      W,
      m.hills,
      farBase - farHeight,
      H * (city ? 2.1 : 2.65),
      farHeight,
      entry.bottoms.distant,
    );
    if (!city) {
      const valley = ctx.createLinearGradient(0, farBase, 0, pathTop);
      valley.addColorStop(0, mix(navy, teal, 0.24));
      valley.addColorStop(1, mix(navy, teal, 0.11));
      ctx.fillStyle = valley;
      ctx.fillRect(0, farBase, W, pathTop - farBase);
      // Low rolling valley slopes keep the alpine middle distance from reading as water.
      for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = mix(navy, teal, 0.19 - layer * 0.045);
        ctx.beginPath();
        ctx.moveTo(0, pathTop);
        for (let x = 0; x <= W + 12; x += 12) {
          const u = x + m.riverbank * (0.35 + layer * 0.2);
          const y =
            farBase +
            H * (0.035 + layer * 0.045) +
            Math.sin(u / (H * 0.31) + layer) * H * 0.023 +
            Math.sin(u / (H * 0.12)) * H * 0.009;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, pathTop);
        ctx.closePath();
        ctx.fill();
      }
    }
    const middleHeight = H * (city ? 0.43 : 0.32),
      middleBase = pathTop + H * 0.008;
    strip(
      ctx,
      artwork(entry, 'middle', theme),
      W,
      m.riverbank,
      middleBase - middleHeight,
      H * (city ? 1.5 : 1.2),
      middleHeight,
      entry.bottoms.middle,
    );
    ctx.fillStyle = mix(navy, teal, 0.24);
    ctx.fillRect(0, pathTop - H * 0.009, W, H * 0.018);
    strip(
      ctx,
      artwork(entry, 'ground', theme),
      W,
      m.ground,
      pathTop,
      m.groundTile,
      H - pathTop,
    );
    ctx.fillStyle = alpha(navy, theme === 'minimal' ? 0.1 : 0.22);
    ctx.fillRect(0, pathTop, W, H - pathTop);
    if (city) {
      // Pavement joins and reflected lights move at exactly the stride-derived ground speed.
      const period = H * 0.38,
        offset = mod(m.ground, period);
      ctx.lineWidth = H * 0.0014;
      for (let x = -offset; x < W + period; x += period) {
        ctx.strokeStyle = alpha(teal, 0.28);
        ctx.beginPath();
        ctx.moveTo(x, pathTop);
        ctx.lineTo(x, H);
        ctx.stroke();
        ctx.fillStyle = alpha(gold, 0.22);
        ctx.fillRect(x + H * 0.018, pathTop + H * 0.015, H * 0.035, H * 0.002);
      }
      ctx.strokeStyle = alpha(teal, 0.45);
      ctx.beginPath();
      ctx.moveTo(0, pathTop + H * 0.01);
      ctx.lineTo(W, pathTop + H * 0.01);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawFront(id, ctx, g, time, speed, theme) {
    if (id === 'riverside')
      return window.RiverRiverside.drawFront(ctx, g, time, speed, theme);
    if (!ready(id)) return;
    const m = motion(g, time, speed);
    ctx.save();
    if (id === 'mountain') {
      strip(
        ctx,
        artwork(cache.get(id), 'foreground', theme),
        g.W,
        m.foreground,
        g.H * 0.87,
        m.reedsTile,
        g.H * 0.17,
      );
    } else {
      const H = g.H,
        period = H * 1.25,
        offset = mod(m.foreground, period),
        navy = color('#0E1A2E', theme),
        teal = color('#2E9BAD', theme),
        gold = color('#E8C96A', theme);
      for (let x = -offset; x < g.W + period; x += period) {
        // Low near-camera light bollards pass in front, below the runner's knees.
        const y = H * 0.925,
          w = H * 0.026;
        ctx.fillStyle = navy;
        ctx.fillRect(x, y, w, H * 0.075);
        ctx.fillStyle = alpha(teal, 0.9);
        ctx.shadowColor = teal;
        ctx.shadowBlur = H * 0.009;
        ctx.fillRect(x + w * 0.25, y + H * 0.007, w * 0.5, H * 0.028);
        ctx.shadowBlur = 0;
        ctx.fillStyle = alpha(gold, 0.65);
        ctx.fillRect(x + w * 0.15, y + H * 0.042, w * 0.7, H * 0.003);
      }
    }
    ctx.restore();
  }
  window.RiverScenes = {
    ids,
    has: (id) => ids.includes(id),
    load,
    ready,
    drawBack,
    drawFront,
    motion,
  };
})();
