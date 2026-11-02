// Unit tests for the read-only Google Docs viewer parsing (idea-vault/docs-core.mjs).
// Run: node --test tests/docs-viewer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  documentRequestUrl,
  safeLinkUrl,
  classifyDocsResponse,
  documentToModel,
  DRIVE_FILE_SCOPE,
} from '../idea-vault/docs-core.mjs';

// Helpers that build Docs API-shaped JSON.
const text = (content, style = {}) => ({
  textRun: { content, textStyle: style },
});
const para = (elements, paragraphStyle, bullet) => ({
  paragraph: {
    elements,
    ...(paragraphStyle
      ? { paragraphStyle: { namedStyleType: paragraphStyle } }
      : {}),
    ...(bullet ? { bullet } : {}),
  },
});
const doc = (content, lists = {}, title = 'Race plan') => ({
  title,
  body: { content },
  lists,
});
const bulletList = {
  listProperties: {
    nestingLevels: [{ glyphSymbol: '●' }, { glyphSymbol: '○' }],
  },
};
const numberedList = {
  listProperties: {
    nestingLevels: [{ glyphType: 'DECIMAL' }, { glyphType: 'ALPHA' }],
  },
};
const checkList = { listProperties: { nestingLevels: [{ glyphSymbol: '☐' }] } };
const checkedList = {
  listProperties: { nestingLevels: [{ glyphSymbol: '☑' }] },
};

// ---- Request and link safety -----------------------------------------------

test('documentRequestUrl builds a GET URL for a valid id and rejects unsafe ids', () => {
  assert.equal(
    documentRequestUrl('abc_DEF-123'),
    'https://docs.googleapis.com/v1/documents/abc_DEF-123',
  );
  assert.throws(() => documentRequestUrl('../etc'), /Invalid Google Doc id/);
  assert.throws(() => documentRequestUrl(''), /Invalid Google Doc id/);
  assert.throws(() => documentRequestUrl(undefined), /Invalid Google Doc id/);
});

test('the only OAuth scope used for reading is drive.file (no broad Docs or Drive read)', () => {
  assert.equal(DRIVE_FILE_SCOPE, 'https://www.googleapis.com/auth/drive.file');
});

test('safeLinkUrl keeps only http(s) links', () => {
  assert.equal(safeLinkUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeLinkUrl('http://example.com'), 'http://example.com/');
  assert.equal(safeLinkUrl('javascript:alert(1)'), null);
  assert.equal(safeLinkUrl('data:text/html,hi'), null);
  assert.equal(safeLinkUrl('not a url'), null);
  assert.equal(safeLinkUrl(undefined), null);
});

// ---- Error classification ---------------------------------------------------

test('classifyDocsResponse maps statuses to user-facing error kinds', () => {
  assert.equal(classifyDocsResponse(200).kind, 'ok');
  assert.equal(classifyDocsResponse(401).kind, 'expired');
  assert.equal(classifyDocsResponse(403).kind, 'forbidden');
  assert.equal(classifyDocsResponse(404).kind, 'notfound');
  assert.equal(classifyDocsResponse(429).kind, 'ratelimited');
  assert.equal(classifyDocsResponse(503).kind, 'server');
  assert.equal(classifyDocsResponse(418).kind, 'other');
});

test('expired and permission errors tell the user what to do next', () => {
  assert.match(classifyDocsResponse(401).message, /Refresh document/);
  assert.match(classifyDocsResponse(403).message, /picker/);
  assert.match(classifyDocsResponse(404).message, /picker/);
});

// ---- Structure ----------------------------------------------------------------

test('headings and title style map to heading blocks with the right level', () => {
  const model = documentToModel(
    doc([
      para([text('Race plan\n')], 'TITLE'),
      para([text('Week one\n')], 'HEADING_1'),
      para([text('Long run\n')], 'HEADING_3'),
    ]),
  );
  assert.equal(model.title, 'Race plan');
  assert.deepEqual(
    model.blocks.map((b) => [b.kind, b.level]),
    [
      ['heading', 1],
      ['heading', 1],
      ['heading', 3],
    ],
  );
  assert.equal(model.blocks[1].runs[0].text, 'Week one');
});

test('normal paragraphs keep their text and inline bold/italic', () => {
  const model = documentToModel(
    doc([
      para([
        text('Plain '),
        text('bold', { bold: true }),
        text(' and '),
        text('slanted', { italic: true }),
        text('\n'),
      ]),
    ]),
  );
  const [block] = model.blocks;
  assert.equal(block.kind, 'paragraph');
  assert.deepEqual(
    block.runs.map((r) => [r.text, r.bold, r.italic]),
    [
      ['Plain ', false, false],
      ['bold', true, false],
      [' and ', false, false],
      ['slanted', false, true],
    ],
  );
});

test('empty paragraphs are skipped, not rendered as blank lines', () => {
  const model = documentToModel(
    doc([
      para([text('\n')]),
      para([text('Only this\n')]),
      para([text('   \n')]),
    ]),
  );
  assert.deepEqual(
    model.blocks.map((b) => b.runs[0].text),
    ['Only this'],
  );
});

test('bullets group into one list with bullet markers', () => {
  const model = documentToModel(
    doc(
      [
        para([text('Gels\n')], null, { listId: 'L1', nestingLevel: 0 }),
        para([text('Water\n')], null, { listId: 'L1', nestingLevel: 0 }),
      ],
      { L1: bulletList },
    ),
  );
  assert.equal(model.blocks.length, 1);
  assert.equal(model.blocks[0].kind, 'list');
  assert.deepEqual(
    model.blocks[0].items.map((i) => [i.marker, i.runs[0].text]),
    [
      ['•', 'Gels'],
      ['•', 'Water'],
    ],
  );
});

