/* Shared exit engine: how a title, line or card leaves the screen at the end of a clip.
   Tools draw each element through TimExits.draw(); progress() says how far along its exit is.
   Everything is a pure function of time, so preview, scrubbing and recordings match frame for frame. */
(function () {
  'use strict';
  var STYLES = [
    ['original', 'Original'],
    ['reverse', 'Reverse of entrance'],
    ['fade', 'Fade'],
    ['wipe', 'Wipe'],
    ['slide', 'Slide away'],
    ['drop', 'Drop'],
    ['shrink', 'Shrink'],
    ['pop', 'Pop'],
    ['glitch', 'Glitch out'],
    ['cut', 'Cut'],
  ];
  var DEFAULTS = {
    exStyle: 'original',
    exLen: 0.6, // seconds each element takes to leave
    exEase: 'in', // in | inout | back | linear
    exDir: 'left', // left | right | up | down (wipe and slide)
    exStagger: 0.08, // seconds between elements
    exOrder: 'first', // first | last | together
    exHold: 0.1, // empty frames held at the very end
  };
  function clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  var EASE = {
    linear: function (x) {
      return x;
    },
    in: function (x) {
      return x * x * x;
    },
    inout: function (x) {
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    },
    back: function (x) {
      // pulls back slightly before it goes
      var s = 1.7;
      return x * x * ((s + 1) * x - s);
    },
  };
  function opts(o) {
    var r = {};
    for (var k in DEFAULTS) r[k] = o && o[k] !== undefined ? o[k] : DEFAULTS[k];
    r.exLen = Math.max(0.05, +r.exLen);
    r.exStagger = Math.max(0, +r.exStagger);
    r.exHold = Math.max(0, +r.exHold);
    return r;
  }
  // When the exits begin and end, for a clip of length D with n elements.
  function window_(D, o, n) {
    o = opts(o);
    n = Math.max(1, n || 1);
    var gaps = o.exOrder === 'together' ? 0 : o.exStagger * (n - 1),
      end = D - o.exHold;
    return { start: end - o.exLen - gaps, end: end };
  }
  // 0 = not leaving yet, 1 = gone. Element i of n.
  function progress(t, D, o, i, n) {
    o = opts(o);
    if (o.exStyle === 'original') return 0;
    n = Math.max(1, n || 1);
    i = i || 0;
    var w = window_(D, o, n),
      idx = o.exOrder === 'together' ? 0 : o.exOrder === 'last' ? n - 1 - i : i,
      s = w.start + idx * (o.exOrder === 'together' ? 0 : o.exStagger),
      raw = clamp((t - s) / o.exLen);
    if (o.exStyle === 'cut') return t >= s + o.exLen ? 1 : 0; // holds, then gone at the end of its exit time
    if (o.exStyle === 'reverse') return raw; // the tool replays its entrance backwards
    return (EASE[o.exEase] || EASE.in)(raw);
  }
  function rnd(seed) {
    var x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  // Draw one element with its exit applied. box = the element's bounds {x,y,w,h} in the current
  // coordinates; env = {W, H} canvas size in those coordinates (for leaving the frame); env.x0/y0 = the
  // canvas's top-left in those coordinates (when the context is translated).
  function draw(c, u, o, box, env, fn) {
    o = opts(o);
    if (o.exStyle === 'original' || o.exStyle === 'reverse' || u <= 0) return fn();
    if (u >= 1) return;
    var cx = box.x + box.w / 2,
      cy = box.y + box.h / 2,
      x0 = env.x0 || 0,
      y0 = env.y0 || 0,
      dir = o.exDir;
    c.save();
    switch (o.exStyle) {
      case 'fade':
        c.globalAlpha *= 1 - u;
        fn();
        break;
      case 'wipe': {
        var pad = 40;
        c.beginPath();
        if (dir === 'left') c.rect(box.x - pad, box.y - pad, (box.w + 2 * pad) * (1 - u), box.h + 2 * pad);
        else if (dir === 'right') c.rect(box.x - pad + (box.w + 2 * pad) * u, box.y - pad, (box.w + 2 * pad) * (1 - u), box.h + 2 * pad);
        else if (dir === 'up') c.rect(box.x - pad, box.y - pad, box.w + 2 * pad, (box.h + 2 * pad) * (1 - u));
        else c.rect(box.x - pad, box.y - pad + (box.h + 2 * pad) * u, box.w + 2 * pad, (box.h + 2 * pad) * (1 - u));
        c.clip();
        fn();
        break;
      }
      case 'slide': {
        var dx = 0,
          dy = 0;
        if (dir === 'left') dx = -(box.x + box.w - x0) - 20;
        else if (dir === 'right') dx = x0 + env.W - box.x + 20;
        else if (dir === 'up') dy = -(box.y + box.h - y0) - 20;
        else dy = y0 + env.H - box.y + 20;
        c.translate(dx * u, dy * u);
        fn();
        break;
      }
      case 'drop':
        c.translate(cx, cy + (y0 + env.H - box.y + 20) * u);
        c.rotate((dir === 'left' ? -1 : 1) * 0.14 * u);
        c.translate(-cx, -cy);
        fn();
        break;
      case 'shrink':
        c.translate(cx, cy);
        c.scale(1 - u, 1 - u);
        c.translate(-cx, -cy);
        fn();
        break;
      case 'pop': {
        var s = u < 0.3 ? 1 + 0.14 * (u / 0.3) : 1.14 * (1 - (u - 0.3) / 0.7);
        c.translate(cx, cy);
        c.scale(s, s);
        c.translate(-cx, -cy);
        fn();
        break;
      }
      case 'glitch': {
        // slices jump sideways and drop out; no transparency, so it keys cleanly on green
        var bands = 12,
          step = Math.floor(u * 18),
          h = (box.h + 40) / bands;
        for (var b = 0; b < bands; b++) {
          if (rnd(b * 31 + 7) < u * 1.15) continue;
          var off = (rnd(b * 17 + step * 101) - 0.5) * box.w * 0.6 * u;
          c.save();
          c.beginPath();
          c.rect(box.x - box.w, box.y - 20 + b * h, box.w * 3, h + 0.5);
          c.clip();
          c.translate(off, 0);
          fn();
          c.restore();
        }
        break;
      }
      default:
        fn();
    }
    c.restore();
  }
  window.TimExits = {
    styles: STYLES,
    defaults: DEFAULTS,
    opts: opts,
    window: window_,
    progress: progress,
    draw: draw,
    // fades leave semi-transparent pixels that don't key cleanly on green screen
    greenSafe: function (style) {
      return style !== 'fade';
    },
  };
})();
