/* Shared kinetic text engine: how words arrive, and how one phrase morphs into another.
   Tools set the canvas font and fill, then call TimKinetic.draw() with the lines they
   would have drawn. Every frame is a pure function of time with seeded randomness, so
   preview, scrubbing and recordings match frame for frame. Exits stay with TimExits.

   spec = {
     lines: [{ text, x, y }],   // baselines, in the canvas's current coordinates
     align: 'left' | 'center' | 'right',
     t: seconds since the entrance starts (may be negative),
     len: seconds the entrance takes,
     style: one of TimKinetic.styles ids,
     seed: any integer (vary per element so they don't share randomness),
     opaque: true on green screen: no part-transparent fades, so Chroma Key stays clean,
     to: { lines: [...] } | null,      // what to morph into, laid out like lines
     morph: one of TimKinetic.morphs ids,
     morphAt: seconds (same clock as t) when the morph starts,
     morphLen: seconds the morph takes,
     mt: optional clock for the morph (defaults to t), for tools that replay t backwards,
     maxWidth: optional widest a punched word may grow to, in the same units as x,
     perChar: true to space letters by their single widths (for tools that draw one
       letter at a time), so the hand-off to the tool's own drawing doesn't shift,
     passes: optional layers, drawn in order, e.g. an outline then a fill:
       [{ op: 'stroke', style: '#0E1A2E', width: 14, dx: 0, dy: 0 }, { op: 'fill', style: '#E8C96A' }]
       Without passes, letters use the canvas's current fill.
   }
   Once a morph has finished, any replay of the entrance (a Reverse exit) uses the new text.
   draw(c, spec, line) returns false when the tool should draw its own Original
   entrance. Pass `line` to draw one line (for per-line exits); the whole block is
   drawn on line 0 while a morph or word punch needs the full block at once. */
