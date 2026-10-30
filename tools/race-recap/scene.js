/* Seekable, deterministic T.im graphics. The result fields intentionally contain no invented numbers. */
window.essentials = (() => {
  const canvas = document.getElementById('scene');
  const c = canvas.getContext('2d');
  const navy = '#0e1a2e',
    gold = '#e8c96a',
    teal = '#2e9bad',
    paper = '#f6f4ef';
  const items = [
    [
      'race-recap',
      'Race recap',
      'EVERY RACE HAS A STORY',
      'opener',
      4,
      'A reusable opener over your race footage.',
    ],
    [
      'before-the-start',
      'Before the start',
      'THE BUILD-UP',
      'chapter',
      3,
      'Kit, travel, warm-up and pre-race footage.',
    ],
    [
      'race-start',
      'Race start',
      'HERE WE GO',
      'chapter',
      3,
      'Introduce the start-line footage.',
    ],
    [
      'halfway',
      'Halfway',
      'KEEP MOVING FORWARD',
      'chapter',
      3,
      'Mark the halfway point without fixing a race distance.',
    ],
    [
      'final-push',
      'Final push',
      'MAKE IT COUNT',
      'chapter',
      3,
      'Introduce the closing stretch.',
    ],
    [
      'finish-line',
      'Finish line',
      'EVERY STEP COUNTED',
      'finish',
      4,
      'A finish celebration for any completed race.',
    ],
    [
      'personal-best',
      'Personal best',
      'A NEW BENCHMARK',
      'achievement',
      4,
      'Use when the result is a personal best.',
    ],
    [
      'finish-time',
      'Finish time',
      'OFFICIAL RESULT',
      'stat',
      5,
      'Blank result panel: add your actual time as text in your editor.',
    ],
    [
      'average-pace',
      'Average pace',
      'RACE IN NUMBERS',
      'stat',
      5,
      'Blank result panel: add your actual pace and min/km or min/mi in your editor.',
    ],
    [
      'thanks-for-watching',
      'Thanks for watching',
      'SEE YOU AT THE NEXT START LINE',
      'outro',
      4,
      'A reusable closing card with space around it for your footage.',
    ],
  ].map(([id, title, subtitle, kind, duration, description], index) => ({
    id,
    title,
    subtitle,
    kind,
    duration,
    description,
    index,
  }));
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => 1 - (1 - clamp(x)) ** 3;
  function rect(x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  }
  function text(
    value,
    x,
    y,
    size,
    color = paper,
    italic = false,
    max = Infinity,
  ) {
    c.font = `${italic ? 'italic 900' : '700'} ${size}px Barlow`;
    size *= Math.min(1, max / c.measureText(value).width);
    c.font = `${italic ? 'italic 900' : '700'} ${size}px Barlow`;
    c.fillStyle = color;
    c.fillText(value, x, y);
  }
  function medal(x, y, t) {
    c.save();
    c.translate(x, y);
    c.rotate(Math.sin(t * 4) * 0.035);
    c.fillStyle = teal;
    c.beginPath();
    c.moveTo(-63, -120);
    c.lineTo(-12, 12);
    c.lineTo(25, -5);
    c.lineTo(-20, -120);
    c.fill();
    c.fillStyle = gold;
    c.beginPath();
    c.moveTo(10, -120);
    c.lineTo(-26, -5);
    c.lineTo(14, 12);
    c.lineTo(65, -120);
    c.fill();
    c.fillStyle = gold;
    c.beginPath();
    c.arc(0, 42, 73, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = navy;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 42, 58, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = navy;
    c.lineWidth = 12;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(-27, 42);
    c.lineTo(-6, 63);
    c.lineTo(30, 24);
    c.stroke();
    c.restore();
  }
  function draw(item, t, format = '16x9', background = 'alpha') {
    const portrait = format === '9x16',
      W = portrait ? 1080 : 1920,
      H = portrait ? 1920 : 1080;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.clearRect(0, 0, W, H);
    if (background !== 'alpha')
      rect(0, 0, W, H, background === 'green' ? '#00ff00' : navy);
    if (t <= 0 || t >= item.duration - 1 / 30) return;
    const enter = ease(t / 0.55),
      exit = ease((t - item.duration + 0.55) / 0.5);
    const width = portrait ? 880 : 1400;
    const height =
      item.kind === 'stat'
        ? 510
        : item.kind === 'chapter'
          ? 270
          : portrait
            ? 650
            : 490;
    const x = (W - width) / 2,
      y = (H - height) / 2 + (1 - enter) * 65 - exit * 45;
    c.save();
    c.globalAlpha = enter * (1 - exit);
    c.translate(x, y);
    c.fillStyle = navy;
    c.beginPath();
    c.roundRect(0, 0, width, height, 20);
    c.fill();
    rect(0, 0, width * ease(t / 0.85), 6, gold);
    rect(0, height - 5, width * ease((t - 0.15) / 0.8), 5, teal);
    // Thin track lines tie the pack together without obscuring the main footage.
    c.strokeStyle = '#253b53';
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(width - 210 + i * 36, 25);
      c.lineTo(width - 105 + i * 36, height - 25);
      c.stroke();
    }
    const pad = 52;
    if (item.kind === 'chapter') {
      text('RACE RECAP / T.im', pad, 58, 27, gold);
      text(
        item.title.toUpperCase(),
        pad,
        164,
        portrait ? 98 : 112,
        paper,
        true,
        width - pad * 2,
      );
      text(item.subtitle, pad, 220, 28, teal, false, width - pad * 2);
    } else if (item.kind === 'stat') {
      text(item.subtitle + ' / T.im', pad, 58, 27, gold);
      text(
        item.title.toUpperCase(),
        pad,
        151,
        91,
        paper,
        true,
        width - pad * 2,
      );
      // Blank dark inset: the user adds their real result in their editor.
      rect(pad, 196, width - pad * 2, 232, '#172a40');
      rect(pad, 196, 7, 232, teal);
      text('RACE RECAP', pad, height - 33, 23, gold);
    } else {
      const hasMedal = item.kind === 'finish' || item.kind === 'achievement';
      text('tristan.inmotion / T.im', pad, 58, 27, gold);
      if (hasMedal) {
        if (portrait) medal(width / 2, 220, t);
        else medal(width - 175, height / 2 - 15, t);
      }
      const tx = pad,
        ty = portrait ? (hasMedal ? 438 : 300) : 238;
      let lines;
      if (item.id === 'race-recap') lines = ['RACE', 'RECAP'];
      else if (item.id === 'thanks-for-watching')
        lines = ['THANKS FOR', 'WATCHING'];
      else if (portrait)
        lines =
          item.id === 'personal-best'
            ? ['PERSONAL', 'BEST']
            : ['FINISH', 'LINE'];
      else lines = [item.title.toUpperCase()];
      const size = portrait
        ? hasMedal
          ? 90
          : 125
        : lines.length > 1
          ? 116
          : 125;
      const available = width - pad * 2 - (!portrait && hasMedal ? 260 : 0);
      lines.forEach((line, i) =>
        text(line, tx, ty + i * size * 0.92, size, paper, true, available),
      );
      const subtitleY = portrait
        ? height - 57
        : lines.length > 1
          ? height - 48
          : height - 100;
      text(
        item.subtitle,
        pad,
        subtitleY,
        portrait ? 28 : 32,
        gold,
        false,
        width - pad * 2,
      );
      // Confetti stays inside the card so chroma-key edges stay clean.
      if (hasMedal)
        for (let i = 0; i < 20; i++) {
          const px = pad + ((i * 97) % (width - pad * 2)),
            py = 75 + ((i * 31 + t * 42) % (portrait ? 200 : 90));
          c.save();
          c.translate(px, py);
          c.rotate(i + t);
          rect(-3, -7, 6, 14, i % 2 ? gold : teal);
          c.restore();
        }
    }
    c.restore();
    c.globalAlpha = 1;
  }
  return { items, draw, canvas };
})();
