// Pure logic for the read-only Google Docs viewer. No DOM, no fetch.
//
// Security notes:
//  - Output is plain data. The renderer uses textContent only, so document text
//    is never interpreted as HTML.
//  - Only http(s) links are kept.
//  - Nothing here writes to Google. The only request built is a GET.

export const DOCS_API = 'https://docs.googleapis.com/v1/documents/';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const HEADING_LEVELS = {
  TITLE: 1,
  SUBTITLE: 2,
  HEADING_1: 1,
  HEADING_2: 2,
  HEADING_3: 3,
  HEADING_4: 4,
  HEADING_5: 5,
  HEADING_6: 6,
};

export function documentRequestUrl(docId) {
  if (typeof docId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(docId)) {
    throw new Error('Invalid Google Doc id.');
  }
  return DOCS_API + encodeURIComponent(docId);
}

export function safeLinkUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Classify a Docs API HTTP status into a user-facing error kind.
 * Network failures do not reach this function: fetch throws, and the caller
 * maps that to kind 'network'.
 */
export function classifyDocsResponse(status) {
  if (status >= 200 && status < 300) return { kind: 'ok' };
  if (status === 401) {
    return {
      kind: 'expired',
      message:
        'Google authorization expired. Press Refresh document to sign in again.',
    };
  }
  if (status === 403) {
    return {
      kind: 'forbidden',
      message:
        'Google did not grant access to this document. Choose it in the Google picker to allow reading.',
    };
  }
  if (status === 404) {
    return {
      kind: 'notfound',
      message:
        'This document was not found, or access was not granted. Choose it in the Google picker to allow reading.',
    };
  }
  if (status === 429) {
    return {
      kind: 'ratelimited',
      message:
        'Google is limiting requests right now. Try Refresh document in a minute.',
    };
  }
  if (status >= 500) {
    return {
      kind: 'server',
      message:
        'Google Docs is temporarily unavailable. Try Refresh document shortly.',
    };
  }
  return {
    kind: 'other',
    message: 'Google Docs returned an unexpected response (' + status + ').',
  };
}

export function networkErrorMessage() {
  return 'Could not reach Google Docs. Check your connection and press Refresh document.';
}

// Ordered numbering uses numeric glyph types. Checkbox symbols mark checklists.
// The Docs API does not reliably expose checked state, so checked is inferred
// from a checked symbol only, and the rest show as an open box.
function listKind(definition) {
  const symbol = definition?.glyphSymbol || '';
  const type = definition?.glyphType || '';
  const checklist = /[☐☑☒✓✔]/.test(symbol);
  return {
    ordered: !checklist && /DECIMAL|ALPHA|ROMAN/.test(type),
    style: /ALPHA/.test(type)
      ? 'alpha'
      : /ROMAN/.test(type)
        ? 'roman'
        : 'decimal',
    checklist,
    checked: checklist && /[☑☒✓✔]/.test(symbol),
  };
}

function toRoman(n) {
  const table = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let out = '';
  let rest = n;
  for (const [value, glyph] of table) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

// Formats the ordinal of an ordered list item in the list's own style.
function orderedMarker(n, style) {
  if (style === 'alpha' && n <= 26) return String.fromCharCode(96 + n) + '.';
  if (style === 'roman') return toRoman(n) + '.';
  return n + '.';
}

function paragraphRuns(paragraph) {
  return (paragraph.elements || []).map((element) => {
    if (element.textRun) {
      const style = element.textRun.textStyle || {};
      return {
        text: String(element.textRun.content || '').replace(/\u000b/g, '\n'),
        bold: !!style.bold,
        italic: !!style.italic,
        href: safeLinkUrl(style.link?.url),
      };
    }
    if (element.inlineObjectElement)
      return { text: '[image]', bold: false, italic: true, href: null };
    if (element.footnoteReference)
      return { text: '[footnote]', bold: false, italic: true, href: null };
    return { text: '', bold: false, italic: false, href: null };
  });
}

function runsText(runs) {
  return runs.map((run) => run.text).join('');
}

function tableRows(table) {
  return (table.tableRows || []).map((row) =>
    (row.tableCells || []).map((cell) =>
      (cell.content || [])
        .filter((element) => element.paragraph)
        .map((element) =>
          runsText(paragraphRuns(element.paragraph))
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter(Boolean)
        .join(' '),
    ),
  );
}

/**
 * Convert a Docs API `documents.get` response into display blocks.
 *
 * Blocks:
 *   { kind: 'heading', level: 1..6, runs }
 *   { kind: 'paragraph', runs }
 *   { kind: 'list', items: [{ level, marker, runs, checked }] }
 *   { kind: 'table', rows: [[text]] }
 *   { kind: 'rule' }
 *   { kind: 'note', text }
 * A run is { text, bold, italic, href }.
 */
export function documentToModel(doc) {
  const lists = doc?.lists || {};
  const blocks = [];
  const counters = new Map();
  let openList = null;

  for (const element of doc?.body?.content || []) {
    if (element.paragraph) {
      const paragraph = element.paragraph;
      const runs = paragraphRuns(paragraph);

      if (paragraph.elements?.some((e) => e.horizontalRule)) {
        openList = null;
        blocks.push({ kind: 'rule' });
        continue;
      }

      if (paragraph.bullet) {
        const listId = paragraph.bullet.listId;
        const level = paragraph.bullet.nestingLevel || 0;
        const definition =
          lists[listId]?.listProperties?.nestingLevels?.[level] || {};
        const kind = listKind(definition);
        if (!openList || openList.listId !== listId) {
          openList = { kind: 'list', listId, items: [] };
          blocks.push(openList);
        }
        const count = counters.get(listId) || [];
        count.length = level + 1;
        count[level] = (count[level] || 0) + 1;
        counters.set(listId, count);
        const trimmed = trimTrailingNewline(runs);
        openList.items.push({
          level,
          marker: kind.checklist
            ? kind.checked
              ? '☑'
              : '☐'
            : kind.ordered
              ? orderedMarker(count[level], kind.style)
              : '•',
          runs: trimmed,
          checked: kind.checked,
        });
        continue;
      }

      openList = null;
      const style = paragraph.paragraphStyle?.namedStyleType || 'NORMAL_TEXT';
      const text = runsText(runs).trim();
      if (!text) continue;
      const trimmed = trimTrailingNewline(runs);
      if (HEADING_LEVELS[style]) {
        blocks.push({
          kind: 'heading',
          level: HEADING_LEVELS[style],
          runs: trimmed,
        });
      } else {
        blocks.push({ kind: 'paragraph', runs: trimmed });
      }
      continue;
    }

    openList = null;
    if (element.table) {
      blocks.push({ kind: 'table', rows: tableRows(element.table) });
    } else if (element.tableOfContents) {
      blocks.push({ kind: 'note', text: '[Table of contents]' });
    }
    // Section breaks carry no text and are skipped.
  }

  return { title: String(doc?.title || 'Untitled document'), blocks };
}

function trimTrailingNewline(runs) {
  const copy = runs.map((run) => ({ ...run }));
  for (let i = copy.length - 1; i >= 0; i--) {
    copy[i].text = copy[i].text.replace(/\n+$/, '');
    if (copy[i].text) break;
  }
  return copy.filter((run) => run.text.length > 0);
}
