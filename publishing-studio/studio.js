(() => {
  const modes = {
    covers: {
      path: '../cover-maker/',
      title: 'Cover Maker',
      hint: 'YouTube thumbnails, Reel covers and highlight covers.',
    },
    promos: {
      path: '../promo-maker/',
      title: 'Promo Maker',
      hint: 'Announce your video with a thumbnail, title and sound.',
    },
    brand: {
      path: '../brand-assets/',
      title: 'Brand Templates',
      hint: 'Keep Moving, Find Your Flow and your channel banner.',
    },
  };
  const frames = new Map();
  const status = document.getElementById('status');
  const links = [...document.querySelectorAll('[data-mode]')];
  let active;
  function editorUrl(mode) {
    const url = new URL(modes[mode].path, location.href);
    url.search = location.search;
    // A requested brand template must not affect another mode.
    if (mode !== 'brand') url.searchParams.delete('template');
    return url;
  }
  function show(mode, updateUrl = true) {
    if (active && active !== mode) {
      const frame = frames.get(active);
      const api = frame?.contentWindow.TimPublishingEditor;
      if (api?.isBusy()) {
        status.textContent =
          'Finish exporting or wait for the promo preview to finish before changing modes.';
        return false;
      }
      api?.pausePreview?.();
      frame?.contentDocument
        ?.querySelectorAll('video, audio')
        .forEach((media) => media.pause());
    }
    status.textContent = '';
    if (!frames.has(mode)) {
      const frame = document.createElement('iframe');
      frame.dataset.mode = mode;
      frame.title = modes[mode].title;
      frame.allow = 'autoplay; web-share';
      frame.src = editorUrl(mode).href;
      frame.addEventListener('load', () => {
        const doc = frame.contentDocument;
        if (!doc) return;
        if (frame.hidden)
          frame.contentWindow.TimPublishingEditor?.pausePreview?.();
        doc.addEventListener('click', (event) => {
          const link = event.target.closest('a[href]');
          if (
            !link ||
            link.hasAttribute('download') ||
            link.protocol === 'blob:' ||
            link.origin !== location.origin ||
            link.target === '_blank'
          )
            return;
          const targetMode = Object.keys(modes).find(
            (id) =>
              new URL(modes[id].path, location.href).pathname === link.pathname,
          );
          if (
            targetMode &&
            !link.search &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            event.preventDefault();
            show(targetMode);
          } else link.target = '_top';
        });
      });
      frames.set(mode, frame);
      document.getElementById('editors').append(frame);
    }
    active = mode;
    for (const [id, frame] of frames) frame.hidden = id !== mode;
    for (const link of links) {
      if (link.dataset.mode === mode) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.getElementById('hint').textContent = modes[mode].hint;
    document.getElementById('standalone').href = editorUrl(mode).href;
    if (updateUrl) history.replaceState(null, '', '#' + mode);
    return true;
  }
  for (const link of links)
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      show(link.dataset.mode);
    });
  const requested = () =>
    Object.hasOwn(modes, location.hash.slice(1))
      ? location.hash.slice(1)
      : 'covers';
  window.addEventListener('hashchange', () => {
    if (!show(requested(), false)) history.replaceState(null, '', '#' + active);
  });
  show(requested(), false);
})();