test('numbered lists count per level and restart after a deeper level closes', () => {
  const model = documentToModel(
    doc(
      [
        para([text('First\n')], null, { listId: 'N', nestingLevel: 0 }),
        para([text('Sub a\n')], null, { listId: 'N', nestingLevel: 1 }),
        para([text('Sub b\n')], null, { listId: 'N', nestingLevel: 1 }),
        para([text('Second\n')], null, { listId: 'N', nestingLevel: 0 }),
        para([text('Sub c\n')], null, { listId: 'N', nestingLevel: 1 }),
      ],
      { N: numberedList },
    ),
  );
  const items = model.blocks[0].items;
  assert.deepEqual(
    items.map((i) => [i.level, i.marker]),
    [
      [0, '1.'],
      [1, 'a.'],
      [1, 'b.'],
      [0, '2.'],
      [1, 'a.'],
    ],
  );
});

test('roman-numeral lists are numbered in roman numerals', () => {
  const roman = { listProperties: { nestingLevels: [{ glyphType: 'ROMAN' }] } };
  const model = documentToModel(
    doc(
      [
        para([text('One\n')], null, { listId: 'R', nestingLevel: 0 }),
        para([text('Four\n')], null, { listId: 'R', nestingLevel: 0 }),
        para([text('Nine\n')], null, { listId: 'R', nestingLevel: 0 }),
      ],
      { R: roman },
    ),
  );
  assert.deepEqual(
    model.blocks[0].items.map((i) => i.marker),
    ['i.', 'ii.', 'iii.'],
  );
});

test('checklists show open and checked boxes', () => {
  const model = documentToModel(
    doc(
      [
        para([text('Pack gels\n')], null, { listId: 'C', nestingLevel: 0 }),
        para([text('Charge watch\n')], null, { listId: 'D', nestingLevel: 0 }),
      ],
      { C: checkList, D: checkedList },
    ),
  );
  assert.deepEqual(
    model.blocks.map((b) => [b.items[0].marker, b.items[0].checked]),
    [
      ['☐', false],
      ['☑', true],
    ],
  );
});

test('a bullet list followed by a paragraph starts a new block (lists do not swallow text)', () => {
  const model = documentToModel(
    doc(
      [
        para([text('Item\n')], null, { listId: 'L1', nestingLevel: 0 }),
        para([text('After the list\n')]),
        para([text('Another item\n')], null, { listId: 'L1', nestingLevel: 0 }),
      ],
      { L1: bulletList },
    ),
  );
  assert.deepEqual(
    model.blocks.map((b) => b.kind),
    ['list', 'paragraph', 'list'],
  );
});

test('links are kept only when they are safe http(s) links', () => {
  const model = documentToModel(
    doc([
      para([
        text('Good', { link: { url: 'https://example.com' } }),
        text(' bad', { link: { url: 'javascript:alert(1)' } }),
        text('\n'),
      ]),
    ]),
  );
  const [good, bad] = model.blocks[0].runs;
  assert.equal(good.href, 'https://example.com/');
  assert.equal(bad.href, null);
});

test('inline images and footnotes become visible placeholders', () => {
  const model = documentToModel(
    doc([
      para([
        text('See '),
        { inlineObjectElement: { inlineObjectId: 'x' } },
        text(' and '),
        { footnoteReference: {} },
        text('\n'),
      ]),
    ]),
  );
  assert.equal(
    model.blocks[0].runs.map((r) => r.text).join(''),
    'See [image] and [footnote]',
  );
});

test('tables become rows of cell text', () => {
  const cell = (t) => ({ content: [para([text(t + '\n')])] });
  const model = documentToModel(
    doc([
      {
        table: {
          tableRows: [
            { tableCells: [cell('Split'), cell('Pace')] },
            { tableCells: [cell('Mile 1'), cell('8:02')] },
          ],
        },
      },
    ]),
  );
  assert.deepEqual(model.blocks, [
    {
      kind: 'table',
      rows: [
        ['Split', 'Pace'],
        ['Mile 1', '8:02'],
      ],
    },
  ]);
});

test('horizontal rules and tables of contents are represented, section breaks are skipped', () => {
  const model = documentToModel(
    doc([
      para([text('Above\n')]),
      para([{ horizontalRule: {} }]),
      { tableOfContents: {} },
      { sectionBreak: {} },
    ]),
  );
  assert.deepEqual(
    model.blocks.map((b) => b.kind),
    ['paragraph', 'rule', 'note'],
  );
  assert.equal(model.blocks[2].text, '[Table of contents]');
});

test('script-like text is kept as plain data (the renderer never treats it as markup)', () => {
  const model = documentToModel(
    doc([para([text('<script>alert(1)</script>\n')])]),
  );
  assert.equal(model.blocks[0].runs[0].text, '<script>alert(1)</script>');
});

test('an empty document produces no blocks and a fallback title', () => {
  const model = documentToModel({ body: { content: [] } });
  assert.deepEqual(model, { title: 'Untitled document', blocks: [] });
});

test('documentToModel does not mutate its input', () => {
  const input = doc(
    [para([text('Keep\n')], null, { listId: 'L1', nestingLevel: 0 })],
    { L1: bulletList },
  );
  const before = JSON.stringify(input);
  documentToModel(input);
  assert.equal(JSON.stringify(input), before);
});
