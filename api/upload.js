// Fonction Vercel (Node) : reçoit un fichier depuis /admin et l'enregistre dans le dépôt GitHub.
// Variables d'environnement requises : ADMIN_PASSWORD, GITHUB_TOKEN (fine-grained, Contents: read/write sur ce dépôt).
// Optionnel : GITHUB_REPO (défaut "kameleo333/ballarinb"), GITHUB_BRANCH (défaut "main").

export const config = { api: { bodyParser: false } };

const REPO = process.env.GITHUB_REPO || 'kameleo333/ballarinb';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const MAX = 4 * 1024 * 1024; // 4 Mo (limite Vercel ~4,5 Mo par requête)

const TARGETS = {
  paiements: { path: 'public/docs/paiements.xlsx', ext: ['xlsx'], label: 'Tableau des charges (Excel)' },
  ag:        { path: 'public/docs/ag-derniere.docx', ext: ['docx'], label: 'Dernier compte rendu d’AG (Word)' },
  archive:   { path: null, ext: ['pdf', 'docx'], label: 'Archive d’AG' },
  carnet:    { path: 'public/docs/carnet-entretien.pdf', ext: ['pdf'], label: 'Carnet d’entretien (PDF)' },
  comptes:   { path: 'public/docs/comptes.json', ext: [], label: 'Comptes (recettes, dépenses, frais de bureau)' },
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX) { reject(new Error('TOO_LARGE')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}


async function adminToken() {
  const data = new TextEncoder().encode(`${process.env.ADMIN_PASSWORD}|${(process.env.SESSION_SECRET || 'ballarin-b') + '|admin'}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function isAdminReq(req) {
  const pwd = String(req.headers['x-admin-password'] || '');
  if (pwd && safeEqual(pwd, process.env.ADMIN_PASSWORD)) return true;
  const m = String(req.headers['cookie'] || '').match(/(?:^|;\s*)bb_admin=([^;]*)/);
  return !!m && m[1] === await adminToken();
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}

async function gh(method, url, body) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${url}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ballarinb-admin', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

async function getSha(path) {
  const r = await gh('GET', `${path}?ref=${BRANCH}`);
  return r.ok ? r.json.sha : null;
}

async function putFile(path, base64, message) {
  const sha = await getSha(path);
  const r = await gh('PUT', path, { message, content: base64, branch: BRANCH, ...(sha ? { sha } : {}) });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${r.json.message || 'erreur'}`);
  return r.json;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!process.env.ADMIN_PASSWORD || !process.env.GITHUB_TOKEN) return res.status(500).json({ error: 'Configuration serveur incomplète (ADMIN_PASSWORD / GITHUB_TOKEN).' });

  if (!(await isAdminReq(req))) return res.status(401).json({ error: 'Session administrateur requise : reconnectez-vous à l’espace syndic.' });

  // Suppression d'une archive (seules les archives peuvent être supprimées ; les autres fichiers se corrigent en les renvoyant)
  if (String(req.headers['x-action'] || '') === 'delete') {
    const file = String(req.headers['x-file'] || '');
    if (!/^ag-\d{4}\.(pdf|docx)$/.test(file)) return res.status(400).json({ error: 'Seules les archives d’AG (ag-AAAA.pdf/.docx) peuvent être supprimées.' });
    const path = `public/docs/archives/${file}`;
    try {
      const sha = await getSha(path);
      if (!sha) return res.status(404).json({ error: 'Ce fichier n’existe pas (ou plus).' });
      const r = await gh('DELETE', path, { message: `Admin : suppression de l’archive ${file} (${new Date().toLocaleDateString('fr-FR')})`, sha, branch: BRANCH });
      if (!r.ok) throw new Error(`GitHub ${r.status}: ${r.json.message || 'erreur'}`);
      return res.status(200).json({ ok: true, message: `Archive ${file} supprimée. Le site se met à jour dans environ une minute.` });
    } catch (e) { return res.status(502).json({ error: String(e.message || e) }); }
  }

  // Retour à la version précédente d'un document principal
  if (String(req.headers['x-action'] || '') === 'restore') {
    const tg = TARGETS[String(req.headers['x-target'] || '')];
    if (!tg || !tg.path) return res.status(400).json({ error: 'Document inconnu.' });
    try {
      const cr = await fetch(`https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(tg.path)}&sha=${BRANCH}&per_page=1`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ballarinb-admin' } });
      const commits = await cr.json();
      const last = Array.isArray(commits) && commits[0];
      const parent = last && last.parents && last.parents[0] && last.parents[0].sha;
      if (!parent) return res.status(404).json({ error: 'Aucune version précédente trouvée.' });
      const prev = await gh('GET', `${tg.path}?ref=${parent}`);
      if (!prev.ok || !prev.json.content) return res.status(404).json({ error: 'Version précédente introuvable.' });
      const when = last.commit && last.commit.committer && last.commit.committer.date ? new Date(last.commit.committer.date).toLocaleString('fr-FR') : '';
      await putFile(tg.path, prev.json.content.replace(/\n/g, ''), `Admin : retour à la version précédente — ${tg.label} (annule la mise à jour du ${when})`);
      return res.status(200).json({ ok: true, message: `Version précédente de « ${tg.label} » restaurée. Le site se met à jour dans environ une minute.` });
    } catch (e) { return res.status(502).json({ error: String(e.message || e) }); }
  }

  const target = String(req.headers['x-target'] || '');
  const filename = decodeURIComponent(String(req.headers['x-filename'] || 'fichier'));
  const year = String(req.headers['x-year'] || '').trim();
  const note = decodeURIComponent(String(req.headers['x-note'] || '')).slice(0, 120);
  const t = TARGETS[target];
  if (!t) return res.status(400).json({ error: 'Type de fichier inconnu.' });

  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (!t.ext.includes(ext)) return res.status(400).json({ error: `Ce fichier doit être au format ${t.ext.map(e => '.' + e).join(' ou ')}.` });

  let buf;
  try { buf = await readBody(req); } catch (e) { return res.status(413).json({ error: 'Fichier trop volumineux (4 Mo maximum).' }); }
  if (!buf || buf.length < 100) return res.status(400).json({ error: 'Fichier vide.' });
  // xlsx / docx = zip (PK), pdf = %PDF
  const head = buf.subarray(0, 4).toString('latin1');
  if ((ext === 'xlsx' || ext === 'docx') && !head.startsWith('PK')) return res.status(400).json({ error: 'Le fichier ne semble pas être un vrai ' + ext.toUpperCase() + '.' });
  if (ext === 'pdf' && !head.startsWith('%PDF')) return res.status(400).json({ error: 'Le fichier ne semble pas être un vrai PDF.' });

  try {
    const done = [];
    const stamp = new Date().toLocaleDateString('fr-FR');
    if (target === 'archive') {
      if (!/^\d{4}$/.test(year)) return res.status(400).json({ error: 'Indiquez l’année de l’AG (4 chiffres).' });
      const p = `public/docs/archives/ag-${year}.${ext}`;
      await putFile(p, buf.toString('base64'), `Admin : archive AG ${year} (${stamp})${note ? ' — ' + note : ''}`);
      done.push(p);
    } else {
      if (target === 'ag' && /^\d{4}$/.test(year)) {
        // archiver l'ancien compte rendu avant de le remplacer
        const cur = await gh('GET', `${t.path}?ref=${BRANCH}`);
        if (cur.ok && cur.json.content) {
          const p = `public/docs/archives/ag-${year}.docx`;
          await putFile(p, cur.json.content.replace(/\n/g, ''), `Admin : archivage de l’ancien compte rendu en AG ${year} (${stamp})`);
          done.push(p);
        }
      }
      await putFile(t.path, buf.toString('base64'), `Admin : mise à jour ${t.label} (${stamp})${note ? ' — ' + note : ''}`);
      done.push(t.path);
    }
    return res.status(200).json({ ok: true, files: done, message: 'Fichier enregistré. Le site se met à jour dans environ une minute.' });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
