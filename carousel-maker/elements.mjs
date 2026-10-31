export const uid = () => globalThis.crypto.randomUUID();
export function makeElement(type, palette) {
  return {
    id: uid(),
    type,
    x: 100,
    y: 400,
    w: 650,
    h: type === 'text' ? 180 : 300,
    text:
      type === 'text'
        ? 'Your text here'
        : type === 'badge'
          ? 'FIELD TESTED'
          : type === 'rating'
            ? '★★★★☆'
            : type === 'chart'
              ? 'Week 1 | 25\nWeek 2 | 38\nWeek 3 | 32\nWeek 4 | 45'
              : type === 'table'
                ? 'Feature | Product A | Product B\nWeight | 245 g | 260 g\nPrice | $140 | $160'
                : '',
    color: palette[1],
    fill: palette[2],
    font: 'inherit',
    size: 48,
    bold: true,
    align: 'left',
    spacing: 1.25,
    opacity: 1,
    radius: 0,
    border: 0,
    shadow: false,
    hidden: false,
    locked: false,
    src: '',
    fit: 'cover',
    placement: 'above',
  };
}
export function validProject(value) {
  return (
    value &&
    Array.isArray(value.slides) &&
    value.slides.length > 0 &&
    value.slides.length <= 100 &&
    [1080, 1350].includes(value.height) &&
    Array.isArray(value.palette) &&
    value.palette.length === 3 &&
    value.palette.every((c) => /^#[0-9a-f]{6}$/i.test(c)) &&
    ['Barlow Condensed', 'Arial', 'Georgia', 'monospace'].includes(
      value.font,
    ) &&
    typeof value.project === 'string' &&
    typeof value.handle === 'string' &&
    value.slides.every(
      (s) =>
        typeof s.title === 'string' &&
        typeof s.body === 'string' &&
        typeof s.kicker === 'string' &&
        typeof s.stat === 'string' &&
        [
          'blank',
          'cover',
          'text',
          'stats',
          'comparison',
          'list',
          'photo',
        ].includes(s.layout) &&
        (!s.photo || /^data:image\/(png|jpeg|webp);base64,/.test(s.photo)) &&
        (!s.elements ||
          (Array.isArray(s.elements) &&
            s.elements.length <= 100 &&
            s.elements.every(
              (e) =>
                [
                  'text',
                  'photo',
                  'shape',
                  'arrow',
                  'badge',
                  'rating',
                  'chart',
                  'table',
                ].includes(e.type) &&
                typeof e.id === 'string' &&
                [
                  e.x,
                  e.y,
                  e.w,
                  e.h,
                  e.size,
                  e.opacity,
                  e.radius,
                  e.border,
                  e.spacing,
                ].every(Number.isFinite) &&
                e.w > 0 &&
                e.h > 0 &&
                e.size > 0 &&
                e.size <= 400 &&
                (!e.src ||
                  /^data:image\/(png|jpeg|webp);base64,/.test(e.src)) &&
                typeof e.text === 'string' &&
                /^#[0-9a-f]{6}$/i.test(e.color) &&
                /^#[0-9a-f]{6}$/i.test(e.fill),
            ))),
    )
  );
}
// `flag(area, message)` is optional; it reports text that won't fully show.
export function drawElements(
  c,
  slide,
  state,
  images,
  placement,
  flag = () => {},
) {
  for (const e of slide.elements || []) {
    if (
      e.hidden ||
      (placement && (e.placement === 'below' ? 'below' : 'above') !== placement)
    )
      continue;
    c.save();
    c.globalAlpha = e.opacity;
    c.translate(e.x, e.y);
    c.fillStyle = e.fill;
    c.strokeStyle = e.color;
    c.lineWidth = e.border;
    if (e.shadow) {
      c.shadowColor = '#00000055';
      c.shadowBlur = 20;
      c.shadowOffsetY = 8;
    }
    const box = () => {
      c.beginPath();
      c.roundRect(0, 0, e.w, e.h, Math.min(e.radius, e.w / 2, e.h / 2));
    };
    box();
    if (['shape', 'badge', 'photo', 'table', 'chart'].includes(e.type))
      c.fill();
    c.shadowColor = 'transparent';
    if (e.type === 'photo') {
      const img = images.get(e.src);
      if (img) {
        c.save();
        box();
        c.clip();
        const scale = (e.fit === 'contain' ? Math.min : Math.max)(
          e.w / img.width,
          e.h / img.height,
        );
        c.drawImage(
          img,
          (e.w - img.width * scale) / 2,
          (e.h - img.height * scale) / 2,
          img.width * scale,
          img.height * scale,
        );
        c.restore();
      }
    } else if (e.type === 'arrow') {
      c.strokeStyle = e.color;
      c.lineWidth = Math.max(3, e.border);
      c.beginPath();
      c.moveTo(0, e.h / 2);
      c.lineTo(e.w - 8, e.h / 2);
      c.moveTo(e.w - 35, e.h / 2 - 25);
      c.lineTo(e.w - 8, e.h / 2);
      c.lineTo(e.w - 35, e.h / 2 + 25);
      c.stroke();
    } else if (e.type === 'chart') {
      const all = e.text.split('\n');
      if (all.length > 12)
        flag('element:' + e.id, `Chart: ${all.length - 12} row(s) cut off`);
      if (all.some((r) => r.split('|')[0].length > 30))
        flag(
          'element:' + e.id,
          'Chart: a label is cut off after 30 characters',
        );
      const rows = all.slice(0, 12).map((r) => r.split('|'));
      const max = Math.max(1, ...rows.map((r) => Number(r[1]) || 0)),
        rh = e.h / Math.max(1, rows.length);
      rows.forEach((r, i) => {
        c.fillStyle = e.color;
        c.font = `${Math.min(e.size, rh * 0.35)}px ${state.font}`;
        c.fillText(r[0].slice(0, 30), 10, i * rh + rh * 0.35);
        c.globalAlpha = e.opacity * 0.55;
        c.fillRect(
          10,
          i * rh + rh * 0.5,
          ((e.w - 30) * Math.max(0, Number(r[1]) || 0)) / max,
          rh * 0.3,
        );
        c.globalAlpha = e.opacity;
      });
    } else if (e.type === 'table') {
      const all = e.text.split('\n');
      if (all.length > 12)
        flag('element:' + e.id, `Table: ${all.length - 12} row(s) cut off`);
      if (all.some((r) => r.split('|').length > 4))
        flag('element:' + e.id, 'Table: columns after the 4th are cut off');
      const rows = all.slice(0, 12).map((r) => r.split('|').slice(0, 4)),
        cols = Math.max(1, ...rows.map((r) => r.length)),
        rh = e.h / Math.max(1, rows.length);
      rows.forEach((row, i) => {
        c.save();
        c.beginPath();
        c.rect(0, i * rh, e.w, rh);
        c.clip();
        if (i % 2 === 0) {
          c.fillStyle = e.color;
          c.globalAlpha = e.opacity * 0.12;
          c.fillRect(0, i * rh, e.w, rh);
          c.globalAlpha = e.opacity;
        }
        c.font = `${i === 0 ? 'bold ' : ''}${Math.min(e.size, rh * 0.5)}px ${state.font}`;
        c.fillStyle = e.color;
        row.forEach((s, j) =>
          c.fillText(
            s.trim(),
            (j * e.w) / cols + 10,
            i * rh + rh * 0.65,
            e.w / cols - 20,
          ),
        );
        c.restore();
      });
    } else if (['text', 'badge', 'rating'].includes(e.type)) {
      c.save();
      c.beginPath();
      c.rect(0, 0, e.w, e.h);
      c.clip();
      c.fillStyle = e.color;
      c.font = `${e.bold ? 'bold ' : ''}${e.size}px ${e.font === 'inherit' ? state.font : e.font}`;
      c.textBaseline = 'top';
      c.textAlign = e.align;
      let y = 5;
      for (const paragraph of e.text.split('\n')) {
        let line = '';
        const output = (t) => {
          c.fillText(
            t,
            e.align === 'center' ? e.w / 2 : e.align === 'right' ? e.w - 8 : 8,
            y,
          );
          y += e.size * e.spacing;
        };
        for (const word of paragraph.split(/\s+/)) {
          if (c.measureText(word).width > e.w - 16)
            flag('element:' + e.id, 'Text box: a word is too wide for the box');
          if (c.measureText(line + ' ' + word).width > e.w - 16 && line) {
            output(line);
            line = word;
          } else line += (line ? ' ' : '') + word;
        }
        output(line);
      }
      // y is where the next line would start; the last line ends one line
      // height minus the leading earlier.
      const lastBottom = y - e.size * e.spacing + e.size;
      if (e.text.trim() && lastBottom > e.h)
        flag('element:' + e.id, 'Text box: text runs past the bottom');
      c.restore();
    }
    if (e.border && e.type !== 'arrow') {
      box();
      c.stroke();
    }
    c.restore();
  }
}
