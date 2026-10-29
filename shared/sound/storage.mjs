import { preset } from './model.mjs';
let database;
function db() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const r = indexedDB.open('tim-sound-library', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('presets', { keyPath: 'id' });
        r.result.createObjectStore('assets', { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () =>
        reject(
          Error(
            'Local sound storage is unavailable. Export your work to keep a copy.',
          ),
        );
    });
  return database;
}
async function request(store, method, value) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(
        store,
        method === 'get' || method === 'getAll' ? 'readonly' : 'readwrite',
      ),
      r = t.objectStore(store)[method](value);
    let result;
    r.onsuccess = () => (result = r.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () =>
      reject(
        Error(
          'Could not save locally: storage may be full or blocked. Your current editor is still intact; export a project package.',
        ),
      );
    t.onabort = t.onerror;
  });
}
export const listPresets = async () =>
  (await request('presets', 'getAll')).map(preset);
export const savePreset = (p) => request('presets', 'put', preset(p));
export const deletePreset = (id) => request('presets', 'delete', id);
export const getAsset = (id) => request('assets', 'get', id);
export async function putAsset(
  file,
  id = crypto.randomUUID?.() || `asset-${Date.now()}-${Math.random()}`,
) {
  await request('assets', 'put', {
    id,
    name: file.name,
    type: file.type,
    data: await file.arrayBuffer(),
  });
  return id;
}
export function assetResolver(ctx, memory = new Map()) {
  const decoded = new Map();
  return async (id) => {
    if (decoded.has(id)) return decoded.get(id);
    const a = memory.get(id) || (await getAsset(id));
    if (!a) return null;
    let b;
    try {
      b = await ctx.decodeAudioData(a.data.slice(0));
    } catch {
      throw Error(
        `Could not decode “${a.name}”. Try a PCM WAV or a supported MP3 file.`,
      );
    }
    if (decoded.size >= 4) decoded.delete(decoded.keys().next().value);
    decoded.set(id, b);
    return b;
  };
}
const base64 = (buffer) => {
  let s = '';
  const d = new Uint8Array(buffer);
  for (let i = 0; i < d.length; i += 16384)
    s += String.fromCharCode(...d.subarray(i, i + 16384));
  return btoa(s);
};
export async function packageProject(p, memory = new Map()) {
  const assets = [];
  for (const id of new Set(
    p.layers.filter((l) => l.source === 'sample').map((l) => l.assetId),
  )) {
    const a = memory.get(id) || (await getAsset(id));
    if (!a)
      throw Error(
        'A sample is missing. Relink it before exporting a portable project.',
      );
    assets.push({ id, name: a.name, type: a.type, data: base64(a.data) });
  }
  return { format: 'tim-sound-project', version: 1, preset: preset(p), assets };
}
export function unpackProject(obj) {
  if (
    obj.format !== 'tim-sound-project' ||
    obj.version !== 1 ||
    !Array.isArray(obj.assets) ||
    obj.assets.length > 4
  )
    throw Error('Invalid SOUND FORGE project package.');
  const p = preset(obj.preset),
    assets = obj.assets.map((a) => {
      if (typeof a.data !== 'string' || a.data.length > 40e6)
        throw Error('Invalid or oversized project audio asset.');
      const s = atob(a.data);
      return {
        id: String(a.id),
        name: String(a.name),
        type: String(a.type),
        data: Uint8Array.from(s, (c) => c.charCodeAt(0)).buffer,
      };
    });
  return { preset: p, assets };
}
export const saveAssetRecord = (a) => request('assets', 'put', a);
