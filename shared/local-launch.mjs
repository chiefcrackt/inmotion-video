// "Open" buttons for the local tools (Transcribe Video, Clean Voice). They run on this
// computer, so the page can't start them: when one isn't running, show the command that does.
// Use: <a href="http://127.0.0.1:8765/" data-local-launch="transcribe">…</a>

const TOOLS = {
  transcribe: {
    name: 'Transcribe Video',
    folder: 'local-transcriber',
    launcher: 'Start Transcribe Video.cmd',
  },
  voice: {
    name: 'Clean Voice',
    folder: 'local-voice',
    launcher: 'Start Clean Voice.cmd',
  },
};
const FOLDER_KEY = 'tim-local-tools-folder';
const SHELL_KEY = 'tim-local-tools-shell';

function stored(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Works without storage; the folder is asked again next time. */
  }
}

// The repository folder, however it was pasted: quotes, a trailing slash or a tool's own folder.
function cleanFolder(raw) {
  return raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[\\/]+$/, '')
    .replace(/[\\/](local-transcriber|local-voice)$/i, '');
}

export function command(tool, folder, shell) {
  const dir = cleanFolder(folder) || 'C:\\path\\to\\inmotion-video';
  return shell === 'cmd'
    ? `cd /d "${dir}" && "${tool.folder}\\${tool.launcher}"`
    : `cd "${dir}"; & ".\\${tool.folder}\\${tool.launcher}"`;
}

