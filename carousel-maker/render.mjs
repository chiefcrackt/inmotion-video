import { drawElements } from './elements.mjs';
import { photoSettings, photoGeometry } from './photo.mjs';
// Text sizes. Headline and body sizes are per slide; null means the layout
// default. Fit text never shrinks below these readable minimums (1080px wide).
export const textLimits = {
  headline: { min: 56, max: 130 },
  body: { min: 26, max: 48 },
  element: { min: 26 },
};
export const defaultSizes = (layout) => ({
  title: layout === 'cover' ? 102 : 78,
  body: layout === 'list' ? 39 : 32,
});
const clampSize = (value, limit, fallback) =>
  value === null ||
  value === undefined ||
  value === '' ||
  !Number.isFinite(Number(value))
    ? fallback
    : Math.min(limit.max, Math.max(limit.min, Math.round(Number(value))));
export function textSizes(s) {
  const d = defaultSizes(s.layout);
  return {
    title: clampSize(s.titleSize, textLimits.headline, d.title),
    body: clampSize(s.bodySize, textLimits.body, d.body),
  };
}
const cache = new Map();
const images = new Map();
export async function loadSlideImages(s) {
  await Promise.all(
    [s.photo, ...(s.elements || []).filter((e) => !e.hidden).map((e) => e.src)]
      .filter(Boolean)
      .map(imageFor),
  );
}

