// The Studio bar: one shared "← Studio" link and page name at the top of every
// tool, so every page gets home the same way.
//
// To add it to a page, put these two lines in <head>:
//   <link rel="stylesheet" href="../shared/studio-bar.css?v=30ec331d" />
//   <script type="module" src="../shared/studio-bar.mjs"></script>
// and this as the first thing inside <body>:
//   <tim-studio-bar></tim-studio-bar>
// The name comes from shared/tool-registry.mjs. For a page that isn't in the
// registry, set it yourself: <tim-studio-bar name="My page"></tim-studio-bar>.
// tests/studio-bar.test.mjs fails if a page leaves any of this out.
//
// The bar draws inside a shadow root, so a tool's own link and button styles
// can't change it. studio-bar.css only reserves its space before this runs.

import { pageName, STUDIO_NAME } from './tool-registry.mjs?v=bd7e374e';

// The studio home is the folder above shared/, which also works under the
// GitHub Pages project path (/inmotion-video/).
const home = new URL('../', import.meta.url);

const STYLE = `
  :host { all: initial; }
  nav {
    display: flex; align-items: center; gap: 8px; box-sizing: border-box;
    min-height: 44px; min-width: 0;
    padding: 0 max(12px, env(safe-area-inset-right, 0px)) 0 max(12px, env(safe-area-inset-left, 0px));
    font: 600 16px/1 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
    letter-spacing: 0.04em; color: #f6f4ef;
  }
  a {
    display: inline-flex; align-items: center; gap: 6px; flex: none;
    min-height: 44px; padding: 0 6px; margin-left: -6px; border-radius: 6px;
    color: #f6f4ef; text-decoration: none; white-space: nowrap;
  }
  a:hover { color: #e8c96a; }
  a:focus-visible { outline: 3px solid #e8c96a; outline-offset: -3px; }
  .sep { color: #3a5178; }
  .name { color: #9fb0c8; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

function currentDir() {
  const rest = decodeURIComponent(location.pathname).slice(
    decodeURIComponent(home.pathname).length,
  );
  const first = rest.split('/')[0];
  return first ? first + '/' : '';
}

function embedded() {
  try {
    return window.self !== window.top;
  } catch {
    return true; // A cross-origin parent: we are framed.
  }
}

const px = (v) => parseFloat(v) || 0;

class StudioBar extends HTMLElement {
  connectedCallback() {
    // Studio previews load these pages in frames and supply their own header.
    if (embedded()) {
      this.remove();
      return;
    }
    if (!this.shadowRoot) this.render();
    this.fit();
    this.onResize ??= () => requestAnimationFrame(() => this.fit());
    window.addEventListener('resize', this.onResize);
  }

  disconnectedCallback() {
    if (this.onResize) window.removeEventListener('resize', this.onResize);
  }

  render() {
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', STUDIO_NAME);
    const link = document.createElement('a');
    link.href = home.href;
    link.setAttribute('aria-label', 'Back to ' + STUDIO_NAME);
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '←';
    link.append(arrow, ' Studio');
    nav.append(link);
    const name = this.getAttribute('name') || pageName(currentDir());
    if (name) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '/';
      const here = document.createElement('span');
      here.className = 'name';
      here.setAttribute('aria-current', 'page');
      here.textContent = name;
      nav.append(sep, here);
    }
    root.append(style, nav);
  }

  // Run edge to edge at the very top, even when the page pads its <body>,
  // and keep the page's own top spacing below the bar.
  fit() {
    if (this.parentElement !== document.body) return;
    const body = getComputedStyle(document.body);
    const own = px(getComputedStyle(this).paddingTop); // iPhone status bar
    const top = px(body.paddingTop) + px(body.marginTop);
    this.style.marginTop = -top + 'px';
    this.style.marginLeft = -(px(body.paddingLeft) + px(body.marginLeft)) + 'px';
    this.style.marginRight = -(px(body.paddingRight) + px(body.marginRight)) + 'px';
    this.style.marginBottom = Math.max(0, px(body.paddingTop) - own) + 'px';
  }
}

if (!customElements.get('tim-studio-bar'))
  customElements.define('tim-studio-bar', StudioBar);
