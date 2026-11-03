(() => {
  const views = {
    ideas: {
      editor: 'ideas',
      path: '../idea-vault/',
      title: 'Idea Vault',
      hint: 'Capture an idea. Save or close idea edits before changing views.',
    },
    projects: {
      editor: 'planner',
      path: '../content-planner/',
      title: 'Video projects',
      hint: 'Choose Create from idea to turn a captured idea into a video plan.',
    },
    shoot: {
      editor: 'planner',
      path: '../content-planner/',
      title: 'Video projects and shoot plans',
      hint: 'Shoot plans belong to a video. Choose a video to prepare its checklist.',
    },
  };
  window.TimContentDriveSession = new EventTarget();
  const frames = new Map();
  const status = document.getElementById('status');
  const links = [...document.querySelectorAll('[data-mode]')];
  let active;
  const projectId = () => new URLSearchParams(location.search).get('project');

  function editorUrl(mode) {
    const url = new URL(views[mode].path, location.href);
    url.search = location.search;
    if (mode === 'shoot') url.searchParams.set('view', 'shoot');
    const project = projectId();
    if (views[mode].editor === 'planner' && project)
      url.hash = encodeURIComponent(project);
    return url;
  }

  function show(mode, updateUrl = true) {
    if (active && active !== mode) {
      const frame = frames.get(views[active].editor);
      if (frame?.contentWindow.TimPlanningEditor?.isBusy()) {
        status.textContent =
          active === 'ideas'
            ? 'Save or close the idea editor before changing views.'
            : 'Exit filming mode before changing views.';
        return false;
      }
    }
    status.textContent = '';
    const view = views[mode];
    if (!frames.has(view.editor)) {
      const frame = document.createElement('iframe');
      frame.dataset.editor = view.editor;
      frame.title = view.title;
      frame.src = editorUrl(mode).href;
      frame.addEventListener('load', () => {
        if (!frame.contentDocument) return;
        // The host already supplies the workspace heading and home link.
        // Keep Idea Vault's account and sync controls visible.
        const style = frame.contentDocument.createElement('style');
        style.textContent =
          view.editor === 'planner'
            ? 'body > header, main > .eyebrow, main > h1, main > h1 + p { display: none; }'
            : 'main > header > div:first-child { display: none; }';
        frame.contentDocument.head.append(style);
        // Keep in-workspace links inside the host, and other destinations full-page.
        frame.contentDocument.addEventListener('click', (event) => {
          const link = event.target.closest('a[href]');
          if (
            !link ||
            link.hasAttribute('download') ||
            link.protocol === 'blob:'
          )
            return;
          if (link.origin !== location.origin || link.target === '_blank')
            return;
          const url = new URL(link.href);
          if (
            link.hasAttribute('data-linked-project') &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            if (frame.contentWindow.TimPlanningEditor?.isBusy()) {
              event.preventDefault();
              status.textContent =
                'Save or close the idea editor before changing views.';
              return;
            }
            event.preventDefault();
            history.replaceState(null, '', url.href);
            show('projects', false);
            return;
          }
          const ideaPath = new URL('../idea-vault/', location.href).pathname;
          if (
            url.pathname === ideaPath &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            event.preventDefault();
            show('ideas');
          } else link.target = '_top';
        });
        if (views[active]?.editor === view.editor) {
          frame.contentWindow.TimPlanningEditor?.showView?.(
            active === 'shoot' ? 'shoot' : 'details',
            projectId(),
          );
        }
      });
      frames.set(view.editor, frame);
      document.getElementById('editors').append(frame);
    }
    active = mode;
    for (const [id, frame] of frames) frame.hidden = id !== view.editor;
    frames
      .get(view.editor)
      .contentWindow.TimPlanningEditor?.showView?.(
        mode === 'shoot' ? 'shoot' : 'details',
        projectId(),
      );
    document.getElementById('hint').textContent = view.hint;
    document.getElementById('standalone').href = editorUrl(mode).href;
    for (const link of links) {
      if (link.dataset.mode === (mode === 'shoot' ? 'projects' : mode))
        link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
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
    location.hash === '#videos'
      ? 'projects'
      : Object.hasOwn(views, location.hash.slice(1))
        ? location.hash.slice(1)
        : 'projects';
  window.addEventListener('hashchange', () => {
    if (!show(requested(), false)) history.replaceState(null, '', '#' + active);
  });
  show(requested(), false);
})();