(function () {
  'use strict';
  var STYLES = [
    ['original', 'Original', ''],
    ['cascade', 'Letter cascade', 'Letters'],
    ['bounce', 'Letter bounce', 'Letters'],
    ['wave', 'Letter wave', 'Letters'],
    ['flip', 'Letter flip', 'Letters'],
    ['decode', 'Decode', 'Letters'],
    ['words', 'Word by word', 'Words'],
    ['punch', 'Word punch', 'Words'],
    ['slice', 'Slice reveal', 'Split & mask'],
    ['mask', 'Mask rise', 'Split & mask'],
    ['split', 'Split', 'Split & mask'],
  ];
  var MORPHS = [
    ['none', 'No morph'],
    ['glide', 'Word to word'],
    ['scramble', 'Scramble'],
    ['liquid', 'Liquid'],
  ];
  var IDS = STYLES.map(function (s) {
    return s[0];
  });
  var UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>?';
  var LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789#%&*+=/<>?';

  function clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  function lerp(a, b, k) {
    return a + (b - a) * k;
  }
  function eOut(x) {
    x = clamp(x);
    return 1 - Math.pow(1 - x, 3);
  }
  function eIn(x) {
    x = clamp(x);
    return x * x * x;
  }
  function eInOut(x) {
    x = clamp(x);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
  function back(x) {
    x = clamp(x);
    var c1 = 1.70158,
      c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }
  function bounce(x) {
    x = clamp(x);
    var n = 7.5625,
      d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  }
  function smooth(a, b, x) {
    var k = clamp((x - a) / (b - a));
    return k * k * (3 - 2 * k);
  }
  // Deterministic 0..1 from integers, so the same frame always shows the same noise.
  function hash(a, b) {
    var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function noiseChar(target, seed, i, frame) {
    var set = /[a-z]/.test(target) ? LOWER : UPPER;
    return set[Math.floor(hash(seed * 131 + i, frame) * set.length)];
  }

  // ---------- layout: glyph positions from prefix widths (keeps kerning and tracking)
  // measure(text) -> width. Pure, so tests can use a fake measure.
  function layoutWith(measure, lines, align, size) {
    var glyphs = [],
      words = [],
      out = [];
    lines.forEach(function (line, li) {
      var chars = Array.from(String(line.text || '')),
        px = [0];
      for (var i = 1; i <= chars.length; i++)
        px.push(measure(chars.slice(0, i).join('')));
      var w = px[chars.length],
        x0 =
          align === 'center' ? line.x - w / 2 : align === 'right' ? line.x - w : line.x,
        word = null;
      out.push({ text: chars.join(''), x0: x0, x1: x0 + w, y: line.y, w: w });
      chars.forEach(function (ch, i) {
        if (/\s/.test(ch)) {
          word = null;
          return;
        }
        var g = {
          ch: ch,
          x: x0 + px[i],
          w: px[i + 1] - px[i],
          y: line.y,
          line: li,
          i: glyphs.length,
        };
        if (!word) {
          word = { line: li, glyphs: [], x0: g.x, x1: g.x + g.w, y: line.y, i: words.length };
          words.push(word);
        }
        word.glyphs.push(g);
        word.x1 = g.x + g.w;
        g.word = word.i;
        glyphs.push(g);
      });
    });
    var x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    out.forEach(function (l) {
      x0 = Math.min(x0, l.x0);
      x1 = Math.max(x1, l.x1);
      y0 = Math.min(y0, l.y - size * 0.95);
      y1 = Math.max(y1, l.y + size * 0.25);
    });
    return {
      glyphs: glyphs,
      words: words,
      lines: out,
      size: size,
      box: out.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 },
    };
  }
  var cache = new Map();
  function fontSize(c) {
    var m = /(\d+(?:\.\d+)?)px/.exec(c.font);
    return m ? parseFloat(m[1]) : 16;
  }
  function layout(c, lines, align, perChar) {
    var key = c.font + '|' + (c.letterSpacing || '') + '|' + align + '|' + (perChar ? 1 : 0) + '|' + JSON.stringify(lines);
    var hit = cache.get(key);
    if (hit) return hit;
    if (cache.size > 300) cache.clear();
    c.save();
    c.textAlign = 'left';
    var L = layoutWith(
      perChar
        ? function (s) {
            var w = 0;
            for (var ch of Array.from(s)) w += c.measureText(ch).width;
            return w;
          }
        : function (s) {
            return c.measureText(s).width;
          },
      lines,
      align,
      fontSize(c),
    );
    c.restore();
    cache.set(key, L);
    return L;
  }

  // ---------- timing: units arrive one after another and the last lands at `len`
  function unitProgress(i, n, t, len, frac) {
    var piece = Math.max(0.12, Math.min(0.7, len * (frac || 0.45)));
    if (n <= 1) return clamp(t / Math.max(piece, len));
    var stagger = Math.max(0, len - piece) / (n - 1);
    return clamp((t - i * stagger) / piece);
  }
  function phase(spec) {
    if (!spec.to || !spec.morph || spec.morph === 'none') return { k: 0, state: 'from' };
    var k = clamp(((spec.mt != null ? spec.mt : spec.t) - spec.morphAt) / Math.max(0.05, spec.morphLen));
    return { k: k, state: k <= 0 ? 'from' : k >= 1 ? 'to' : 'morph' };
  }

  // ---------- drawing helpers
  function glyphAt(c, g, size, ch, tx, ty, sx, sy, alpha) {
    if (alpha <= 0 || sx === 0 || sy === 0) return;
    c.save();
    if (alpha < 1) c.globalAlpha *= alpha;
    var cx = g.x + g.w / 2,
      cy = g.y - size * 0.35;
    c.translate(cx + tx, cy + ty);
    if (sx !== 1 || sy !== 1) c.scale(sx, sy);
    put(c, ch, -g.w / 2, size * 0.35);
    c.restore();
  }
  function alphaFor(spec, a) {
    return spec.opaque ? (a > 0 ? 1 : 0) : clamp(a);
  }
  // The pass being drawn: tools with outlines or shadows list layers (passes) and
  // every letter is drawn once per layer, so outlines never cut into neighbours.
  var PASS = null;
  function put(c, text, x, y) {
    if (PASS && PASS.op === 'stroke') c.strokeText(text, x + PASS.dx, y + PASS.dy);
    else if (PASS) c.fillText(text, x + PASS.dx, y + PASS.dy);
    else c.fillText(text, x, y);
  }
  function drawStatic(c, L, only) {
    L.lines.forEach(function (l, i) {
      if (only == null || only === i) put(c, l.text, l.x0, l.y);
    });
  }
  function clipped(c, x, y, w, h, fn) {
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    fn();
    c.restore();
  }

  // ---------- entrances
  function entrance(c, spec, L, only) {
    var s = spec.style,
      t = spec.t,
      len = Math.max(0.1, spec.len),
      size = L.size,
      G = L.glyphs,
      seed = spec.seed | 0;
    if (s === 'punch') return punch(c, spec, L, only);
    if (s === 'cascade' || s === 'bounce' || s === 'wave' || s === 'flip' || s === 'decode') {
      var frac = s === 'wave' ? 0.35 : s === 'decode' ? 0.55 : 0.45,
        frame = Math.floor(t * 24);
      G.forEach(function (g) {
        if (only != null && g.line !== only) return;
        var p = unitProgress(g.i, G.length, t, len, frac);
        if (p <= 0) return;
        if (s === 'cascade')
          glyphAt(c, g, size, g.ch, 0, -(1 - eOut(p)) * size * 0.9, 1, 1, alphaFor(spec, p * 2.5));
        else if (s === 'bounce')
          glyphAt(c, g, size, g.ch, 0, -(1 - bounce(p)) * size * 1.4, 1, 1, alphaFor(spec, p * 5));
        else if (s === 'wave')
          glyphAt(c, g, size, g.ch, 0, (1 - back(p)) * size * 0.8, 1, 1, alphaFor(spec, p * 3));
        else if (s === 'flip') glyphAt(c, g, size, g.ch, 0, 0, 1, Math.max(0.001, back(p)), alphaFor(spec, p * 4));
        else {
          var settled = p >= 1;
          glyphAt(
            c,
            g,
            size,
            settled ? g.ch : noiseChar(g.ch, seed, g.i, frame),
            0,
            0,
            1,
            1,
            alphaFor(spec, settled ? 1 : 0.45 + 0.55 * p),
          );
        }
      });
      return true;
    }
    if (s === 'words') {
      L.words.forEach(function (w) {
        if (only != null && w.line !== only) return;
        var p = unitProgress(w.i, L.words.length, t, len, 0.5);
        if (p <= 0) return;
        var sc = 0.82 + 0.18 * back(p),
          a = alphaFor(spec, p * 2.5),
          cx = (w.x0 + w.x1) / 2,
          cy = w.y - size * 0.35;
        c.save();
        if (a < 1) c.globalAlpha *= a;
        c.translate(cx, cy + (1 - eOut(p)) * size * 0.45);
        c.scale(sc, sc);
        c.translate(-cx, -cy);
        w.glyphs.forEach(function (g) {
          put(c, g.ch, g.x, g.y);
        });
        c.restore();
      });
      return true;
    }
    if (s === 'slice' || s === 'mask' || s === 'split') {
      var n = L.lines.length,
        bands = 3;
      L.lines.forEach(function (l, li) {
        if (only != null && li !== only) return;
        var top = l.y - size * 0.95,
          h = size * 1.25,
          pad = size * 0.2;
        if (s === 'mask') {
          var pm = unitProgress(li, n, t, len, 0.7);
          if (pm <= 0) return;
          clipped(c, l.x0 - pad, top, l.w + pad * 2, h, function () {
            put(c, l.text, l.x0, l.y + (1 - eOut(pm)) * h);
          });
        } else if (s === 'slice') {
          for (var b = 0; b < bands; b++) {
            var u = li * bands + b,
              ps = unitProgress(u, n * bands, t, len, 0.55);
            if (ps <= 0) continue;
            var dir = u % 2 ? 1 : -1,
              dx = dir * (1 - eOut(ps)) * (l.w * 0.22 + size * 0.6);
            clipped(c, l.x0 - l.w - size * 2, top + (h / bands) * b, l.w * 3 + size * 4, h / bands + 0.5, function () {
              put(c, l.text, l.x0 + dx, l.y);
            });
          }
        } else {
          var pp = unitProgress(li, n, t, len, 0.75);
          if (pp <= 0) return;
          var off = (1 - eOut(pp)) * (l.w * 0.4 + size * 2),
            mid = l.y - size * 0.35;
          clipped(c, l.x0 - l.w - size * 3, top, l.w * 3 + size * 6, mid - top, function () {
            put(c, l.text, l.x0 - off, l.y);
          });
          clipped(c, l.x0 - l.w - size * 3, mid, l.w * 3 + size * 6, top + h - mid, function () {
            put(c, l.text, l.x0 + off, l.y);
          });
        }
      });
      return true;
    }
    drawStatic(c, L, only);
    return true;
  }

  // Kinetic typography: one word at a time, big, then the full phrase slams in.
  function punch(c, spec, L, only) {
    var t = spec.t,
      len = Math.max(0.1, spec.len),
      W = L.words,
      n = W.length,
      size = L.size,
      bx = L.box.x + L.box.w / 2,
      by = L.box.y + L.box.h / 2;
    if (!n) return true;
    if (t >= len) {
      var q = clamp((t - len) / 0.25),
        sl = 1 + 0.06 * (1 - eOut(q));
      c.save();
      c.translate(bx, by);
      c.scale(sl, sl);
      c.translate(-bx, -by);
      drawStatic(c, L, only);
      c.restore();
      return true;
    }
    if (only != null && only !== 0) return true;
    if (t < 0) return true;
    var slot = len / n,
      k = Math.min(n - 1, Math.floor(t / slot)),
      w = W[k],
      lq = (t - k * slot) / slot,
      ww = w.x1 - w.x0,
      big = Math.min(1.7, Math.max(1.15, (L.box.w * 0.85) / Math.max(1, ww))),
      hit = 1 + 0.25 * (1 - eOut(lq / 0.35));
    // Never wider than the tool allows, even at the peak of the hit.
    if (spec.maxWidth) big = Math.max(0.5, Math.min(big, spec.maxWidth / Math.max(1, ww) / 1.25));
    var sc = big * hit,
      cx = (w.x0 + w.x1) / 2,
      cy = w.y - size * 0.35;
    c.save();
    c.translate(bx, by);
    c.scale(sc, sc);
    c.translate(-cx, -cy);
    w.glyphs.forEach(function (g) {
      put(c, g.ch, g.x, g.y);
    });
    c.restore();
    return true;
  }

  // ---------- morphs
  // Pair letters of A with the same letters of B, nearest in reading order.
  function match(GA, GB) {
    var used = new Array(GA.length).fill(false),
      pairs = new Array(GB.length).fill(-1),
      na = Math.max(1, GA.length - 1),
      nb = Math.max(1, GB.length - 1);
    GB.forEach(function (gb, j) {
      var best = -1,
        bestD = Infinity;
      GA.forEach(function (ga, i) {
        if (used[i] || ga.ch.toUpperCase() !== gb.ch.toUpperCase()) return;
        var d = Math.abs(i / na - j / nb);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) {
        used[best] = true;
        pairs[j] = best;
      }
    });
    return { pairs: pairs, used: used };
  }
  function glide(c, spec, A, B, k) {
    var m = match(A.glyphs, B.glyphs),
      size = Math.max(A.size, B.size),
      nb = Math.max(1, B.glyphs.length);
    A.glyphs.forEach(function (g, i) {
      if (m.used[i]) return;
      var q = clamp(k / 0.55),
        sc = spec.opaque ? 1 - eIn(q) : 1 - 0.4 * eIn(q);
      if (q < 1) glyphAt(c, g, size, g.ch, 0, eIn(q) * size * 0.3, sc, sc, alphaFor(spec, 1 - q));
    });
    B.glyphs.forEach(function (g, j) {
      var i = m.pairs[j];
      if (i < 0) {
        var q = clamp((k - 0.4 - (j / nb) * 0.15) / 0.45),
          sc = spec.opaque ? back(q) : 0.6 + 0.4 * back(q);
        if (q > 0) glyphAt(c, g, size, g.ch, 0, (1 - eOut(q)) * size * 0.35, sc, sc, alphaFor(spec, q * 1.4));
        return;
      }
      var a = A.glyphs[i],
        d = (j / nb) * 0.25,
        p = eInOut((k - d) / 0.75),
        pos = {
          x: lerp(a.x, g.x, p),
          w: lerp(a.w, g.w, p),
          y: lerp(a.y, g.y, p),
        };
      glyphAt(c, pos, size, p < 0.5 ? a.ch : g.ch, 0, -Math.sin(Math.PI * p) * size * 0.25, 1, 1, 1);
    });
  }
  function scramble(c, spec, A, B, k) {
    var frame = Math.floor(spec.t * 24),
      seed = spec.seed | 0;
    if (k < 0.5) {
      var na = Math.max(1, A.glyphs.length);
      A.glyphs.forEach(function (g, i) {
        var noisy = k > (i / na) * 0.4;
        glyphAt(c, g, A.size, noisy ? noiseChar(g.ch, seed, i, frame) : g.ch, 0, 0, 1, 1, alphaFor(spec, noisy ? 0.7 : 1));
      });
    } else {
      var nb = Math.max(1, B.glyphs.length);
      B.glyphs.forEach(function (g, j) {
        var done = k >= 0.6 + (j / nb) * 0.4;
        glyphAt(c, g, B.size, done ? g.ch : noiseChar(g.ch, seed + 7, j, frame), 0, 0, 1, 1, alphaFor(spec, done ? 1 : 0.7));
      });
    }
  }

  // Liquid: blur the crossfade of A and B, then cut it at half strength, so letters
  // blob into each other. Done in code (not canvas filters) so iPhone Safari matches.
  // Buffers are kept between frames; only the text's own box is processed.
  var goo = null,
    bufA = new Float32Array(0),
    bufT = new Float32Array(0);
  function buffers(n) {
    if (bufA.length < n) {
      bufA = new Float32Array(n);
      bufT = new Float32Array(n);
    }
  }
  function blurAlpha(a, w, h, r) {
    var tmp = bufT,
      x,
      y,
      i,
      sum,
      d = r * 2 + 1;
    for (y = 0; y < h; y++) {
      sum = 0;
      var row = y * w;
      for (x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))];
      for (x = 0; x < w; x++) {
        tmp[row + x] = sum / d;
        sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (x = 0; x < w; x++) {
      sum = 0;
      for (y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (y = 0; y < h; y++) {
        i = y * w + x;
        a[i] = sum / d;
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
  function liquid(c, spec, A, B, k) {
    if (typeof document === 'undefined') return glide(c, spec, A, B, k);
    var size = Math.max(A.size, B.size),
      pad = size * 0.5,
      bx = Math.min(A.box.x, B.box.x) - pad,
      by = Math.min(A.box.y, B.box.y) - pad,
      bw = Math.max(A.box.x + A.box.w, B.box.x + B.box.w) + pad - bx,
      bh = Math.max(A.box.y + A.box.h, B.box.y + B.box.h) + pad - by,
      q = 0.5,
      w = Math.max(1, Math.ceil(bw * q)),
      h = Math.max(1, Math.ceil(bh * q));
    goo = goo || document.createElement('canvas');
    if (goo.width < w) goo.width = w;
    if (goo.height < h) goo.height = h;
    var g = goo.getContext('2d', { willReadFrequently: true }),
      s = smooth(0.2, 0.8, k);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, w, h);
    g.setTransform(q, 0, 0, q, -bx * q, -by * q);
    g.font = c.font;
    try {
      g.letterSpacing = c.letterSpacing;
    } catch (e) {}
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#fff';
    var keep = PASS;
    PASS = null;
    g.globalAlpha = 1 - s;
    drawStatic(g, A);
    g.globalAlpha = s;
    drawStatic(g, B);
    PASS = keep;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    var img = g.getImageData(0, 0, w, h),
      px = img.data,
      n = w * h,
      a,
      i;
    buffers(n);
    a = bufA;
    for (i = 0; i < n; i++) a[i] = px[i * 4 + 3] / 255;
    var r = Math.round(size * q * 0.15 * Math.sin(Math.PI * k));
    if (r >= 1) blurAlpha(a, w, h, r);
    // The cut dips mid-morph so blobs swell and join, and is 0.5 at both ends,
    // where it reproduces the plain letters.
    var cut = 0.5 - 0.1 * Math.sin(Math.PI * k),
      soft = spec.opaque ? 0.02 : 0.06;
    for (i = 0; i < n; i++) {
      var v = smooth(cut - soft, cut + soft, a[i]);
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255;
      px[i * 4 + 3] = Math.round(v * 255);
    }
    g.putImageData(img, 0, 0);
    // Colour the shape with the tool's own fill, in the tool's coordinates.
    g.globalCompositeOperation = 'source-in';
    g.setTransform(q, 0, 0, q, -bx * q, -by * q);
    g.fillStyle = c.fillStyle;
    g.fillRect(bx, by, bw, bh);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    // Hand over to the crisp letters at both ends (green screen switches instead of fading).
    var m = smooth(0, 0.22, k) * (1 - smooth(0.78, 1, k));
    if (spec.opaque) m = m > 0.5 ? 1 : 0;
    // The blob is drawn solid; crisp letters lie over it near the ends, so the
    // text never looks washed out while the two hand over. With layers, the blob
    // is tinted per layer, and outlines are the blob drawn a little larger.
    var base = c.globalAlpha,
      passes = spec.passes || [{ op: 'fill', style: c.fillStyle }];
    passes.forEach(function (ps) {
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = ps.style || c.fillStyle;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
      var dx = ps.dx || 0,
        dy = ps.dy || 0,
        rr = ps.op === 'stroke' ? (ps.width || c.lineWidth || 0) / 2 : 0,
        ring = rr ? [[-rr, 0], [rr, 0], [0, -rr], [0, rr], [-rr * 0.7, -rr * 0.7], [rr * 0.7, -rr * 0.7], [-rr * 0.7, rr * 0.7], [rr * 0.7, rr * 0.7], [0, 0]] : [[0, 0]];
      ring.forEach(function (o) {
        c.drawImage(goo, 0, 0, w, h, bx + dx + o[0], by + dy + o[1], w / q, h / q);
      });
    });
    if (m < 1) {
      c.globalAlpha = base * (1 - m);
      eachPass(c, spec, function () {
        drawStatic(c, k < 0.5 ? A : B);
      });
    }
    c.globalAlpha = base;
  }

  function eachPass(c, spec, fn) {
    if (!spec.passes) return fn();
    spec.passes.forEach(function (ps) {
      c.save();
      if (ps.op === 'stroke') {
        c.strokeStyle = ps.style || c.strokeStyle;
        if (ps.width) c.lineWidth = ps.width;
        c.lineJoin = 'round';
      } else if (ps.style) c.fillStyle = ps.style;
      PASS = { op: ps.op === 'stroke' ? 'stroke' : 'fill', dx: ps.dx || 0, dy: ps.dy || 0 };
      try {
        fn();
      } finally {
        PASS = null;
        c.restore();
      }
    });
  }
  function draw(c, spec, only) {
    var align = spec.align || 'left';
    c.save();
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    var ph = phase(spec),
      result = true;
    if (ph.state === 'to') {
      var LB = layout(c, spec.to.lines, align, spec.perChar);
      eachPass(c, spec, function () {
        if (IDS.indexOf(spec.style) > 0 && spec.t < spec.len) entrance(c, spec, LB, only);
        else drawStatic(c, LB, only);
      });
    } else if (ph.state === 'morph') {
      if (only == null || only === 0) {
        var A = layout(c, spec.lines, align, spec.perChar),
          B = layout(c, spec.to.lines, align, spec.perChar);
        if (spec.morph === 'liquid') liquid(c, spec, A, B, ph.k);
        else
          eachPass(c, spec, function () {
            if (spec.morph === 'scramble') scramble(c, spec, A, B, ph.k);
            else glide(c, spec, A, B, ph.k);
          });
      }
    } else if (!spec.style || spec.style === 'original' || IDS.indexOf(spec.style) < 0) result = false;
    else {
      var LA = layout(c, spec.lines, align, spec.perChar);
      eachPass(c, spec, function () {
        entrance(c, spec, LA, only);
      });
    }
    c.restore();
    return result;
  }

  window.TimKinetic = {
    styles: STYLES,
    morphs: MORPHS,
    draw: draw,
    phase: phase,
    // Which text a tool should measure for exits and layout at time t.
    showing: function (spec) {
      return phase(spec).state === 'to' ? 'to' : 'from';
    },
    // True while the whole block must be drawn as one element.
    whole: function (spec) {
      var ph = phase(spec);
      return ph.state === 'morph' || (spec.style === 'punch' && spec.t >= 0 && spec.t < spec.len);
    },
    // When a morph should run: centred between the end of the entrance and the
    // moment the tool's own ending begins, in that tool's clock.
    morphWindow: function (enterEnd, endBy, len) {
      var at = Math.max(enterEnd + 0.4, (enterEnd + endBy - len) / 2);
      return { at: at, len: Math.max(0.3, Math.min(len, endBy - at)) };
    },
    // Seconds of hold after the entrance that a morph needs to read well.
    morphRoom: function (morphLen) {
      return morphLen + 0.8;
    },
    isKinetic: function (style) {
      return !!style && style !== 'original' && IDS.indexOf(style) >= 0;
    },
    // Fill a <select> with grouped options (Original first).
    fillSelect: function (select, list, keep) {
      var groups = {};
      select.textContent = '';
      list.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s[0];
        o.textContent = s[1];
        if (!s[2]) return select.append(o);
        if (!groups[s[2]]) {
          groups[s[2]] = document.createElement('optgroup');
          groups[s[2]].label = s[2];
          select.append(groups[s[2]]);
        }
        groups[s[2]].append(o);
      });
      if (keep) select.value = keep;
    },
    // exposed for tests
    _layoutWith: layoutWith,
    _match: match,
    _unitProgress: unitProgress,
    _noiseChar: noiseChar,
  };
})();
