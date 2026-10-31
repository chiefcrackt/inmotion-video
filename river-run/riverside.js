/* Layered riverside scene and reusable scrolling primitives. */
(() => {
  const images = {},
    bottoms = {};
  let pending;
  const ids = ['hills', 'riverbank', 'path', 'reeds'];
  const mod = (value, period) => ((value % period) + period) % period;
  const color = (hex, theme) => window.TimProjects.color(hex, theme);
  const rgb = (hex) =>
    [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  function mix(a, b, amount) {
    const x = rgb(a),
      y = rgb(b);
    return (
      'rgb(' +
      x
        .map((value, i) => Math.round(value * (1 - amount) + y[i] * amount))
        .join(',') +
      ')'
    );
  }
  function alpha(hex, amount) {
    return 'rgba(' + rgb(hex).join(',') + ',' + amount + ')';
  }
  function load() {
    if (pending) return pending;
    pending = Promise.all(
      ids.map(
        (id) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              // Fit the transparent bank to the waterline without changing the source PNG.
              if (id === 'riverbank') {
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0);
                const pixels = context.getImageData(
                  0,
                  0,
                  image.width,
                  image.height,
                ).data;
                let bottom = image.height - 1;
                rows: for (; bottom >= 0; bottom--) {
                  for (let x = 0; x < image.width; x++)
                    if (pixels[(bottom * image.width + x) * 4 + 3] > 24)
                      break rows;
                }
                bottoms[id] = Math.max(1, bottom + 1);
              }
              images[id] = image;
              resolve();
            };
            image.onerror = () =>
              reject(
                Error(
                  'The moving riverside artwork could not load. Please try again.',
                ),
              );
            image.src = 'scenes/riverside/' + id + '.webp';
          }),
      ),
    ).catch((error) => {
      pending = null;
      throw error;
    });
    return pending;
  }
  // Alternate original and mirrored tiles: boundary pixels always meet their own edge.
  // No crossfade, timer reset or disappearing gap when a tile crosses the viewport.
  function strip(
    ctx,
    image,
    W,
    xDistance,
    y,
    width,
    height,
    sourceHeight = image.height,
  ) {
    const tile = Math.floor(xDistance / width),
      offset = mod(xDistance, width);
    for (let index = -1; index <= Math.ceil(W / width) + 1; index++) {
      const left = index * width - offset,
        mirrored = mod(tile + index, 2) === 1;
      ctx.save();
      ctx.translate(left + (mirrored ? width : 0), y);
      ctx.scale(mirrored ? -1 : 1, 1);
      ctx.drawImage(
        image,
        0,
        0,
        image.width,
        sourceHeight,
        0,
        0,
        width,
        height,
      );
      ctx.restore();
    }
  }
  function artwork(id, theme) {
    return theme === 'tim'
      ? images[id]
      : window.TimBackgrounds.themedImage(images[id], [
          color('#0E1A2E', theme),
          color('#F6F4EF', theme),
          color('#2E9BAD', theme),
        ]);
  }
  function motion(g, time, speed) {
    const distance = time * speed;
    return {
      ground: distance,
      hills: distance * 0.045,
      riverbank: distance * 0.18,
      foreground: distance * 1.18,
      groundTile: g.H * 1.65,
      hillsTile: g.H * 2.4,
      bankTile: g.H * 0.95,
      reedsTile: g.H * 1.35,
    };
  }
  function drawBack(ctx, g, time, speed, theme) {
    if (!ids.every((id) => images[id])) return;
    const { W, H, gy } = g,
      m = motion(g, time, speed);
    const navy = color('#0E1A2E', theme),
      teal = color('#2E9BAD', theme),
      gold = color('#E8C96A', theme);
    const waterline = H * 0.52,
      pathTop = gy - H * 0.105;
    ctx.save();
    const sky = ctx.createLinearGradient(0, 0, 0, waterline);
    sky.addColorStop(0, navy);
    sky.addColorStop(1, mix(navy, teal, 0.28));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const sunX = W * 0.72,
      sunY = H * 0.25,
      radius = H * 0.07;
    const glow = ctx.createRadialGradient(
      sunX,
      sunY,
      0,
      sunX,
      sunY,
      radius * 3,
    );
    glow.addColorStop(0, alpha(gold, 0.23));
    glow.addColorStop(1, alpha(gold, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, waterline);
    ctx.fillStyle = alpha(gold, 0.64);
    ctx.beginPath();
    ctx.arc(sunX, sunY, radius, 0, Math.PI * 2);
    ctx.fill();
    strip(
      ctx,
      artwork('hills', theme),
      W,
      m.hills,
      waterline - H * 0.55,
      m.hillsTile,
      H * 0.55,
    );
    const river = ctx.createLinearGradient(0, waterline, 0, pathTop);
    river.addColorStop(0, mix(navy, teal, 0.25));
    river.addColorStop(1, mix(navy, teal, 0.08));
    ctx.fillStyle = river;
    ctx.fillRect(0, waterline, W, pathTop - waterline);
    strip(
      ctx,
      artwork('riverbank', theme),
      W,
      m.riverbank,
      waterline - H * 0.21,
      m.bankTile,
      H * 0.22,
      bottoms.riverbank,
    );
    // Small water streaks are continuous and deterministic, like the rest of the scene.
    ctx.lineWidth = Math.max(1, H / 900);
    for (let i = 0; i < 28; i++) {
      const y = waterline + (pathTop - waterline) * (0.12 + (i % 9) / 11);
      const x = mod(i * H * 0.173 - m.riverbank * 0.7, W + H * 0.14) - H * 0.07;
      ctx.strokeStyle = alpha(
        i % 4 === 0 ? gold : teal,
        0.09 + (i % 3) * 0.035,
      );
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + H * (0.025 + (i % 4) * 0.012), y);
      ctx.stroke();
    }
    strip(
      ctx,
      artwork('path', theme),
      W,
      m.ground,
      pathTop,
      m.groundTile,
      H - pathTop,
    );
    ctx.fillStyle = alpha(navy, theme === 'minimal' ? 0.12 : 0.22);
    ctx.fillRect(0, pathTop, W, H - pathTop);
    // Soft contact shadow where the background meets the path (no hard seam line).
    const seam = ctx.createLinearGradient(0, pathTop, 0, pathTop + H * 0.035);
    seam.addColorStop(0, alpha(navy, 0.55));
    seam.addColorStop(1, alpha(navy, 0));
    ctx.fillStyle = seam;
    ctx.fillRect(0, pathTop, W, H * 0.035);
    // Larger scattered stones make the speed legible without inventing a receding road.
    for (let i = 0; i < 38; i++) {
      const x = mod((i * m.groundTile) / 19 - m.ground, m.groundTile * 2);
      const y = pathTop + (H - pathTop) * (0.12 + ((i * 13) % 31) / 37);
      ctx.fillStyle = alpha(i % 3 ? teal : gold, 0.24);
      for (let shift = -2; shift <= 2; shift++) {
        ctx.beginPath();
        ctx.ellipse(
          x + shift * m.groundTile * 2,
          y,
          H * (0.0015 + (i % 3) * 0.0006),
          H * 0.001,
          0.2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawFront(ctx, g, time, speed, theme) {
    if (!images.reeds) return;
    const m = motion(g, time, speed);
    ctx.save();
    strip(
      ctx,
      artwork('reeds', theme),
      g.W,
      m.foreground,
      g.H * 0.81,
      m.reedsTile,
      g.H * 0.22,
    );
    ctx.restore();
  }
  window.RiverParallax = { strip, motion, mix, alpha, color };
  window.RiverRiverside = {
    load,
    drawBack,
    drawFront,
    motion,
    get ready() {
      return ids.every((id) => images[id]);
    },
  };
})();
