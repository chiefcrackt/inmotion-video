// Organize the existing editor without changing the saved project format.
export function organizeEditor() {
  const inspector = document.querySelector('.inspector');
  function group(title, nodes, open = false) {
    const details = document.createElement('details');
    details.className = 'controlGroup';
    details.open = open;
    const summary = document.createElement('summary');
    summary.textContent = title;
    details.append(summary);
    nodes[0].before(details);
    nodes.forEach((node) => details.append(node));
    return details;
  }
  const position = inspector.querySelector('.positionPanel');
  group('Move template text', [position]);
  const elements = inspector.querySelector('.elementPanel');
  group('Elements, layers & brand kit', [elements]);
  const photo = document.getElementById('photoControls');
  group('Photo framing & effects', [photo]);
  group('Text size & fit', [document.getElementById('textSizeControls')]);
  const style = inspector.querySelector('.tag').parentElement;
  const styleNodes = [];
  for (
    let node = style;
    node && node.id !== 'delete';
    node = node.nextElementSibling
  ) {
    if (node.classList.contains('controlGroup')) break;
    styleNodes.push(node);
  }
  group('Carousel style · all slides', styleNodes);
  // Keep text entry first; advanced controls follow the everyday workflow.
  document
    .getElementById('delete')
    .before(position.closest('details'), elements.closest('details'));
  document
    .getElementById('elementOverlay')
    .addEventListener('click', (event) => {
      if (event.target.closest('.elementHit'))
        elements.closest('details').open = true;
    });
  const rows = document.querySelectorAll('.editorBar > .actionRow');
  group('Save, open & import projects', [rows[1]]);
  document.getElementById('photo').addEventListener('change', () => {
    if (document.getElementById('photo').files.length)
      photo.closest('details').open = true;
  });
  document.querySelectorAll('[data-add]').forEach((button) => {
    button.addEventListener(
      'click',
      () => (elements.closest('details').open = true),
    );
  });
}
