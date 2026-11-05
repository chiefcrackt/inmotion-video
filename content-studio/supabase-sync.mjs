import { supabaseUrl, supabaseKey } from './supabase-config.mjs';
import { IDEA_KEY, PLANNER_KEY } from '../shared/pipeline-link.mjs';
import { isWorkspace, mergeIdeas, baseOf } from '../idea-vault/vault-core.mjs';
import { validateBackup } from '../content-planner/model.mjs';
import { mergeProjects, stable } from '../shared/project-sync.mjs';

const panel = document.querySelector('#studio-sync');
const form = panel.querySelector('form');
const status = panel.querySelector('[role="status"]');
const syncButton = panel.querySelector('[data-sync]');
const disconnect = panel.querySelector('[data-disconnect]');
const ownerKey = 'tim-content-studio-supabase-owner';
let clientPromise;
let user;
let running = false;
let connected = false;

function client() {
  if (!clientPromise) {
    clientPromise =
      import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.1/+esm')
        .then(({ createClient }) =>
          createClient(supabaseUrl, supabaseKey, {
            auth: { storageKey: 'tim-content-studio-supabase-session' },
          }),
        )
        .catch((error) => {
          clientPromise = null;
          throw error;
        });
  }
  return clientPromise;
}

function show(message) {
  status.textContent = message;
  form.hidden = !!user;
  syncButton.hidden = !user;
  disconnect.hidden = !user;
  syncButton.disabled = running;
  disconnect.disabled = running;
}

function editing() {
  return [...document.querySelectorAll('#editors iframe')].some((frame) =>
    frame.contentWindow.TimPlanningEditor?.isBusy(),
  );
}

// The open planner treats a write it did not make as another tab's edit and
// stops saving. Tell it the plans were merged so it reloads them instead.
// Idea Vault already reloads on storage events, so it needs no signal.
function notifyPlanner() {
  for (const frame of document.querySelectorAll(
    '#editors iframe[data-editor="planner"]',
  )) {
    try {
      frame.contentWindow?.dispatchEvent(new Event('tim-projects-merged'));
    } catch {}
  }
}

function validate(dataset, payload) {
  if (dataset === 'projects')
    return { version: 1, projects: validateBackup(payload) };
  if (!isWorkspace(payload))
    throw Error(
      'Ideas data could not be read. Export a backup before syncing.',
    );
  return payload;
}

async function syncDataset(sb, dataset, key) {
  const account = user.id;
  const baseKey = 'tim-content-studio-supabase-base:' + account;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: remote, error } = await sb
      .from('content_studio_state')
      .select('payload,revision')
      .eq('user_id', account)
      .eq('dataset', dataset)
      .maybeSingle();
    if (error) throw error;
    if (editing()) return false;
    const raw = localStorage.getItem(key);
    const local = validate(
      dataset,
      raw === null ? { version: 1, [dataset]: [] } : JSON.parse(raw),
    );
    const cloud = remote && validate(dataset, remote.payload);
    const merged = !cloud
      ? local
      : {
          version: 1,
          [dataset]:
            dataset === 'projects'
              ? mergeProjects(local.projects, cloud.projects)
              : mergeIdeas(
                  local.ideas,
                  cloud.ideas,
                  JSON.parse(localStorage.getItem(baseKey) || '{}'),
                ).ideas,
        };
    if (!cloud || stable(merged) !== stable(cloud)) {
      const table = sb.from('content_studio_state');
      if (!remote) {
        const result = await table.insert({
          user_id: account,
          dataset,
          payload: merged,
        });
        if (result.error?.code === '23505') continue;
        if (result.error) throw result.error;
      } else {
        const result = await table
          .update({ payload: merged, revision: remote.revision + 1 })
          .eq('user_id', account)
          .eq('dataset', dataset)
          .eq('revision', remote.revision)
          .select('revision');
        if (result.error) throw result.error;
        if (!result.data.length) continue;
      }
    }
    if (raw !== localStorage.getItem(key) || editing()) return false;
    if (stable(merged) !== stable(local)) {
      if (raw !== null)
        localStorage.setItem(key + ':before-supabase-sync', raw);
      localStorage.setItem(key, JSON.stringify(merged));
      if (dataset === 'projects') notifyPlanner();
    }
    if (dataset === 'ideas')
      localStorage.setItem(baseKey, JSON.stringify(baseOf(merged.ideas)));
    return true;
  }
  throw Error('Another device is syncing. Try again shortly.');
}

async function sync() {
  if (!user || running) return;
  if (editing()) return show('Finish editing or filming to sync.');
  running = true;
  show('Syncing workspace…');
  let message;
  try {
    const sb = await client();
    const owner = localStorage.getItem(ownerKey);
    if (owner && owner !== user.id)
      throw Error('Use the account previously connected to this browser.');
    const { data, error } = await sb
      .from('entitlements')
      .select('product')
      .eq('user_id', user.id)
      .eq('product', 'content-studio')
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw Error('This account has not been granted Content Studio access.');
    localStorage.setItem(ownerKey, user.id);
    const ideas = await syncDataset(sb, 'ideas', IDEA_KEY);
    const projects = ideas && (await syncDataset(sb, 'projects', PLANNER_KEY));
    connected = true;
    window.dispatchEvent(new Event('tim-cloud-ready'));
    const ideaCount =
      JSON.parse(localStorage.getItem(IDEA_KEY) || '{}').ideas?.filter(
        (i) => i && !i.archived,
      ).length || 0;
    const projectCount =
      JSON.parse(localStorage.getItem(PLANNER_KEY) || '{}').projects?.filter(
        (p) => !p.deleted,
      ).length || 0;
    message = projects
      ? ideaCount || projectCount
        ? 'Synced ' +
          ideaCount +
          ' ideas and ' +
          projectCount +
          ' projects · ' +
          new Date().toLocaleTimeString()
        : 'No ideas or projects to sync. Sync first from the browser that has your workspace.'
      : 'Sync will retry shortly.';
  } catch (error) {
    message = 'Cloud sync: ' + error.message;
  } finally {
    running = false;
    show(message);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    const sb = await client();
    const { error } = await sb.auth.signInWithOtp({
      email: new FormData(form).get('email'),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: new URL('./', location.href).href,
      },
    });
    if (error) throw error;
    show('Open the sign-in link in your email on this device.');
  } catch (error) {
    show('Could not send sign-in link: ' + error.message);
  } finally {
    submit.disabled = false;
  }
});
syncButton.addEventListener('click', sync);
disconnect.addEventListener('click', async () => {
  const sb = await client();
  const { error } = await sb.auth.signOut({ scope: 'local' });
  if (error) show(error.message);
});
client()
  .then((sb) => {
    sb.auth.onAuthStateChange((_event, session) => {
      const previous = user?.id;
      user = session?.user;
      if (previous === user?.id && previous) return;
      connected = false;
      if (!user) window.dispatchEvent(new Event('tim-cloud-signed-out'));
      show(
        user
          ? 'Connected to Supabase.'
          : 'Connect your Loadout account to sync this workspace.',
      );
      if (user) setTimeout(sync, 0);
    });
  })
  .catch(() =>
    show('Cloud connection unavailable. Content Studio cannot load until it is back.'),
  );
setInterval(() => {
  if (connected && !document.hidden && navigator.onLine) sync();
}, 15000);
window.addEventListener('online', sync);
