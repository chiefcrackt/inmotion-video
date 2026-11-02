import { KEY, validateBackup } from '../content-planner/model.mjs';
import { stamp } from './project-sync.mjs';
export { KEY };
export const DEVICE_KEY = 'tim-content-device-v1';
export function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
export function readProjects() {
  const raw = localStorage.getItem(KEY);
  return raw ? validateBackup(JSON.parse(raw)) : [];
}
export function saveProjects(projects, expected) {
  const raw = localStorage.getItem(KEY);
  if (expected !== undefined && raw !== expected)
    throw Error(
      'Plans changed in another tab. Reload before editing; export your work to keep it.',
    );
  const previous = raw ? validateBackup(JSON.parse(raw)) : [];
  stamp(previous, projects, deviceId());
  const serialized = JSON.stringify({ version: 1, projects });
  localStorage.setItem(KEY, serialized);
  window.dispatchEvent(new Event('tim-projects-changed'));
  return serialized;
}
export function updateProject(id, fn) {
  const projects = readProjects(),
    p = projects.find((p) => p.id === id && !p.deleted);
  if (!p) throw Error('This video project is unavailable.');
  fn(p);
  saveProjects(projects);
  return p;
}
export function applyMerged(projects) {
  const raw = JSON.stringify({ version: 1, projects });
  if (raw === localStorage.getItem(KEY)) return;
  const previous = localStorage.getItem(KEY);
  if (previous) localStorage.setItem('tim-content-before-sync-v1', previous);
  localStorage.setItem(KEY, raw);
  window.dispatchEvent(new Event('tim-projects-merged'));
}