export async function imageFor(src) {
  if (!src) return null;
  if (!cache.has(src))
    cache.set(
      src,
      new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => {
          images.set(src, i);
          resolve(i);
        };
        i.onerror = () => {
          cache.delete(src);
          reject(new Error('Could not load photo'));
        };
        i.src = src;
      }),
    );
  return cache.get(src);
}
export function render(canvas, s, index, total, state, img) {
  canvas.width = 1080;
  canvas.height = state.height;
  canvas.templateBounds = {};
  // Text that won't fully show, measured with the same fonts, wrapping and
  // frames used to draw it. Read-only: never changes the slide.
  const issues = [];
  canvas.overflow = issues;
  const flag = (area, message) => {
    if (!issues.some((i) => i.area === area && i.message === message))
      issues.push({ area, message });
  };
  const sizes = textSizes(s);
  const c = canvas.getContext('2d'),
    H = canvas.height,
    [bg, baseInk, accent] = state.palette,
    p = photoSettings(s),
    full = !!img && p.mode === 'background',
    matched = !!img && !!p.backgroundPack && p.matchTheme !== false,
    artwork = matched
      ? window.TimBackgrounds.themedImage(img, state.palette)
      : img,
    ink =
      full && p.textColor !== 'palette'
        ? p.textColor
        : full && p.backgroundPack && !matched
          ? '#f6f4ef'
          : baseInk;
  const text = (t, x, y, size = 32, color = ink, weight = 'normal') => {
    c.fillStyle = color;
    c.font = `${weight} ${size}px ${state.font}`;
    c.fillText(t, x, y);
  };
  const lines = (
    t,
    x,
    y,
    size,
    maxWidth,
    lineHeight,
    maxLines = 12,
    area = '',
    label = '',
  ) => {
    c.font = `bold ${size}px ${state.font}`;
    const out = [];
    for (const paragraph of t.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (area && c.measureText(word).width > maxWidth)
          flag(area, `${label}: a word is too wide for the slide`);
        if (c.measureText(line + ' ' + word).width > maxWidth && line) {
          out.push(line);
          line = word;
        } else line += (line ? ' ' : '') + word;
      }
      out.push(line);
    }
    out
      .slice(0, maxLines)
      .forEach((line, i) =>
        text(line, x, y + i * lineHeight, size, ink, 'bold'),
      );
    if (area && out.length > maxLines) {
      const hidden = out.length - maxLines;
      flag(area, `${label}: ${hidden} line${hidden > 1 ? 's' : ''} cut off`);
    }
    return Math.min(out.length, maxLines) * lineHeight;
  };
  c.fillStyle = bg;
  c.fillRect(0, 0, 1080, H);
  if (full) {
    c.save();
    const g = photoGeometry(img.width, img.height, 1080, H, {
      ...p,
      fit: 'cover',
    });
    c.translate(g.x, g.y);
    c.rotate((p.rotation * Math.PI) / 180);
    c.scale(g.scale * (p.flip ? -1 : 1), g.scale);
    c.drawImage(artwork, -img.width / 2, -img.height / 2);
    c.restore();
    c.save();
    c.fillStyle = p.tintColor;
    c.globalAlpha = p.tint / 100;
    c.fillRect(0, 0, 1080, H);
    c.globalAlpha = 1;
    if (p.gradient !== 'none') {
      const horizontal = p.gradient === 'left',
        reverse = p.gradient === 'top';
      const grad = c.createLinearGradient(
        0,
        reverse ? H : 0,
        horizontal ? 1080 : 0,
        horizontal ? 0 : reverse ? 0 : H,
      );
      grad.addColorStop(
        0,
        horizontal
          ? 'rgba(0,0,0,' + p.gradientStrength / 100 + ')'
          : 'rgba(0,0,0,0)',
      );
      grad.addColorStop(
        1,
        horizontal
          ? 'rgba(0,0,0,0)'
          : 'rgba(0,0,0,' + p.gradientStrength / 100 + ')',
      );
      c.fillStyle = grad;
      c.fillRect(0, 0, 1080, H);
    }
    c.restore();
  }
  if (s.layout === 'blank') {
    drawElements(c, s, state, images, 'below', flag);
    drawElements(c, s, state, images, 'above', flag);
    return;
  }
  if (img && !full) {
    const box =
        s.layout === 'photo' ? H - 200 : Math.round((H * p.frame) / 100),
      y = s.layout === 'photo' ? 110 : H - box;
    const g = photoGeometry(img.width, img.height, 1080, box, p);
    c.save();
    c.beginPath();
    c.rect(0, y, 1080, box);
    c.clip();
    c.translate(g.x, y + g.y);
    c.rotate((p.rotation * Math.PI) / 180);
    c.scale(g.scale * (p.flip ? -1 : 1), g.scale);
    c.drawImage(artwork, -img.width / 2, -img.height / 2);
    c.restore();
    if (s.layout === 'photo') {
      c.fillStyle = bg;
      c.globalAlpha = p.overlay / 100;
      c.fillRect(45, 140, 990, Math.min(610, H - 290));
      c.globalAlpha = 1;
    }
  } else if (!full && s.layout === 'cover') {
    c.save();
    c.strokeStyle = accent;
    c.globalAlpha = 0.16;
    c.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.ellipse(940, H - 260, 210 + i * 63, 110 + i * 42, -0.6, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
    text('↗', 720, H - 210, 220, accent, 'bold');
  }
  drawElements(c, s, state, images, 'below', flag);
  const positions = s.positions || {};
  canvas.templateBounds = {};
  const group = (key, bounds, draw) => {
    const offset = positions[key] || { x: 0, y: 0 };
    canvas.templateBounds[key] = {
      x: bounds.x + (Number(offset.x) || 0),
      y: bounds.y + (Number(offset.y) || 0),
      w: bounds.w,
      h: bounds.h,
    };
    c.save();
    c.translate(Number(offset.x) || 0, Number(offset.y) || 0);
    draw();
    c.restore();
  };
  if (!s.hideTemplateText) {
    group('eyebrow', { x: 70, y: 65, w: 940, h: 70 }, () => {
      c.fillStyle = accent;
      c.fillRect(70, 70, 52, 7);
      if (s.kicker.length > 48)
        flag('eyebrow', 'Small heading: cut off after 48 characters');
      text(
        'T.im / ' + s.kicker.toUpperCase().slice(0, 48),
        70,
        122,
        22,
        accent,
        'bold',
      );
    });
    const titleSize = sizes.title;
    let titleHeight = 0;
    group(
      'headline',
      {
        x: 70,
        y: 245 - titleSize,
        w: 940,
        h: Math.min(5, s.title.split('\n').length) * titleSize * 1.06 + 20,
      },
      () => {
        titleHeight = lines(
          s.title,
          70,
          245,
          titleSize,
          940,
          titleSize * 1.06,
          5,
          'headline',
          'Headline',
        );
      },
    );
    canvas.templateBounds.headline.h = titleHeight + 20;
    const y = 260 + titleHeight;
    if (s.layout === 'comparison') {
      const all = s.body.split('\n');
      if (all.length > 9)
        flag('table', `Table: ${all.length - 9} row(s) cut off`);
      if (all.some((r) => r.split('|').length > 4))
        flag('table', 'Table: columns after the 4th are cut off');
      const rows = all.slice(0, 9).map((r) => r.split('|').slice(0, 4));
      const cols = Math.max(1, ...rows.map((r) => r.length)),
        cellSize = Math.min(27, 940 / cols / 10);
      c.font = `bold ${cellSize}px ${state.font}`;
      rows.forEach((row) =>
        row.forEach((v) => {
          if (v.trim().length > 28)
            flag('table', 'Table: a cell is cut off after 28 characters');
          else if (c.measureText(v.trim()).width > 940 / cols - 16)
            flag('table', 'Table: a cell runs into the next column');
        }),
      );
      group('content', { x: 70, y, w: 940, h: rows.length * 76 }, () =>
        rows.forEach((row, i) => {
          c.fillStyle = i === 0 ? accent : i % 2 ? ink + '12' : ink + '08';
          c.fillRect(70, y + i * 76, 940, 72);
          row.forEach((v, j) =>
            text(
              v.trim().slice(0, 28),
              86 + (j * 940) / cols,
              y + 47 + i * 76,
              Math.min(27, 940 / cols / 10),
              i === 0 ? bg : ink,
              i === 0 ? 'bold' : 'normal',
            ),
          );
        }),
      );
    } else if (s.layout === 'stats') {
      if (s.stat.length > 22)
        flag('highlight', 'Stat: cut off after 22 characters');
      const statRows = s.body.split('\n');
      if (statRows.length > 6)
        flag('stats', `Stats: ${statRows.length - 6} row(s) cut off`);
      statRows.slice(0, 6).forEach((r) => {
        const cells = r.split('|');
        if (cells[0].trim().length > 42)
          flag('stats', 'Stats: a label is cut off after 42 characters');
        if (cells[1] && cells[1].trim().length > 22)
          flag('stats', 'Stats: a value is cut off after 22 characters');
      });
      group('highlight', { x: 70, y: y - 25, w: 940, h: 125 }, () =>
        text(s.stat.slice(0, 22), 70, y + 85, 110, accent, 'bold'),
      );
      group(
        'content',
        {
          x: 70,
          y: y + 135,
          w: 940,
          h: Math.min(6, s.body.split('\n').length) * 84,
        },
        () =>
          s.body
            .split('\n')
            .slice(0, 6)
            .forEach((r, i) => {
              c.fillStyle = ink + '20';
              c.fillRect(70, y + 135 + i * 84, 940, 1);
              const cells = r.split('|');
              text(cells[0].trim().slice(0, 42), 70, y + 185 + i * 84, 30);
              if (cells[1])
                text(
                  cells[1].trim().slice(0, 22),
                  730,
                  y + 185 + i * 84,
                  32,
                  accent,
                  'bold',
                );
            }),
      );
    } else {
      let bodyHeight = 0;
      const bodyLine = Math.round(
        sizes.body * (s.layout === 'list' ? 69 / 39 : 1.5),
      );
      group('content', { x: 72, y: y - 20, w: 920, h: 350 }, () => {
        bodyHeight = lines(
          s.body,
          72,
          y + 25,
          sizes.body,
          920,
          bodyLine,
          7,
          'content',
          'Description',
        );
      });
      canvas.templateBounds.content.h = Math.max(45, bodyHeight + 15);
      const offsetY = (k) => Number((positions[k] || {}).y) || 0;
      const bodyBottom =
        bodyHeight > 0
          ? y +
            25 +
            bodyHeight -
            bodyLine +
            sizes.body * 0.3 +
            offsetY('content')
          : 0;
      if (!s.hideFooter && bodyBottom > H - 92)
        flag('content', 'Description: runs into the footer');
      else if (bodyBottom > H)
        flag('content', 'Description: runs off the bottom of the slide');
      if (s.stat && s.layout !== 'photo') {
        const sy = Math.min(H - 200, y + 210),
          sw = Math.min(940, s.stat.length * 18 + 44);
        if (s.body.trim() && bodyBottom > sy + offsetY('highlight') + 4)
          flag('content', 'Description: runs into the highlight box');
        if (s.stat.length > 48)
          flag('highlight', 'Highlight: cut off after 48 characters');
        c.font = `bold 26px ${state.font}`;
        if (c.measureText(s.stat.slice(0, 48)).width > sw - 30)
          flag('highlight', 'Highlight: text spills past its box');
        group('highlight', { x: 70, y: sy, w: sw, h: 57 }, () => {
          c.fillStyle = accent;
          c.fillRect(70, sy, sw, 57);
          text(s.stat.slice(0, 48), 92, sy + 38, 26, bg, 'bold');
        });
      }
    }
  }
  if (!s.hideFooter) {
    if (!full) {
      c.fillStyle = bg;
      c.fillRect(0, H - 92, 1080, 92);
    }
    group('footer', { x: 70, y: H - 92, w: 940, h: 78 }, () => {
      c.fillStyle = ink + '35';
      c.fillRect(70, H - 92, 940, 1);
      if (state.handle.length > 45)
        flag('footer', 'Handle: cut off after 45 characters');
      text(state.handle.slice(0, 45), 70, H - 41, 22);
      text(
        `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}    →`,
        820,
        H - 41,
        22,
      );
    });
  }
  drawElements(c, s, state, images, 'above', flag);
}

