import * as drive from './project-drive.mjs';
export function mountDriveControls(host) {
  const box = document.createElement('div');
  box.className = 'tim-drive-controls';
  const label = document.createElement('p');
  label.setAttribute('role', 'status');
  label.setAttribute('aria-live', 'polite');
  const connect = document.createElement('button');
  connect.type = 'button';
  connect.id = 'drive-connect';
  const sync = document.createElement('button');
  sync.type = 'button';
  sync.id = 'drive-sync';
  sync.textContent = 'Sync now';
  const choose = document.createElement('button');
  choose.type = 'button';
  choose.id = 'drive-choose-root';
  choose.textContent = 'Choose parent folder';
  const disconnect = document.createElement('button');
  disconnect.type = 'button';
  disconnect.id = 'drive-disconnect';
  disconnect.textContent = 'Disconnect';
  const root = document.createElement('a');
  root.target = '_blank';
  root.rel = 'noopener';
  box.append(label, connect, sync, choose, disconnect, root);
  host.append(box);
  let busy = false,
    error = '';
  const refresh = () => {
    const s = drive.state();
    label.textContent =
      error ||
      (!s.connected
        ? 'Connect Google Drive to sync plans and save project assets.'
        : (s.email || 'Google Drive') +
          ' · ' +
          (s.sync?.reason ||
            (s.sync?.state === 'syncing'
              ? 'Syncing projects…'
              : s.sync?.state === 'queued'
                ? 'Changes saved; syncing shortly.'
                : s.authorized
                  ? 'Connected' +
                    (s.lastSynced
                      ? ' · Last synced ' +
                        new Date(s.lastSynced).toLocaleTimeString()
                      : '')
                  : 'Account remembered. Reconnect to continue.')));
    connect.textContent = s.connected
      ? 'Reconnect Drive'
      : 'Connect Google Drive';
    connect.hidden = s.authorized;
    sync.hidden = !s.connected;
    disconnect.hidden = !s.connected;
    choose.hidden = !s.connected;
    root.hidden = !s.root?.id;
    if (s.root?.id) {
      root.href = drive.folderLink(s.root.id);
      root.textContent = s.root.name || 'Open studio folder';
    }
    for (const b of [connect, sync, choose, disconnect]) b.disabled = busy;
  };
  const run = (fn) => async () => {
    busy = true;
    error = '';
    refresh();
    try {
      await fn();
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
      refresh();
    }
  };
  connect.onclick = run(async () => {
    await drive.connect();
    const result = await drive.syncNow();
    if (result?.reason) error = result.reason;
  });
  sync.onclick = run(async () => {
    await drive.connect();
    const result = await drive.syncNow();
    if (result?.reason) error = result.reason;
  });
  choose.onclick = run(() => drive.chooseRoot());
  disconnect.onclick = () => {
    drive.disconnect();
    error = '';
    refresh();
  };
  window.addEventListener('tim-drive-state', refresh);
  refresh();
  drive.ready().catch(() => {});
  if (drive.preferences().connected)
    drive.resume().catch((e) => {
      error = e.message;
      refresh();
    });
  return box;
}