async function running(url) {
  // A reply of any kind (even a refusal) means the tool is up; a refused connection throws.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    await fetch(url + 'app.js', {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const CSS = `
.ll-backdrop{position:fixed;inset:0;background:rgba(5,10,20,.72);display:flex;align-items:center;justify-content:center;padding:16px;z-index:1000}
.ll-dialog{background:#13233d;color:#f6f4ef;border:1px solid #31445d;border-radius:16px;max-width:620px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:24px;font:16px/1.5 system-ui,sans-serif;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.ll-dialog h2{font-family:"Barlow Condensed",system-ui,sans-serif;font-weight:900;text-transform:uppercase;font-size:28px;margin:0 0 6px}
.ll-dialog p{color:#bccddd;margin:8px 0}
.ll-dialog label{display:block;font-size:14px;color:#c5d4e3;margin:16px 0 6px}
.ll-dialog input{width:100%;background:#0c1728;color:#f6f4ef;border:1px solid #435771;border-radius:8px;padding:10px;font:14px ui-monospace,Consolas,monospace}
.ll-tabs{display:flex;gap:0;margin:16px 0 0;border:1px solid #435771;border-radius:10px 10px 0 0;overflow:hidden;width:fit-content}
.ll-tabs button{background:#0c1728;color:#f6f4ef;border:0;padding:8px 14px;font:600 14px system-ui;cursor:pointer}
.ll-tabs button[aria-selected=true]{background:#2e9bad;color:#0e1a2e}
.ll-code{display:flex;gap:8px;align-items:stretch;background:#080f1c;border:1px solid #435771;border-radius:0 10px 10px 10px;padding:10px}
.ll-code code{flex:1;font:14px/1.5 ui-monospace,Consolas,monospace;color:#f6f4ef;overflow-wrap:anywhere;white-space:pre-wrap}
.ll-btn{display:inline-block;background:#e8c96a;color:#102033;border:0;border-radius:9px;padding:12px 18px;font:700 15px system-ui;cursor:pointer;text-decoration:none}
.ll-btn.ll-quiet{background:#293f59;color:#f6f4ef}
.ll-btn:disabled{opacity:.45;cursor:not-allowed}
.ll-dialog input[aria-invalid=true]{border-color:#e8c96a;box-shadow:0 0 0 2px rgba(232,201,106,.35)}
.ll-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
.ll-status{min-height:24px;color:#9dd8d8;font-weight:600}
.ll-dialog small{color:#a9bdd0}
.ll-dialog :focus-visible{outline:3px solid #2e9bad;outline-offset:3px}
`;

function dialog(tool, url) {
  if (!document.getElementById('ll-style')) {
    const style = document.createElement('style');
    style.id = 'll-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  const back = document.createElement('div');
  back.className = 'll-backdrop';
  back.innerHTML = `
    <div class="ll-dialog" role="dialog" aria-modal="true" aria-labelledby="ll-title">
      <h2 id="ll-title"></h2>
      <p class="ll-lead"></p>
      <label for="ll-folder">Your inmotion-video folder (remembered on this browser)</label>
      <input id="ll-folder" spellcheck="false" autocomplete="off" placeholder="C:\\Users\\you\\Documents\\inmotion-video">
      <div class="ll-tabs" role="tablist" aria-label="Terminal">
        <button type="button" role="tab" data-shell="ps">PowerShell / Terminal</button>
        <button type="button" role="tab" data-shell="cmd">Command Prompt</button>
      </div>
      <div class="ll-code"><code></code><button type="button" class="ll-btn ll-copy">Copy</button></div>
      <p><small class="ll-hint"></small></p>
      <p class="ll-status" role="status" aria-live="polite"></p>
      <div class="ll-row">
        <a class="ll-btn ll-open" target="_blank" rel="noopener noreferrer"></a>
        <button type="button" class="ll-btn ll-quiet ll-close">Close</button>
      </div>
    </div>`;
  const $ = (s) => back.querySelector(s);
  $('#ll-title').textContent = `Start ${tool.name}`;
  $('.ll-lead').textContent =
    `${tool.name} isn't running on this computer. Paste this into a terminal and press Enter; it starts in the background and opens the studio.`;
  $('.ll-hint').textContent =
    `Or double-click ${tool.launcher} in the ${tool.folder} folder. It stops when the computer restarts.`;
  $('.ll-open').href = url;
  $('.ll-open').textContent = `Open ${tool.name} anyway ↗`;
  const folder = $('#ll-folder');
  folder.value = stored(FOLDER_KEY);
  let shell = stored(SHELL_KEY, 'ps');
  const render = () => {
    // No folder yet: ask for it rather than show a command with a made-up path in it.
    const ready = Boolean(cleanFolder(folder.value));
    $('code').textContent = ready
      ? command(tool, folder.value, shell)
      : '↑ Paste your inmotion-video folder above first. In File Explorer, open the folder, click the address bar and copy it.';
    $('.ll-copy').disabled = !ready;
    folder.setAttribute('aria-invalid', String(!ready));
    back
      .querySelectorAll('[data-shell]')
      .forEach((b) =>
        b.setAttribute('aria-selected', String(b.dataset.shell === shell)),
      );
  };
  folder.addEventListener('input', () => {
    store(FOLDER_KEY, cleanFolder(folder.value));
    render();
  });
  back.querySelectorAll('[data-shell]').forEach((b) =>
    b.addEventListener('click', () => {
      shell = b.dataset.shell;
      store(SHELL_KEY, shell);
      render();
    }),
  );
  $('.ll-copy').addEventListener('click', async () => {
    const text = $('code').textContent;
    try {
      await navigator.clipboard.writeText(text);
      $('.ll-copy').textContent = 'Copied';
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('code'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      $('.ll-copy').textContent = 'Press Ctrl+C';
    }
    setTimeout(() => ($('.ll-copy').textContent = 'Copy'), 2500);
  });
  const opener = document.activeElement;
  let watching = true;
  const close = () => {
    watching = false;
    back.remove();
    document.removeEventListener('keydown', onKey);
    opener?.focus?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => e.target === back && close());
  $('.ll-close').addEventListener('click', close);
  $('.ll-open').addEventListener('click', close);
  render();
  document.body.append(back);
  (folder.value ? $('.ll-copy') : folder).focus();
  // Notice when it comes up, so the button can say so.
  (async () => {
    while (watching) {
      await new Promise((r) => setTimeout(r, 1500));
      if (watching && (await running(url))) {
        $('.ll-status').textContent = `${tool.name} is running.`;
        $('.ll-open').textContent = `Open ${tool.name} ↗`;
        return;
      }
    }
  })();
}

for (const link of document.querySelectorAll('[data-local-launch]')) {
  const tool = TOOLS[link.dataset.localLaunch];
  if (!tool) continue;
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    const url = link.href.endsWith('/') ? link.href : link.href + '/';
    if (await running(url)) window.open(url, '_blank', 'noopener');
    else dialog(tool, url);
  });
}