// Shrink headline, description and text-box sizes until they fit, never below
// textLimits. Works on a copy; returns { slide, changed, remaining }.
// Fields with character limits (heading, stat, table cells) can't be fixed by
// size, so they stay in `remaining` for the user to shorten.
export function fitText(slide, state, index = 0, total = 1) {
  const s = JSON.parse(JSON.stringify(slide)),
    canvas = document.createElement('canvas');
  const check = () => {
    render(canvas, s, index, total, state, null);
    return canvas.overflow;
  };
  const has = (issues, area) => issues.some((i) => i.area === area);
  const messages = (area) =>
    JSON.stringify(check().filter((i) => i.area === area));
  // Shrink obj[key] in 2px steps (current is the starting size) to min.
  const shrink = (area, obj, key, current, min) => {
    const had = Object.prototype.hasOwnProperty.call(obj, key),
      original = obj[key],
      was = messages(area);
    let size = current;
    while (has(check(), area) && size > min) {
      size = Math.max(min, size - 2);
      obj[key] = size;
    }
    // If shrinking didn't help at all (e.g. more separate lines than the
    // frame holds), put it back rather than make text smaller for nothing.
    if (has(check(), area) && messages(area) === was) {
      if (had) obj[key] = original;
      else delete obj[key];
    }
  };
  const before = JSON.stringify(s);
  // Headline first: the description sits under it.
  shrink(
    'headline',
    s,
    'titleSize',
    textSizes(s).title,
    textLimits.headline.min,
  );
  shrink('content', s, 'bodySize', textSizes(s).body, textLimits.body.min);
  for (const e of s.elements || [])
    if (['text', 'badge', 'rating'].includes(e.type))
      shrink(
        'element:' + e.id,
        e,
        'size',
        e.size,
        Math.min(e.size, textLimits.element.min),
      );
  return {
    slide: s,
    changed: JSON.stringify(s) !== before,
    remaining: check(),
  };
}
