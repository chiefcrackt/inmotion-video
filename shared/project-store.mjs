import { KEY, validateBackup } from '../content-planner/model.mjs?v=9edeb93b';
import { stamp } from './project-sync.mjs?v=c640d9a8';
export { KEY };
export const DEVICE_KEY = 'tim-content-device-v1';
export const UNREADABLE_KEY = 'tim-content-planner-unreadable-v1';

// Browser storage can be blocked (private modes, site settings) or full. Every
// read and write goes through these helpers so callers get a clear message
// instead of a raw DOMException or SyntaxError.
const BLOCKED =
  'This browser blocks saved data, so plans cannot be kept here.';
const FULL =
  'This browser’s storage is full, so the change was not saved.';

function getItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    throw Error(BLOCKED);
  }
}
function setItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    throw Error(e?.name === 'QuotaExceededError' ? FULL : BLOCKED);
  }
}

// Parse saved plans. Unreadable data is copied aside once (never overwritten),
// and the error stops callers from saving over it.
function parse(raw) {
  try {
    return validateBackup(JSON.parse(raw));
  } catch {
    try {
      if (!localStorage.getItem(UNREADABLE_KEY))
        localStorage.setItem(UNREADABLE_KEY, raw);
    } catch {}
    throw Error(
      'Saved plans could not be read. A raw copy was kept; import a valid backup before making changes.',
    );
  }
}

let memoryDeviceId;
export function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked: keep one id for this page so edits still stamp consistently.
    return (memoryDeviceId ||= crypto.randomUUID());
  }
}
export function readProjects() {
  const raw = getItem(KEY);
  return raw ? parse(raw) : [];
}
export function saveProjects(projects, expected) {
  const raw = getItem(KEY);
  if (expected !== undefined && raw !== expected)
    throw Error(
      'Plans changed in another tab. Reload before editing.',
    );
  const previous = raw ? parse(raw) : [];
  stamp(previous, projects, deviceId());
  const serialized = JSON.stringify({ version: 1, projects });
  setItem(KEY, serialized);
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
