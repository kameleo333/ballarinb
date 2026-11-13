// Fonction Vercel : lit / écrit public/docs/comptes.json dans le dépôt GitHub.
// GET  → JSON à jour (lu directement sur GitHub, sans attendre le redéploiement)
// POST → enregistre (en-tête X-Admin-Password), corps JSON
// Variables : ADMIN_PASSWORD, GITHUB_TOKEN (+ GITHUB_REPO, GITHUB_BRANCH optionnelles)

const REPO = process.env.GITHUB_REPO || 'kameleo333/ballarinb';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const PATH = 'public/docs/comptes.json';

function safeEqual(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

async function gh(method, url, body) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${url}`, {
    method, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ballarinb-admin', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

const n = v => { const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isNaN(x) ? 0 : Math.round(x * 100) / 100; };
const s = (v, max = 120) => String(v ?? '').trim().slice(0, max);

function sanitize(d) {
  if (!d || typeof d !== 'object') throw new Error('Données invalides.');
  const rec = (Array.isArray(d.recettes) ? d.recettes : []).filter(r => r && s(r.nom)).slice(0, 60)
    .map(r => ({ nom: s(r.nom, 60), montant: n(r.montant), appel: n(r.appel), internet: n(r.internet), internetNote: s(r.internetNote, 40) }));
  if (!rec.length) throw new Error('Il faut au moins un copropriétaire dans les recettes.');
  const lines = (arr, max) => (Array.isArray(arr) ? arr : []).filter(r => r && s(r.poste)).slice(0, max).map(r => ({ poste: s(r.poste, 120), montant: n(r.montant) }));
  return {
    exercice: s(d.exercice, 20), etabliLe: s(d.etabliLe, 10),
    recettes: rec,
    prevu: { montant: n(d.prevu && d.prevu.montant), internet: n(d.prevu && d.prevu.internet) },
    avanceProvision: n(d.avanceProvision), avoirInternet: n(d.avoirInternet), avoirInternetDate: s(d.avoirInternetDate, 20), interetsLivret: n(d.interetsLivret),
    fraisBureau: lines(d.fraisBureau, 60), depenses: lines(d.depenses, 80),
    notes: s(d.notes, 300),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN manquant.' });

  if (req.method === 'GET') {
    const r = await gh('GET', `${PATH}?ref=${BRANCH}`);
    if (!r.ok || !r.json.content) return res.status(502).json({ error: 'Lecture impossible.' });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(Buffer.from(r.json.content, 'base64').toString('utf8'));
  }

  if (req.method === 'POST') {
    if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD manquant.' });
    if (!safeEqual(String(req.headers['x-admin-password'] || ''), process.env.ADMIN_PASSWORD)) return res.status(401).json({ error: 'Mot de passe administrateur incorrect.' });
    let data;
    try { data = sanitize(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); } catch (e) { return res.status(400).json({ error: e.message || 'Données invalides.' }); }
    try {
      const cur = await gh('GET', `${PATH}?ref=${BRANCH}`);
      const sha = cur.ok ? cur.json.sha : undefined;
      const content = Buffer.from(JSON.stringify(data, null, 1), 'utf8').toString('base64');
      const note = s(req.headers['x-note'] ? decodeURIComponent(String(req.headers['x-note'])) : '', 120);
      const r = await gh('PUT', PATH, { message: `Admin : comptes mis à jour (${new Date().toLocaleDateString('fr-FR')})${note ? ' — ' + note : ''}`, content, branch: BRANCH, ...(sha ? { sha } : {}) });
      if (!r.ok) throw new Error(`GitHub ${r.status}: ${r.json.message || 'erreur'}`);
      return res.status(200).json({ ok: true, message: 'Comptes enregistrés. Les pages Charges et Finances sont à jour immédiatement.' });
    } catch (e) { return res.status(502).json({ error: String(e.message || e) }); }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
