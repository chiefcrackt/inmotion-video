(() => {
  const fonts = {
    'Barlow Condensed': '"Barlow Condensed", "Arial Narrow", sans-serif',
    Arial: 'Arial, sans-serif',
    Georgia: 'Georgia, serif',
    monospace: 'monospace',
  };
  const palettes = {
    tim: ['#0e1a2e', '#f6f4ef', '#e8c96a', '#2e9bad'],
    minimal: ['#f6f4ef', '#172332', '#28655c', '#28655c'],
    broadcast: ['#111820', '#ffffff', '#e8c96a', '#f17152'],
  };
  const keys = ['#0e1a2e', '#f6f4ef', '#e8c96a', '#2e9bad'];
  const clone = (v) => JSON.parse(JSON.stringify(v));
  function color(value, theme) {
    const i = keys.indexOf(value.toLowerCase());
    return i < 0 ? value : (palettes[theme] || palettes.tim)[i];
  }
  function database() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('tim-tool-projects', 1);
      r.onupgradeneeded = () =>
        r.result.createObjectStore('projects', { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function query(mode, action) {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('projects', mode);
        const req = action(tx.objectStore('projects'));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () =>
          reject(tx.error || new Error('Storage transaction cancelled'));
      });
    } finally {
      db.close();
    }
  }
  function validate(doc, tool) {
    if (
      !doc ||
      doc.version !== 1 ||
      doc.tool !== tool ||
      !doc.payload ||
      typeof doc.payload !== 'object' ||
      Array.isArray(doc.payload)
    )
      throw Error('Choose a version 1 project for this tool.');
    if (JSON.stringify(doc).length > 35 * 1024 * 1024)
      throw Error('Project exceeds the 35 MB limit.');
    return doc;
  }
  function checkState(value, sample, depth = 0) {
    if (depth > 12) throw Error('Project nesting is too deep.');
    if (sample === null) return value === null ? null : clone(value);
    if (Array.isArray(sample)) {
      if (!Array.isArray(value) || value.length > 100)
        throw Error('Invalid project list.');
      return value.map((v, i) =>
        sample.length
          ? checkState(v, sample[Math.min(i, sample.length - 1)], depth + 1)
          : clone(v),
      );
    }
    if (typeof sample === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error('Invalid project settings.');
      const result = {};
      for (const k of Object.keys(sample))
        result[k] =
          k in value
            ? checkState(value[k], sample[k], depth + 1)
            : clone(sample[k]);
      return result;
    }
    if (
      typeof value !== typeof sample ||
      (typeof value === 'number' &&
        (!Number.isFinite(value) || Math.abs(value) > 1e7)) ||
      (typeof value === 'string' && value.length > 10000)
    )
      throw Error('Invalid project setting.');
    return value;
  }
  function validateControls(state) {
    for (const [key, value] of Object.entries(state)) {
      const el = document.getElementById(key);
      if (
        el &&
        el.tagName === 'SELECT' &&
        el.options.length &&
        ![...el.options].some((o) => o.value === String(value))
      )
        throw Error('Invalid choice for ' + key + '.');
      if (
        el &&
        ['number', 'range'].includes(el.type) &&
        (Number(value) < Number(el.min || '-Infinity') ||
          Number(value) > Number(el.max || 'Infinity'))
      )
        throw Error('Invalid value for ' + key + '.');
      const choices = [...document.querySelectorAll('[data-g]')]
        .filter((b) => b.dataset.g === key)
        .map((b) => b.dataset.v);
      if (choices.length && !choices.includes(String(value)))
        throw Error('Invalid choice for ' + key + '.');
    }
    return state;
  }
  async function image(src) {
    if (!src) return null;
    if (
      typeof src !== 'string' ||
      !/^data:image\/(png|jpeg|webp);base64,/.test(src) ||
      src.length > 32 * 1024 * 1024
    )
      throw Error('Invalid embedded photo.');
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(Error('Cannot read the project photo.'));
      im.src = src;
    });
  }
  function photo(im) {
    if (!im) return '';
    const c = document.createElement('canvas');
    const scale = Math.min(
      1,
      2400 / Math.max(im.naturalWidth, im.naturalHeight),
    );
    c.width = Math.max(1, Math.round(im.naturalWidth * scale));
    c.height = Math.max(1, Math.round(im.naturalHeight * scale));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
  function mount(options) {
    const {
      tool,
      get,
      set,
      busy = () => false,
      preset = false,
      look,
    } = options;
    const section = document.createElement('details');
    section.className = 'tim-projects';
    section.id = 'tim-projects';
    section.innerHTML =
      '<summary>Saved ' +
      (preset ? 'presets' : 'projects') +
      (look ? ' & text / theme' : '') +
      '</summary><div class="tim-project-body"><p class="tim-help"></p><label>Name<input id="tim-project-name" maxlength="80" placeholder="My setup"></label><div class="tim-actions"><button type="button" id="tim-project-save">Save as new</button><button type="button" id="tim-project-export">Export JSON</button><label class="tim-import">Import JSON<input id="tim-project-import" type="file" accept=".json,application/json"></label></div><label>Saved in this browser<select id="tim-project-list"><option value="">Choose a saved item</option></select></label><div class="tim-actions"><button type="button" id="tim-project-load">Load selected</button><button type="button" id="tim-project-delete">Delete selected</button></div><p role="status" aria-live="polite" id="tim-project-status"></p></div>';
    const host =
      document.querySelector('.controls') ||
      document.querySelector('#controls') ||
      document.querySelector('aside') ||
      document.querySelector('main') ||
      document.querySelector('.wrap') ||
      document.body;
    host.prepend(section);
    const $ = (id) => section.querySelector('#tim-project-' + id),
      status = (s) => ($('status').textContent = s);
    section.querySelector('.tim-help').textContent = preset
      ? 'Saves design and export settings only. Re-import your activity file separately; GPS data is never included.'
      : 'Named snapshots stay in this browser. Export JSON to back up or move editable settings and photos to another device.';
    let pending = false;
    const run = (fn) => async () => {
      if (pending) return;
      if (busy()) {
        syncLook();
        status('Stop playback or recording before changing projects.');
        return;
      }
      pending = true;
      try {
        await fn();
      } catch (e) {
        status(
          e.message || 'Storage unavailable. Export JSON to keep your work.',
        );
      } finally {
        pending = false;
      }
    };
    async function refresh() {
      const list = $('list');
      list.replaceChildren(new Option('Choose a saved item', ''));
      const rows = await query('readonly', (s) => s.getAll());
      rows
        .filter((r) => r.tool === tool)
        .sort((a, b) => b.updated - a.updated)
        .forEach((r) => list.add(new Option(r.name, r.id)));
    }
    const documentData = () => ({
      version: 1,
      tool,
      name: $('name').value.trim() || 'Untitled',
      payload: clone(get()),
    });
    $('save').onclick = run(async () => {
      const doc = documentData();
      validate(doc, tool);
      await query('readwrite', (s) =>
        s.put({ ...doc, id: crypto.randomUUID(), updated: Date.now() }),
      );
      await refresh();
      status('Saved a new snapshot.');
    });
    $('load').onclick = run(async () => {
      if (!$('list').value) return status('Choose a saved item first.');
      const doc = validate(
        await query('readonly', (s) => s.get($('list').value)),
        tool,
      );
      if (!confirm('Replace the current setup with ' + doc.name + '?')) return;
      await set(clone(doc.payload));
      $('name').value = doc.name;
      syncLook();
      status('Loaded ' + doc.name + '.');
    });
    $('delete').onclick = run(async () => {
      if (!$('list').value) return status('Choose a saved item first.');
      if (!confirm('Delete this saved snapshot?')) return;
      await query('readwrite', (s) => s.delete($('list').value));
      await refresh();
      status('Deleted saved snapshot.');
    });
    $('export').onclick = run(async () => {
      const doc = documentData();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(doc)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download =
        tool + '-' + doc.name.replace(/[^a-z0-9_-]/gi, '_') + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status('Exported portable JSON.');
    });
    $('import').onchange = run(async () => {
      const f = $('import').files[0];
      $('import').value = '';
      if (!f) return;
      if (f.size > 35 * 1024 * 1024)
        throw Error('Project exceeds the 35 MB limit.');
      const doc = validate(JSON.parse(await f.text()), tool);
      if (!confirm('Replace the current setup with the imported project?'))
        return;
      await set(clone(doc.payload));
      $('name').value = String(doc.name || 'Imported').slice(0, 80);
      syncLook();
      status('Imported. Save as new to keep it in this browser.');
    });
    let fontSelect, themeSelect;
    function syncLook() {
      if (look) {
        const v = look.get();
        fontSelect.value = v.font || 'Barlow Condensed';
        themeSelect.value = v.theme || 'tim';
      }
    }
    if (look) {
      const row = document.createElement('div');
      row.className = 'tim-actions';
      const label = (text, id, values) => {
        const l = document.createElement('label');
        l.textContent = text;
        const select = document.createElement('select');
        select.id = id;
        for (const [v, t] of values) select.add(new Option(t, v));
        l.append(select);
        row.append(l);
        return select;
      };
      fontSelect = label(
        'Text font',
        'tim-text-font',
        Object.keys(fonts).map((f) => [f, f]),
      );
      themeSelect = label('Output theme', 'tim-output-theme', [
        ['tim', 'T.im (default)'],
        ['minimal', 'Minimal'],
        ['broadcast', 'Race Broadcast'],
      ]);
      section.querySelector('.tim-project-body').prepend(row);
      fontSelect.onchange = themeSelect.onchange = run(async () => {
        await look.set({ font: fontSelect.value, theme: themeSelect.value });
        await document.fonts.ready;
        syncLook();
        status('Output style updated.');
      });
      syncLook();
    }
    refresh().catch(() =>
      status('Browser storage is unavailable. JSON export/import still works.'),
    );
    return section;
  }
  window.TimProjects = {
    mount,
    color,
    family: (name) => fonts[name] || fonts['Barlow Condensed'],
    checkState,
    validateControls,
    image,
    photo,
  };
})();
