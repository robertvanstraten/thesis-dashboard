// Kleine hulpfuncties: escapen, datums (lokale tijd, Nederlands), ids.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Alleen http(s)-links doorlaten (titels/urls komen deels van externe API's).
export function safeUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
  } catch {
    return null;
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

const pad = (n) => String(n).padStart(2, '0');
export function localIso(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export const ymd = (d = new Date()) => localIso(d).slice(0, 10);

// 'YYYY-MM-DD' of 'YYYY-MM-DDTHH:MM:SS' (lokale tijd). Strings met Z/offset gaan via Date.
export function parseLocal(s) {
  if (!s) return null;
  if (/[zZ]|[+-]\d\d:\d\d$/.test(s)) return new Date(s);
  const [date, time = '00:00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss] = time.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
}

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 864e5);

const F = {
  long: new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }),
  short: new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }),
  date: new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }),
  dm: new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' }),
  time: new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }),
};
export const fmt = {
  long: (d) => (d ? F.long.format(d) : ''),
  short: (d) => (d ? F.short.format(d) : ''),
  date: (d) => (d ? F.date.format(d) : ''),
  dm: (d) => (d ? F.dm.format(d) : ''),
  time: (d) => (d ? F.time.format(d) : ''),
};

export function relDay(d, now = new Date()) {
  const n = dayDiff(d, now);
  if (n === 0) return 'vandaag';
  if (n === 1) return 'morgen';
  if (n === -1) return 'gisteren';
  return n > 0 ? `over ${n} dagen` : `${-n} dagen geleden`;
}

export function ago(d, now = new Date()) {
  if (!d) return '';
  const min = Math.round((now - d) / 6e4);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  if (min < 60 * 24 && dayDiff(now, d) === 0) return `${Math.round(min / 60)} uur geleden`;
  const days = dayDiff(now, d);
  if (days === 1) return 'gisteren';
  if (days < 7) return `${days} dagen geleden`;
  return fmt.date(d);
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function authorsShort(list = [], n = 3) {
  if (!list.length) return '';
  return list.length > n ? `${list.slice(0, n).join(', ')} e.a.` : list.join(', ');
}

// Deterministische 'random' per dag (micro-taken wisselen dagelijks, niet bij elke render).
export function seeded(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
