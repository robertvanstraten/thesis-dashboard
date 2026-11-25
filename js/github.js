// Dunne laag over de GitHub REST API (contents + commits). Het token staat alleen in localStorage
// van dit apparaat en wordt alleen naar api.github.com gestuurd.
import { CONFIG } from './config.js';

const LS_TOKEN = 'dash.token';

// Alleen bij lokaal testen mag een andere API-basis (mock-server); nooit op de echte site,
// anders zou een link met een andere API je token kunnen weglekken.
export function apiBase() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const override = localStorage.getItem('dash.api');
  return local && override ? override.replace(/\/$/, '') : 'https://api.github.com';
}

export const token = {
  get: () => localStorage.getItem(LS_TOKEN) || '',
  set: (t) => localStorage.setItem(LS_TOKEN, t.trim()),
  clear: () => localStorage.removeItem(LS_TOKEN),
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function req(method, path, body, accept) {
  let r;
  try {
    r = await fetch(apiBase() + path, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token.get()}`,
        Accept: accept || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError(0, 'Geen verbinding');
  }
  if (!r.ok) {
    let msg = r.statusText;
    try {
      msg = (await r.json()).message || msg;
    } catch {
      /* geen json */
    }
    throw new ApiError(r.status, msg);
  }
  return accept && accept.includes('raw') ? r.text() : r.json();
}

const repoPath = () => `/repos/${CONFIG.owner}/${CONFIG.repo}`;
const contentsPath = (p) => `${repoPath()}/contents/${p.split('/').map(encodeURIComponent).join('/')}`;

export function b64decode(s) {
  const bin = atob(s.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const checkAccess = () => req('GET', repoPath());

// -> { data, sha }  (data = null als het bestand nog niet bestaat)
export async function getFile(path) {
  const url = `${contentsPath(path)}?ref=${encodeURIComponent(CONFIG.branch)}`;
  try {
    const j = await req('GET', url);
    const text = j.encoding === 'base64' && j.content ? b64decode(j.content) : await req('GET', url, null, 'application/vnd.github.raw+json');
    return { data: JSON.parse(text), sha: j.sha };
  } catch (e) {
    if (e.status === 404) return { data: null, sha: null };
    throw e;
  }
}

// -> nieuwe sha. Gooit ApiError 409/422 bij een conflict (iemand/iets anders schreef ertussen).
export async function putFile(path, data, sha, message) {
  const body = { message, content: b64encode(JSON.stringify(data, null, 1) + '\n'), branch: CONFIG.branch };
  if (sha) body.sha = sha;
  const j = await req('PUT', contentsPath(path), body);
  return j.content.sha;
}

export const listCommits = (n = 30) => req('GET', `${repoPath()}/commits?sha=${encodeURIComponent(CONFIG.mainBranch)}&per_page=${n}`);

export const repoUrl = () => `https://github.com/${CONFIG.owner}/${CONFIG.repo}`;
