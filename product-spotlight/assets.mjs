// Original product-video overlays. Wording lives in separate editable text layers.
import { colors, svg as renderSVG } from '../motion-stats/assets.mjs';
export { colors };
const layer = (id, body) => ({ id, body, motion: 'none', origin: null });
const text = (value, x, y, width, fontSize = 40, color = '#f6f4ef') => ({
  value,
  x,
  y,
  width,
  fontSize,
  color,
});
const asset = (id, name, category, width, height, layers, texts, hint) => ({
  id,
  name,
  category,
  width,
  height,
  layers,
  texts,
  hint,
});
export const assets = [
  asset(
    'product-name',
    'Product nameplate',
    'product',
    720,
    200,
    [
      layer(
        'panel',
        '<rect x="24" y="24" width="672" height="152" rx="20" fill="N" stroke="G" stroke-width="7"/>',
      ),
      layer(
        'accent',
        '<path d="M25 52h25v96H25z" fill="T"/><path d="M80 150h560" stroke="T" stroke-width="5"/>',
      ),
    ],
    [text('PRODUCT NAME', 370, 92, 530, 48)],
    'Name the item while your footage shows it. Add a model or size if useful.',
  ),
  asset(
    'product-tag',
    'Compact product tag',
    'product',
    560,
    160,
    [
      layer(
        'panel',
        '<path d="M26 26h454l54 54-54 54H26z" fill="N" stroke="G" stroke-width="7"/>',
      ),
      layer(
        'accent',
        '<path d="M477 50l30 30-30 30" stroke="T" stroke-width="10"/>',
      ),
    ],
    [text('PRODUCT NAME', 256, 80, 390, 40)],
    'A short label for quick demonstrations, unboxings and gear close-ups.',
  ),
  asset(
    'product-two-line',
    'Name + detail',
    'product',
    720,
    260,
    [
      layer(
        'panel',
        '<rect x="24" y="24" width="672" height="212" rx="22" fill="N" stroke="G" stroke-width="7"/>',
      ),
      layer('divider', '<path d="M64 145h592" stroke="T" stroke-width="5"/>'),
      layer(
        'corner',
        '<path d="M45 72V45h65m565 142v27h-65" stroke="T" stroke-width="8"/>',
      ),
    ],
    [
      text('PRODUCT NAME', 360, 96, 560, 46),
      text('Model / size / colour', 360, 184, 560, 31, '#e8c96a'),
    ],
    'Keep the name and its specific variant on separate editable lines.',
  ),
  asset(
    'product-badge',
    'Product badge',
    'product',
    720,
    220,
    [
      layer(
        'panel',
        '<path d="M110 35h555l30 75-30 75H110z" fill="N" stroke="G" stroke-width="7"/>',
      ),
      layer(
        'disc',
        '<circle cx="92" cy="110" r="68" fill="T" stroke="G" stroke-width="7"/><circle cx="92" cy="110" r="46" stroke="N" stroke-width="5"/>',
      ),
    ],
    [text('PRODUCT NAME', 420, 110, 460, 44)],
    'Use the disc as a visual marker or place an icon over it.',
  ),
  asset(
    'product-focus',
    'Product focus frame',
    'product',
    720,
    440,
    [
      layer(
        'brackets',
        '<path d="M125 30H32v238h93m470-238h93v238h-93" stroke="G" stroke-width="11"/>',
      ),
      layer(
        'ticks',
        '<path d="M58 92v114m604-114v114" stroke="T" stroke-width="7"/>',
      ),
      layer(
        'label',
        '<rect x="56" y="312" width="608" height="104" rx="18" fill="N" stroke="G" stroke-width="6"/>',
      ),
    ],
    [text('PRODUCT NAME', 360, 364, 530, 40)],
    'Leave the open centre over your actual product footage, with the name beneath it.',
  ),
  asset(
    'product-halo',
    'Product spotlight halo',
    'product',
    480,
    560,
    [
      layer(
        'halo',
        '<ellipse cx="240" cy="220" rx="184" ry="180" stroke="G" stroke-width="9"/>',
      ),
      layer(
        'accent-ring',
        '<path d="M240 60a164 160 0 0 1 164 160" stroke="T" stroke-width="14"/>',
      ),
      layer(
        'label',
        '<rect x="34" y="438" width="412" height="96" rx="18" fill="N" stroke="G" stroke-width="6"/>',
      ),
    ],
    [text('PRODUCT NAME', 240, 486, 350, 32)],
    'Frame a product in your footage. The centre stays transparent.',
  ),

  asset(
    'feature-left',
    'Feature callout · left',
    'features',
    720,
    260,
    [
      layer(
        'panel',
        '<rect x="24" y="30" width="462" height="180" rx="20" fill="N" stroke="G" stroke-width="7"/>',
      ),
      layer(
        'leader',
        '<path d="M486 120h160l35 55" stroke="T" stroke-width="9"/>',
      ),
      layer(
        'point',
        '<circle cx="681" cy="175" r="15" fill="G" stroke="N" stroke-width="5"/>',
      ),
    ],
    [text('FEATURE / DETAIL', 255, 120, 390, 35)],
    'Place the dot on the detail you are showing and explain it in your own words.',
  ),
  asset(
    'feature-right',
    'Feature callout · right',
    'features',
    720,
    260,
    [
      layer(
        'panel',
        '<rect x="234" y="30" width="462" height="180" rx="20" fill="N" stroke="G" stroke-width="7"/>',
      ),
      layer(
        'leader',
        '<path d="M234 120H74l-35 55" stroke="T" stroke-width="9"/>',
      ),
      layer(
        'point',
        '<circle cx="39" cy="175" r="15" fill="G" stroke="N" stroke-width="5"/>',
      ),
    ],
    [text('FEATURE / DETAIL', 465, 120, 390, 35)],
    'A mirrored callout for details on the other side of your shot.',
  ),
  asset(
    'feature-pin',
    'Feature pin',
    'features',
    640,
    360,
    [
      layer(
        'panel',
        '<rect x="202" y="26" width="412" height="150" rx="20" fill="N" stroke="G" stroke-width="7"/>',
      ),
      layer(
        'leader',
        '<path d="M204 142L64 286" stroke="T" stroke-width="9"/>',
      ),
      layer(
        'point',
        '<circle cx="64" cy="286" r="31" fill="G" stroke="N" stroke-width="7"/><circle cx="64" cy="286" r="10" fill="T"/>',
      ),
    ],
    [text('LOOK HERE', 408, 101, 350, 37)],
    'Point out a button, strap, material, opening or other visible feature.',
  ),
  asset(
    'detail-ring',
    'Detail ring',
    'features',
    600,
    480,
    [
      layer(
        'ring',
        '<circle cx="228" cy="184" r="142" stroke="G" stroke-width="10"/><path d="M228 64a120 120 0 0 1 120 120" stroke="T" stroke-width="11"/>',
      ),
      layer(
        'handle',
        '<path d="M333 289l136 94" stroke="T" stroke-width="18"/>',
      ),
      layer(
        'label',
        '<rect x="72" y="358" width="456" height="96" rx="18" fill="N" stroke="G" stroke-width="6"/>',
      ),
    ],
    [text('DETAIL CLOSE-UP', 300, 406, 390, 34)],
    'Highlight a close-up without covering the feature itself.',
  ),
  asset(
    'feature-stack',
    'Three feature notes',
    'features',
    720,
    460,
    [
      ...[0, 1, 2].map((i) =>
        layer(
          'note-' + (i + 1),
          `<rect x="92" y="${24 + i * 145}" width="600" height="120" rx="18" fill="N" stroke="${i === 1 ? 'T' : 'G'}" stroke-width="6"/><circle cx="60" cy="${84 + i * 145}" r="27" fill="${i === 1 ? 'G' : 'T'}" stroke="N" stroke-width="5"/>`,
        ),
      ),
    ],
    [
      text('FEATURE 01', 392, 84, 510, 36),
      text('FEATURE 02', 392, 229, 510, 36),
      text('FEATURE 03', 392, 374, 510, 36),
    ],
    'Use three short, specific observations. Each row can move independently.',
  ),
  asset(
    'feature-highlight',
    'Feature highlight',
    'features',
    720,
    180,
    [
      layer(
        'panel',
        '<rect x="26" y="28" width="668" height="124" rx="16" fill="N" stroke="G" stroke-width="6"/>',
      ),
      layer('underline', '<path d="M62 132h596" stroke="T" stroke-width="8"/>'),
    ],
    [text('ONE THING TO KNOW', 360, 84, 570, 39)],
    'Give one visible feature or practical detail its own moment.',
  ),

  asset(
    'why-use',
    'Why I use it',
    'experience',
    720,
    340,
    [
      layer(
        'panel',
        '<rect x="24" y="24" width="672" height="292" rx="24" fill="N" stroke="G" stroke-width="7"/>',
      ),
      layer('divider', '<path d="M68 128h584" stroke="T" stroke-width="6"/>'),
      layer(
        'accent',
        '<path d="M45 70V45h58m572 225v25h-58" stroke="T" stroke-width="8"/>',
      ),
    ],
    [
      text('WHY I USE IT', 360, 86, 580, 38, '#e8c96a'),
      text('Add your own reason', 360, 212, 560, 40),
    ],
    'Share your actual reason for using the product, with room for a concise explanation.',
  ),
  asset(
    'routine-note',
    'In my routine',
    'experience',
    720,
    300,
    [
      layer(
        'panel',
        '<rect x="24" y="24" width="672" height="252" rx="22" fill="N" stroke="G" stroke-width="7"/>',
      ),
      layer('stripe', '<path d="M25 56h24v188H25z" fill="T"/>'),
      layer('divider', '<path d="M78 124h566" stroke="T" stroke-width="5"/>'),
    ],
    [
      text('IN MY ROUTINE', 370, 82, 550, 36, '#e8c96a'),
      text('When / where I use it', 370, 194, 540, 38),
    ],
    'Explain when or where the item fits into your own routine.',
  ),
  asset(
    'field-note',
    'What I noticed',
    'experience',
    720,
    340,
    [
      layer(
        'panel',
        '<path d="M24 24h672v234H212l-68 56v-56H24z" fill="N" stroke="G" stroke-width="7"/>',
      ),
      layer('divider', '<path d="M68 126h584" stroke="T" stroke-width="5"/>'),
    ],
    [
      text('WHAT I NOTICED', 360, 82, 580, 37, '#e8c96a'),
      text('Add your own experience', 360, 190, 560, 36),
    ],
    'Use a firsthand observation from your demonstration or time with the item.',
  ),
  asset(
    'tradeoff',
    'Pros + trade-off',
    'experience',
    720,
    420,
    [
      layer(
        'top-card',
        '<rect x="24" y="24" width="672" height="170" rx="18" fill="N" stroke="G" stroke-width="6"/>',
      ),
      layer(
        'bottom-card',
        '<rect x="24" y="226" width="672" height="170" rx="18" fill="N" stroke="T" stroke-width="6"/>',
      ),
    ],
    [
      text('WORKS FOR ME', 360, 68, 570, 31, '#e8c96a'),
      text('Add a specific benefit', 360, 134, 570, 32),
      text('WORTH CONSIDERING', 360, 270, 570, 31, '#2e9bad'),
      text('Add a practical trade-off', 360, 336, 570, 32),
    ],
    'Give a balanced account of what suits you and what someone else should consider.',
  ),
  asset(
    'my-take',
    'My take',
    'experience',
    720,
    240,
    [
      layer(
        'panel',
        '<path d="M24 34h620l50 86-50 86H24z" fill="N" stroke="G" stroke-width="7"/>',
      ),
      layer('divider', '<path d="M207 60v120" stroke="T" stroke-width="6"/>'),
    ],
    [
      text('MY TAKE', 116, 120, 145, 30, '#e8c96a'),
      text('Your short verdict', 420, 120, 365, 36),
    ],
    'Close with your own concise view, rather than an automatic rating or sales claim.',
  ),
  asset(
    'affiliate-label',
    'Affiliate link label',
    'experience',
    720,
    140,
    [
      layer(
        'panel',
        '<rect x="24" y="24" width="672" height="92" rx="18" fill="N" stroke="G" stroke-width="5"/>',
      ),
      layer(
        'link-mark',
        '<path d="M95 57l13-13a17 17 0 0 1 24 24l-13 13m-13-13L93 81a17 17 0 0 1-24-24l13-13m5 25l26-26" stroke="T" stroke-width="6"/>',
      ),
    ],
    [text('Affiliate link', 405, 70, 480, 34)],
    'An optional plain-language label you can place alongside your own disclosure and call to action.',
  ),
];
export const svg = (item, options = {}) => renderSVG(item, options);
