(() => {
  const modes = {
    carousel: {
      path: '../carousel-maker/',
      title: 'Carousel Post Maker',
      hint: 'Edit a slide deck, then export numbered PNGs or a ZIP.',
    },
    rankings: {
      path: '../tier-list/',
      title: 'Tier List Maker',
      hint: 'Rank your items as a carousel or a reveal video with sound.',
    },
    compare: {
      path: '../before-after/',
      title: 'Before and After',
      hint: 'Compare two photos as a still, a wipe or a fade.',
    },
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
      if (frame?.contentWindow.TimSocialEditor?.isBusy()) {
        status.textContent =
          'Close the export dialog, or wait for the preview or export to finish before changing modes.';
        return false;
      }
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
        frame.contentDocument?.addEventListener('click', (event) => {
          const link = event.target.closest('a[href]');
          if (
            !link ||
            link.hasAttribute('download') ||
            link.protocol === 'blob:' ||
            link.origin !== location.origin ||
            link.target === '_blank'
          )
            return;
          link.target = '_top';
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
      : 'carousel';
  window.addEventListener('hashchange', () => {
    if (!show(requested(), false)) history.replaceState(null, '', '#' + active);
  });
  show(requested(), false);
})();
