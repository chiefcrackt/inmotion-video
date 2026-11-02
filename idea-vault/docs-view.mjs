// Renders a documentToModel() result into a container. Read-only by design:
// it creates display nodes only and never wires up any editing.
//
// Every piece of document text goes through textContent, so document content
// can never inject markup. Links are created only from safe http(s) URLs.

const HEADING_TAG = { 1: 'h3', 2: 'h4', 3: 'h5', 4: 'h5', 5: 'h5', 6: 'h5' };

function appendRuns(parent, runs) {
  for (const run of runs) {
    if (!run.text) continue;
    let node = document.createTextNode(run.text);
    if (run.italic) {
      const em = document.createElement('em');
      em.append(node);
      node = em;
    }
    if (run.bold) {
      const strong = document.createElement('strong');
      strong.append(node);
      node = strong;
    }
    if (run.href) {
      const a = document.createElement('a');
      a.href = run.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.append(node);
      node = a;
    }
    parent.append(node);
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * @param {HTMLElement} container  cleared and filled with the rendered document
 * @param {{ title: string, blocks: object[] }} model  from documentToModel()
 */
export function renderDocument(container, model) {
  container.replaceChildren();
  container.setAttribute('aria-busy', 'false');
  container.append(el('p', 'doc-title', model.title));

  if (!model.blocks.length) {
    container.append(el('p', 'muted', 'This document has no text yet.'));
    return;
  }

  for (const block of model.blocks) {
    if (block.kind === 'heading') {
      const heading = el(HEADING_TAG[block.level] || 'h5', 'doc-heading');
      appendRuns(heading, block.runs);
      container.append(heading);
    } else if (block.kind === 'paragraph') {
      const p = el('p', 'doc-p');
      appendRuns(p, block.runs);
      container.append(p);
    } else if (block.kind === 'list') {
      const list = el('div', 'doc-list');
      list.setAttribute('role', 'list');
      for (const item of block.items) {
        const row = el('div', 'doc-item' + (item.checked ? ' done' : ''));
        row.setAttribute('role', 'listitem');
        row.style.marginLeft = Math.min(item.level, 6) * 1.25 + 'rem';
        const marker = el('span', 'doc-marker', item.marker);
        marker.setAttribute('aria-hidden', 'true');
        const body = el('span', 'doc-item-text');
        appendRuns(body, item.runs);
        row.append(marker, body);
        list.append(row);
      }
      container.append(list);
    } else if (block.kind === 'table') {
      const wrap = el('div', 'doc-table-wrap');
      wrap.tabIndex = 0;
      const table = el('table', 'doc-table');
      for (const row of block.rows) {
        const tr = document.createElement('tr');
        for (const cell of row) tr.append(el('td', '', cell));
        table.append(tr);
      }
      wrap.append(table);
      container.append(wrap);
    } else if (block.kind === 'rule') {
      container.append(document.createElement('hr'));
    } else if (block.kind === 'note') {
      container.append(el('p', 'muted', block.text));
    }
  }
}
