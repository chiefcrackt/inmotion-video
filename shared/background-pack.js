/* Optional generated artwork; existing upload and layout options are retained. */
window.TimBackgrounds = {
  names: [
    'Night track',
    'Misty trail',
    'Wet asphalt',
    'Sunrise road',
    'Stadium lights',
    'Paper texture',
  ],
  ids: [
    'night-track',
    'misty-trail',
    'wet-asphalt',
    'sunrise-road',
    'stadium-lights',
    'paper-texture',
  ],
  cache: new WeakMap(),
  // Palette treatment is applied only at render time; original image bytes are retained.
  themedImage(image, palette) {
    const colors = palette.slice(0, 3);
    if (!colors.every((color) => /^#[0-9a-f]{6}$/i.test(color))) return image;
    const key = colors.join('|');
    let variants = this.cache.get(image);
    if (!variants) {
      variants = new Map();
      this.cache.set(image, variants);
    }
    if (variants.has(key)) return variants.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = colors.map((hex) =>
      [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)),
    );
    for (let i = 0; i < pixels.data.length; i += 4) {
      const light = Math.min(
        1,
        ((0.2126 * pixels.data[i] +
          0.7152 * pixels.data[i + 1] +
          0.0722 * pixels.data[i + 2]) /
          255) *
          2,
      );
      const amount = Math.min(light / 0.75, 1) * 0.55;
      const highlight = Math.max(0, (light - 0.75) / 0.25) * 0.65;
      for (let channel = 0; channel < 3; channel++) {
        const tone = rgb[0][channel] * (1 - amount) + rgb[2][channel] * amount;
        pixels.data[i + channel] = Math.round(
          tone * (1 - highlight) + rgb[1][channel] * highlight,
        );
      }
    }
    context.putImageData(pixels, 0, 0);
    if (variants.size >= 3) variants.delete(variants.keys().next().value);
    variants.set(key, canvas);
    return canvas;
  },
  mount(anchor, apply, options = {}) {
    const box = document.createElement('div');
    box.id = 'timBackgrounds';
    box.style.cssText =
      'margin:16px 0;padding:12px;border:1px solid currentColor;border-radius:8px';
    box.innerHTML =
      '<h3 style="margin:0 0 12px;font-size:16px">T.im background pack</h3><label>Background<select id="timBackgroundChoice"><option value="">Choose a background…</option></select></label><img id="timBackgroundPreview" alt="" hidden style="width:100%;max-height:140px;object-fit:cover;border-radius:6px;margin:8px 0"><label style="display:block;margin:8px 0"><input id="timBackgroundMatch" type="checkbox" checked> Match current theme / palette</label><button class="btn ghost" type="button" id="timBackgroundApply" disabled>Use selected background</button><p id="timBackgroundDescription" style="font-size:12px;line-height:1.5">Optional generated artwork. Replaces the current photo when applied; upload and framing controls remain available.</p><p id="timBackgroundStatus" role="status"></p>';
    anchor.insertAdjacentElement('afterend', box);
    const select = box.querySelector('select'),
      preview = box.querySelector('img'),
      button = box.querySelector('button'),
      status = box.querySelector('[role="status"]');
    if (options.description)
      box.querySelector('#timBackgroundDescription').textContent =
        options.description;
    const match = box.querySelector('#timBackgroundMatch');
    const sync = () => {
      const state = options.getState?.();
      const busy = !!options.isBusy?.();
      select.disabled = busy;
      button.disabled = busy || !select.value;
      match.disabled = busy || !state?.available;
      match.checked = state?.match !== false;
    };
    match.onchange = () => options.setMatch?.(match.checked);
    sync();
    this.ids.forEach((id, i) => select.add(new Option(this.names[i], id)));
    select.onchange = () => {
      button.disabled = !select.value;
      preview.hidden = !select.value;
      if (select.value) {
        preview.src = '../shared/backgrounds/' + select.value + '.jpg';
        preview.alt =
          this.names[select.selectedIndex - 1] + ' original artwork preview';
      }
      status.textContent = '';
    };
    button.onclick = async () => {
      if (options.isBusy?.() || !this.ids.includes(select.value)) return;
      button.disabled = true;
      select.disabled = true;
      status.textContent = 'Loading background…';
      try {
        const response = await fetch(
          '../shared/backgrounds/' + select.value + '.jpg',
        );
        if (!response.ok)
          throw Error('Background could not be loaded. Please try again.');
        await apply(
          new File([await response.blob()], select.value + '.jpg', {
            type: 'image/jpeg',
          }),
          select.value,
        );
        status.textContent =
          options.appliedMessage ||
          'Background added. Use the existing framing controls to adjust it.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
        select.disabled = false;
        sync();
      }
    };
    return { sync };
  },
};
