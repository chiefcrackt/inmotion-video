// Fit wardrobe textures to Tristan's authored silhouettes and garment seams.
// This runs once per outfit; the animation continues to use the original rig.
window.fitRiverOutfit = function (generated, original, id) {
  var fitted = {};
  var palette = {
    race: {
      torso: '#0096a5',
      shorts: '#142c4b',
      thigh: '#142c4b',
      upperarm: '#d09b77',
      shin: '#f2f2f1',
      shoe: '#ff6157',
    },
    trail: {
      torso: '#dc671b',
      shorts: '#303338',
      thigh: '#303338',
      upperarm: '#dc671b',
      shin: '#565b2f',
      shoe: '#b58b24',
    },
    winter: {
      torso: '#0654cd',
      shorts: '#202124',
      thigh: '#202124',
      shin: '#202124',
      upperarm: '#0654cd',
      forearm: '#0654cd',
      forearm_far: '#0654cd',
      shoe: '#c5ed13',
    },
  };
  function canvas(im) {
    var c = document.createElement('canvas');
    c.width = im.naturalWidth || im.width;
    c.height = im.naturalHeight || im.height;
    return c;
  }
  function skinHem(im, first) {
    var c = canvas(im),
      x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    var d = x.getImageData(0, 0, c.width, c.height).data,
      rows = [];
    // Original seam uses the middle; fabric crop also checks side split notches.
    for (
      var col = Math.floor(c.width * (first ? 0.1 : 0.35));
      col < c.width * (first ? 0.9 : 0.65);
      col++
    ) {
      for (var row = Math.floor(c.height * 0.15); row < c.height * 0.8; row++) {
        var p = (row * c.width + col) * 4,
          r = d[p],
          g = d[p + 1],
          b = d[p + 2];
        // Skin has substantially more blue than the original gold sleeve.
        if (
          d[p + 3] > 180 &&
          r > 120 &&
          r > g * 1.17 &&
          g > b * 1.12 &&
          b > g * 0.65
        ) {
          rows.push(row);
          break;
        }
      }
    }
    rows.sort(function (a, b) {
      return a - b;
    });
    return rows.length
      ? rows[first ? 0 : Math.floor(rows.length / 2)]
      : Math.round(c.height * 0.5);
  }
  Object.keys(original).forEach(function (name) {
    var src = original[name],
      art = generated[name];
    if (
      name === 'head' ||
      (id !== 'winter' && (name === 'forearm' || name === 'forearm_far'))
    ) {
      fitted[name] = src;
      return;
    }
    var c = canvas(src),
      x = c.getContext('2d'),
      w = c.width,
      h = c.height;
    x.fillStyle = palette[id][name] || '#d09b77';
    x.fillRect(0, 0, w, h);
    if (id !== 'winter' && name === 'thigh') {
      // Anchor the shorts hem to the original thigh, leaving the original knee.
      x.drawImage(src, 0, 0);
      var target = skinHem(src),
        from = Math.max(1, skinHem(art, true) - 2);
      x.fillRect(0, 0, w, target);
      x.drawImage(art, 0, 0, w, from, 0, 0, w, target);
    } else if (id !== 'winter' && name === 'shin') {
      // The original calf and knee remain intact; only the sock changes.
      x.drawImage(src, 0, 0);
      var target = Math.round(h * 0.7);
      x.drawImage(art, 0, target, w, h - target, 0, target, w, h - target);
    } else x.drawImage(art, 0, 0, w, h);
    // Match the original alpha at every joint, not only the image bounds.
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(src, 0, 0);
    if (id === 'race' && name === 'shorts') {
      // The pelvis must not retain a stationary shorts leg below the hip.
      // The two animated thigh pieces supply the shorts legs themselves.
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(w, 0);
      x.lineTo(w, h * 0.52);
      x.bezierCurveTo(w * 0.8, h * 0.64, w * 0.65, h * 0.68, w * 0.5, h * 0.68);
      x.bezierCurveTo(w * 0.35, h * 0.68, w * 0.2, h * 0.64, 0, h * 0.52);
      x.closePath();
      x.fill();
    }
    if (name === 'torso' && (id === 'race' || id === 'winter')) {
      // These clothes have no hydration vest. Flatten its inherited front
      // contour without cutting off the jacket zipper or moving the shoulder.
      var slim = canvas(src),
        sx = slim.getContext('2d');
      var hinge = Math.floor(w * 0.45);
      for (var row = 0; row < h; row++) {
        var chest = Math.max(0, Math.min(1, (row / h - 0.12) / 0.2));
        var waist = Math.max(0, Math.min(1, (row / h - 0.55) / 0.45));
        chest = chest * chest * (3 - 2 * chest);
        waist = waist * waist * (3 - 2 * waist);
        var reduction = w * 0.16 * chest * (1 - waist);
        sx.drawImage(c, 0, row, hinge, 1, 0, row, hinge, 1);
        sx.drawImage(
          c,
          hinge,
          row,
          w - hinge,
          1,
          hinge,
          row,
          w - hinge - reduction,
          1,
        );
      }
      c = slim;
    }
    fitted[name] = c;
  });
  return fitted;
};
