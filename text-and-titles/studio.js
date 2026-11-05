(() => {
  const modes = {
    text: { path: '../text-motion/', title: 'Animated text' },
    titles: { path: '../title-maker/', title: 'Titles and lower thirds' },
    captions: { path: '../caption-maker/', title: 'Caption maker' },
  };
  const frames = new Map();
  const links = [...document.querySelectorAll('[data-mode]')];
  const status = document.getElementById('status');
  let active;

  function editorUrl(mode) {
    const url = new URL(modes[mode].path, location.href);
    url.search = location.search;
    return url;
  }

  function show(mode, updateUrl = true) {
    if (active && active !== mode) {
      const frame = frames.get(active);
      const api = frame?.contentWindow.TimStudioEditor;
      if (api?.isBusy()) {
        status.textContent =
          'Finish exporting or wait for the title preview to finish before changing modes.';
        return false;
      }
      // Text Motion loops automatically. Pause that loop, preserving position.
      api?.pausePreview?.();
      frame?.contentDocument
        ?.querySelectorAll('video, audio')
        .forEach((media) => media.pause());
    }
    status.textContent = '';
    if (!frames.has(mode)) {
      const frame = document.createElement('iframe');
      frame.title = modes[mode].title;
      frame.dataset.mode = mode;
      frame.allow = 'autoplay; web-share';
      frame.src = editorUrl(mode).href;
      frame.addEventListener('load', () => {
        const doc = frame.contentDocument;
        if (!doc?.body) return;
        if (frame.hidden) frame.contentWindow.TimStudioEditor?.pausePreview?.();
        const viewportStyle = doc.createElement('style');
        doc.head.append(viewportStyle);
        const fitPreview = () => {
          viewportStyle.textContent = `.stagebox #cv { max-height: ${Math.round(innerHeight * (innerWidth <= 860 ? 0.42 : 0.62))}px; } #vid { max-height: ${Math.round(innerHeight * 0.46)}px; }`;
        };
        fitPreview();
        window.addEventListener('resize', fitPreview);
        // Navigation out of an editor should leave the whole studio.
        doc.querySelectorAll('a[href]').forEach((link) => {
          if (
            link.origin === location.origin &&
            !link.target &&
            !link.hasAttribute('download')
          )
            link.target = '_top';
        });
        const resize = () => {
          if (!frame.hidden)
            frame.style.height =
              Math.ceil(doc.body.getBoundingClientRect().height + 32) + 'px';
        };
        const observer = new ResizeObserver(resize);
        observer.observe(doc.body);
        frame.resizeEditor = resize;
        resize();
      });
      frames.set(mode, frame);
      document.getElementById('editors').append(frame);
    }
    active = mode;
    for (const [id, frame] of frames) frame.hidden = id !== mode;
    frames.get(mode).resizeEditor?.();
    for (const link of links) {
      if (link.dataset.mode === mode) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
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
      : 'text';
  window.addEventListener('hashchange', () => {
    if (!show(requested(), false)) history.replaceState(null, '', '#' + active);
  });
  show(requested(), false);
})();
