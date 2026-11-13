// Vercel Edge Middleware — protège tout le site par un mot de passe unique.
// Variables d'environnement à définir dans Vercel : SITE_PASSWORD (obligatoire), SESSION_SECRET (optionnel).
import { next } from '@vercel/edge';

export const config = {
  // Tout sauf les assets de build et ce qui est nécessaire à la page de connexion
  matcher: ['/((?!_astro/|favicon.svg|images/flag-corse.svg|images/connexion-bg.jpg).*)'],
};

const COOKIE = 'bb_session';
const ADMIN_COOKIE = 'bb_admin';
const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_YEAR = 60 * 60 * 24 * 365;

async function token(password, secret) {
  const data = new TextEncoder().encode(`${password}|${secret}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function getCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? m[1] : null;
}

export default async function middleware(req) {
  const url = new URL(req.url);
  const password = process.env.SITE_PASSWORD;
  const secret = process.env.SESSION_SECRET || 'ballarin-b';
  if (!password) return next(); // pas de mot de passe configuré → site ouvert (dev)

  const expected = await token(password, secret);

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const form = await req.formData();
    const given = String(form.get('password') || '');
    const nextPath = String(form.get('next') || '/');
    const safeNext = nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/';
    if (given === password) {
      return new Response(null, {
        status: 303,
        headers: { Location: safeNext, 'Set-Cookie': `${COOKIE}=${expected}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Lax` },
      });
    }
    return Response.redirect(`${url.origin}/connexion?erreur=1&next=${encodeURIComponent(safeNext)}`, 303);
  }

  // --- Espace syndic (mot de passe administrateur séparé)
  const adminPwd = process.env.ADMIN_PASSWORD;
  const adminExpected = adminPwd ? await token(adminPwd, secret + '|admin') : null;
  const isAdmin = !!adminExpected && getCookie(req, ADMIN_COOKIE) === adminExpected;

  if (url.pathname === '/api/admin-login' && req.method === 'POST') {
    const form = await req.formData();
    const given = String(form.get('password') || '');
    if (adminPwd && given === adminPwd) {
      return new Response(null, { status: 303, headers: { Location: '/admin', 'Set-Cookie': `${ADMIN_COOKIE}=${adminExpected}; Path=/; Max-Age=${THIRTY_DAYS}; HttpOnly; Secure; SameSite=Lax` } });
    }
    return Response.redirect(`${url.origin}/admin-connexion?erreur=1`, 303);
  }
  if (url.pathname === '/admin-deconnexion') {
    return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }

  if (url.pathname === '/deconnexion') {
    return new Response(null, { status: 303, headers: { Location: '/connexion', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }

  const authed = getCookie(req, COOKIE) === expected;
  if (url.pathname === '/connexion' || url.pathname === '/connexion/') {
    return authed ? Response.redirect(`${url.origin}/`, 302) : next();
  }
  if (!authed) return Response.redirect(`${url.origin}/connexion?next=${encodeURIComponent(url.pathname)}`, 302);

  // pages et API réservées au syndic
  const adminArea = url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname.startsWith('/api/upload') || (url.pathname.startsWith('/api/comptes') && req.method !== 'GET');
  if (url.pathname === '/admin-connexion' || url.pathname === '/admin-connexion/') return isAdmin ? Response.redirect(`${url.origin}/admin`, 302) : next();
  if (adminArea && !isAdmin) {
    if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({ error: 'Session administrateur requise.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    return Response.redirect(`${url.origin}/admin-connexion`, 302);
  }
}
