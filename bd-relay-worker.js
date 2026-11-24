// Relais CORS pour BusDirect — à déployer comme Cloudflare Worker (gratuit : 100 000 requêtes/jour).
// Utilisation dans l'app : Paramètres → Sources GTFS → Relais :  https://TON-WORKER.workers.dev/?u={url}
// Il ne fait que transmettre des requêtes GET vers les hôtes autorisés ci-dessous et ajoute les en-têtes CORS.

const ALLOWED_HOSTS = [
  'data.opentransportdata.swiss',
  'api.opentransportdata.swiss',
  'gtfs.opentransportdata.swiss',
  'transport.data.gouv.fr',
  'eu.ftp.opendatasoft.com',
  // ajoute ici les hôtes de tes flux GTFS / GTFS-RT
];
const ALLOWED_ORIGINS = ['*']; // ex. ['https://mon-app.example'] pour limiter l'usage à ton app

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '*';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes('*') ? '*' : (ALLOWED_ORIGINS.includes(origin) ? origin : 'null'),
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'GET') return new Response('GET uniquement', { status: 405, headers: cors });
    const target = new URL(req.url).searchParams.get('u');
    let u; try { u = new URL(target); } catch { return new Response('Paramètre u invalide', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) return new Response('Hôte non autorisé', { status: 403, headers: cors });
    const h = new Headers();
    const auth = req.headers.get('Authorization'); if (auth) h.set('Authorization', auth);
    const r = await fetch(u.toString(), { headers: h, redirect: 'follow', cf: { cacheTtl: u.pathname.endsWith('.zip') ? 3600 : 0, cacheEverything: u.pathname.endsWith('.zip') } });
    const out = new Headers(r.headers);
    for (const k of Object.keys(cors)) out.set(k, cors[k]);
    out.delete('set-cookie');
    return new Response(r.body, { status: r.status, headers: out });
  },
};
