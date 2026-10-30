/* node tools/race-recap/build.cjs [--only=id] [--skip-render]
 * Requires npm ci, Python imageio-ffmpeg (or FFMPEG_PATH), and Chrome/Edge.
 * Only writes this pack's directory and its own marked downloads-page section.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { launchBrowser, server } = require('../../tests/browser-utils.cjs');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'downloads/files/race-recap');
const ffmpeg =
  process.env.FFMPEG_PATH ||
  spawnSync(
    'python',
    ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],
    { encoding: 'utf8' },
  ).stdout.trim();
if (!fs.existsSync(ffmpeg))
  throw new Error('Set FFMPEG_PATH or install Python imageio-ffmpeg.');
fs.mkdirSync(out, { recursive: true });
function encode(args) {
  const child = spawn(
    ffmpeg,
    ['-hide_banner', '-loglevel', 'error', '-y', ...args],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let errors = '';
  child.stderr.on('data', (d) => (errors += d));
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code ? reject(new Error(errors || `FFmpeg exit ${code}`)) : resolve(),
    );
  });
  // Register rejection immediately while frames are still being written.
  done.catch(() => {});
  return { child, done };
}
async function command(args) {
  const job = encode(args);
  job.child.stdin.end();
  await job.done;
}
function sound(item) {
  const rate = 48000,
    n = Math.round(item.duration * rate),
    data = Buffer.alloc(44 + n * 4);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 4, 40);
  let seed = 1789;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed / 4294967296) * 2 - 1;
    const attack = Math.min(1, t / 0.012);
    let v = 0;
    if (item.kind === 'transition') {
      const env = Math.exp(-Math.pow((t - 0.65) / 0.24, 2));
      const pitch = item.id === 'footstrike-ripple' ? 115 : 75;
      v =
        noise * env * 0.22 +
        Math.sin(2 * Math.PI * pitch * t) *
          Math.exp(-Math.max(0, t - 0.65) * 20) *
          (t > 0.65 ? 0.2 : 0);
    } else {
      const a = Math.max(0, t - 0.14),
        b = Math.max(0, t - 0.3);
      v =
        t > 0.14
          ? Math.sin(2 * Math.PI * (item.kind === 'distance' ? 880 : 660) * a) *
            Math.exp(-a * 12) *
            0.24
          : 0;
      if (t > 0.3)
        v +=
          Math.sin(2 * Math.PI * (item.kind === 'distance' ? 1320 : 990) * b) *
          Math.exp(-b * 10) *
          0.18;
      v += noise * Math.exp(-Math.pow((t - 0.17) / 0.07, 2)) * 0.06;
    }
    v *= attack * Math.min(1, (item.duration - t) / 0.03);
    const sample = Math.round(Math.max(-0.85, Math.min(0.85, v)) * 32767);
    data.writeInt16LE(sample, 44 + i * 4);
    data.writeInt16LE(sample, 46 + i * 4);
  }
  fs.writeFileSync(path.join(out, `${item.id}.wav`), data);
}
function size(file) {
  const n = fs.statSync(path.join(out, file)).size;
  return n > 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : `${Math.ceil(n / 1024)} KB`;
}
function button(file, label) {
  return `<button class="dl" type="button" data-src="files/race-recap/${file}" data-ext="${file.split('.').pop()}"><span>${label}</span><small>${size(file)}</small></button>`;
}
async function main() {
  const http = server();
  await once(http, 'listening');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(
      `http://127.0.0.1:${http.address().port}/tools/race-recap/scene.html`,
    );
    await page.evaluate(async () => {
      await document.fonts.load('italic 900 120px Barlow');
      await document.fonts.load('700 30px Barlow');
      await document.fonts.ready;
    });
    const items = await page.evaluate(() => essentials.items);
    const only = process.argv
      .find((a) => a.startsWith('--only='))
      ?.split('=')[1];
    if (!process.argv.includes('--skip-render'))
      for (const item of items.filter((i) => !only || i.id === only)) {
        sound(item);
        for (const format of ['16x9', '9x16']) {
          const W = format === '16x9' ? 1920 : 1080,
            H = format === '16x9' ? 1080 : 1920;
          const base = `${item.id}_${format}`;
          const job = encode([
            '-f',
            'image2pipe',
            '-framerate',
            '30',
            '-vcodec',
            'png',
            '-i',
            'pipe:0',
            '-i',
            path.join(out, `${item.id}.wav`),
            '-filter_complex',
            `[0:v]split[alpha][fg];color=c=0x00ff00:s=${W}x${H}:r=30:d=${item.duration}[green];[green][fg]overlay=shortest=1:format=auto,format=yuv420p[phone]`,
            '-map',
            '[alpha]',
            '-map',
            '1:a',
            '-c:v',
            'libvpx-vp9',
            '-pix_fmt',
            'yuva420p',
            '-b:v',
            '0',
            '-crf',
            '30',
            '-deadline',
            'realtime',
            '-cpu-used',
            '6',
            '-row-mt',
            '1',
            '-c:a',
            'libopus',
            '-t',
            String(item.duration),
            path.join(out, `${base}_Alpha.webm`),
            '-map',
            '[phone]',
            '-map',
            '1:a',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '19',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '160k',
            '-movflags',
            '+faststart',
            '-t',
            String(item.duration),
            path.join(out, `${base}_GreenScreen.mp4`),
          ]);
          const frames = Math.round(item.duration * 30);
          for (let start = 0; start < frames; start += 6) {
            const images = await page.evaluate(
              ({ id, format, start, frames }) => {
                const item = essentials.items.find((i) => i.id === id),
                  result = [];
                for (let i = start; i < Math.min(start + 6, frames); i++) {
                  essentials.draw(item, i / 30, format);
                  result.push(
                    essentials.canvas.toDataURL('image/png').split(',')[1],
                  );
                }
                return result;
              },
              { id: item.id, format, start, frames },
            );
            for (const png of images) {
              if (!job.child.stdin.write(Buffer.from(png, 'base64')))
                await once(job.child.stdin, 'drain');
            }
          }
          job.child.stdin.end();
          await job.done;
          const png = await page.evaluate(
            ({ id, format }) => {
              const item = essentials.items.find((i) => i.id === id);
              essentials.draw(
                item,
                item.kind === 'transition' ? 0.45 : 1,
                format,
                'navy',
              );
              return essentials.canvas.toDataURL('image/png').split(',')[1];
            },
            { id: item.id, format },
          );
          fs.writeFileSync(
            path.join(out, `${base}_Preview.png`),
            Buffer.from(png, 'base64'),
          );
          console.log(`Rendered ${base}`);
        }
      }
    if (only) return;
    // Compile an actual montage with the alpha decoded explicitly and composited on navy.
    const clips = [];
    for (const item of items) {
      const clip = path.join(out, `${item.id}_Preview.mp4`);
      clips.push(clip);
      await command([
        '-c:v',
        'libvpx-vp9',
        '-i',
        path.join(out, `${item.id}_16x9_Alpha.webm`),
        '-f',
        'lavfi',
        '-i',
        `color=c=0x0e1a2e:s=960x540:r=30:d=${item.duration}`,
        '-filter_complex',
        '[0:v]scale=960:540[fg];[1:v][fg]overlay=shortest=1:format=auto,format=yuv420p[v]',
        '-map',
        '[v]',
        '-map',
        '0:a',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-c:a',
        'aac',
        '-t',
        String(item.duration),
        clip,
      ]);
    }
    const list = path.join(out, '.preview-list.txt');
    fs.writeFileSync(
      list,
      clips.map((f) => `file '${f.replaceAll('\\', '/')}'`).join('\n'),
    );
    await command([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      path.join(out, 'TIM_Race_Recap_Preview.mp4'),
    ]);
    // Remove only intermediate files created by this build, never existing packs.
    fs.unlinkSync(list);
    const readme = `T.im RACE RECAP

10 reusable clips for a race video: Race recap, Before the start, Race start, Halfway, Final push, Finish line, Personal best, Finish time, Average pace, Thanks for watching.

1920 x 1080 landscape / 1080 x 1920 portrait. 30 fps.
GreenScreen.mp4: H.264 + AAC sound. Add as an overlay in CapCut and Chroma Key the green.
Alpha.webm: VP9 alpha + Opus sound. Requires a desktop editor with WebM-alpha support; iPhone Photos cannot open it.
WAV: matching stereo 48 kHz PCM sound. Sound is already in each video; mute it if adding the WAV separately.
Preview.mp4 / Preview.png: reference assets on navy, not transparent overlays.

Suggested sequence: Race recap > Before the start > Race start > Halfway > Final push > Finish line > Finish time / Average pace > Thanks for watching. Personal best is optional; use only for a real PB. Mix with the existing Running Essentials distance markers and transitions.

RESULT PANELS: Finish time and Average pace intentionally have blank dark insets, with no made-up result. Put a text layer above the clip in your editor. Use your actual time, or pace plus min/km or min/mi. Keep text within the inset and time its visibility to 0.65s through 4.40s, while the panel is stationary and fully visible. In landscape the inset is x=312,y=481,width=1296,height=232. In portrait it is x=152,y=901,width=776,height=232. Coordinates are relative to the full 1080p exported frame.

All clips enter, hold, and leave; first and last frames are clear. Extend a hold by freezing a middle frame, rather than slowing the entrance.

The downloads page includes individual clip previews and the complete pack ZIP. No rendering is required to use the files.
Source and rebuild instructions: tools/race-recap/ in the repository.
`;
    fs.writeFileSync(path.join(out, 'READ-ME.txt'), readme);
    const files = fs
      .readdirSync(out)
      .filter(
        (f) =>
          !f.endsWith('.zip') && !f.startsWith('.') && f !== 'manifest.json',
      );
    const manifest = {
      version: 1,
      fps: 30,
      formats: { '16x9': [1920, 1080], '9x16': [1080, 1920] },
      resultTextVisibleSeconds: [0.65, 4.4],
      items,
      files: files.map((file) => ({
        file,
        bytes: fs.statSync(path.join(out, file)).size,
      })),
    };
    fs.writeFileSync(
      path.join(out, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );
    const zipResult = spawnSync(
      'python',
      [
        '-c',
        "import pathlib,zipfile,sys; p=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(p/'TIM_Race_Recap.zip','w',zipfile.ZIP_DEFLATED); [(z.write(f,f.name)) for f in sorted(p.iterdir()) if f.is_file() and f.suffix!='.zip' and not f.name.startswith('.')]; z.close()",
        out,
      ],
      { encoding: 'utf8' },
    );
    if (zipResult.status) throw new Error(zipResult.stderr);
    const rows = items
      .map(
        (item) =>
          `<li class="item"><div class="meta"><h3>${item.title}</h3><p>${item.duration}s · ${item.description}</p><details class="recap-preview"><summary>Preview this clip</summary><video controls playsinline preload="none" poster="files/race-recap/${item.id}_16x9_Preview.png" src="files/race-recap/${item.id}_Preview.mp4" aria-label="${item.title} preview"></video></details></div><div class="btns">${['16x9', '9x16'].map((f) => button(`${item.id}_${f}_GreenScreen.mp4`, `${f === '16x9' ? '16:9' : '9:16'} · Green screen MP4`) + button(`${item.id}_${f}_Alpha.webm`, `${f === '16x9' ? '16:9' : '9:16'} · Transparent WebM`)).join('')}${button(`${item.id}.wav`, 'Sound WAV')}</div></li>`,
      )
      .join('\n');
    const section = `<!-- race-recap:start -->
<section class="pack" id="race-recap"><div class="packhead"><div><h2>Race Recap</h2><p>Ten reusable clips from the build-up to the finish: opener, race chapters, celebrations, blank result panels and outro. Landscape and portrait, 1080p at 30 fps.</p></div>${button('TIM_Race_Recap.zip', 'Whole pack (ZIP)')}</div><video class="prev" src="files/race-recap/TIM_Race_Recap_Preview.mp4" poster="files/race-recap/race-recap_16x9_Preview.png" controls playsinline preload="metadata" aria-label="Race Recap pack preview"></video><p>Use the green-screen MP4s on your phone, or transparent WebMs in compatible desktop editors. Sound is built in; separate WAVs are included. <b>Finish time and Average pace have blank panels</b> for your actual results: add a text layer in your editor. <a href="files/race-recap/READ-ME.txt">Import guide and result-panel instructions</a>.</p><p>Suggested order: opener → build-up → start → halfway → final push → finish → results → outro. Mix with the <a href="#running-essentials">Running Essentials</a> distance markers and transitions.</p><ul class="items">${rows}</ul></section>
<!-- race-recap:end -->`;
    const htmlPath = path.join(root, 'downloads/index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    if (html.includes('<!-- race-recap:start -->'))
      html = html.replace(
        /<!-- race-recap:start -->[\s\S]*?<!-- race-recap:end -->/,
        section,
      );
    else
      html = html.replace(
        '<!-- running-essentials:start -->',
        `${section}\n<!-- running-essentials:start -->`,
      );
    if (!html.includes('href="#race-recap"'))
      html = html.replace(
        '<a href="#running-essentials">',
        '<a href="#race-recap">Race Recap</a><a href="#running-essentials">',
      );
    fs.writeFileSync(htmlPath, html);
    console.log(`Pack ready: ${size('TIM_Race_Recap.zip')}`);
  } finally {
    await browser.close();
    http.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
