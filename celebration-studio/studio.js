(() => {
  const modes = {
    runners: { path: '../special-post/', title: 'Runner celebrations' },
    cards: { path: '../celebrate/', title: 'Cards, cakes and medals' },
  };
  const frames = new Map();
  const links = [...document.querySelectorAll('[data-mode]')];
  const status = document.getElementById('status');
  let active;

  function editorUrl(mode) {
    const url = new URL(modes[mode].path, location.href);
    // Keep project association intact.
    url.search = location.search;
    return url;
  }

  function show(mode, updateUrl = true) {
    if (active && active !== mode) {
      const doc = frames.get(active)?.contentDocument;
      const play = doc?.getElementById('play');
      if (
        doc?.getElementById('rec')?.disabled ||
        play?.textContent.includes('Stop')
      ) {
        status.textContent =
          'Finish recording or stop the preview before changing modes.';
        return false;
      }
      doc?.querySelectorAll('video, audio').forEach((media) => media.pause());
    }
    status.textContent = '';
    if (!frames.has(mode)) {
      const frame = document.createElement('iframe');
      frame.title = modes[mode].title;
      frame.dataset.mode = mode;
      frame.allow = 'autoplay; web-share';
      frame.src = editorUrl(mode).href;
      frame.addEventListener('load', () => {
        // One page scrollbar, including when saved-project panels expand.
        const doc = frame.contentDocument;
        if (!doc?.body) return;
        // The editor's vh-based preview limits must use the visible browser
        // viewport, rather than the auto-sized frame's full document height.
        const viewportStyle = doc.createElement('style');
        doc.head.append(viewportStyle);
        const fitPreview = () => {
          viewportStyle.textContent = `.stagebox #cv { max-height: ${Math.round(innerHeight * (innerWidth <= 860 ? 0.42 : 0.62))}px; } #vid { max-height: ${Math.round(innerHeight * 0.46)}px; }`;
        };
        fitPreview();
        window.addEventListener('resize', fitPreview);
        doc
          .querySelectorAll('a.home')
          .forEach((link) => (link.target = '_top'));
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
      : 'runners';
  window.addEventListener('hashchange', () => {
    if (!show(requested(), false)) history.replaceState(null, '', '#' + active);
  });
  show(requested(), false);
})();
