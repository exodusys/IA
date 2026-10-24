// Serveur de paiement SumUp pour MaisonNova — Cloudflare Worker (offre gratuite)
//
// Variables à définir dans Cloudflare (Settings → Variables and Secrets) :
//   SUMUP_API_KEY        (Secret)  ta clé API secrète SumUp (sup_sk_…)
//   SUMUP_MERCHANT_CODE  (Texte)   ton code marchand SumUp (ex. MXXXXXXX)
//   ALLOWED_ORIGIN       (Texte)   adresse de ton site, ex. https://tonpseudo.github.io
//   CURRENCY             (Texte, optionnel) CHF par défaut
//
// Routes :
//   POST /checkout  { reference, amount, redirect }  → { id, url }
//   GET  /status?id=…                                → { status, amount, currency, reference }

const API = 'https://api.sumup.com/v0.1/checkouts';

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
    const okOrigin = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin && origin ? origin : (allowed[0] || '*'),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!okOrigin) return json({ error: 'Origine non autorisée' }, 403, cors);
    if (!env.SUMUP_API_KEY || !env.SUMUP_MERCHANT_CODE) return json({ error: 'Serveur SumUp non configuré' }, 500, cors);

    const url = new URL(req.url);
    const auth = { 'Authorization': 'Bearer ' + env.SUMUP_API_KEY, 'Content-Type': 'application/json' };

    // Créer un paiement SumUp (page de paiement hébergée par SumUp)
    if (req.method === 'POST' && url.pathname === '/checkout') {
      const b = await req.json().catch(() => ({}));
      const amount = Math.round(Number(b.amount) * 100) / 100;
      const reference = String(b.reference || '');
      if (!(amount > 0 && amount <= 10000)) return json({ error: 'Montant invalide' }, 400, cors);
      if (!/^[A-Za-z0-9-]{1,40}$/.test(reference)) return json({ error: 'Référence invalide' }, 400, cors);

      let redirect;
      try {
        const r = new URL(String(b.redirect || ''));
        if (r.protocol === 'https:' && (allowed.length === 0 || allowed.includes(r.origin))) redirect = r.toString();
      } catch (e) {}

      const res = await fetch(API, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          checkout_reference: reference + '-' + Date.now(),
          amount,
          currency: env.CURRENCY || 'CHF',
          merchant_code: env.SUMUP_MERCHANT_CODE,
          description: 'Commande ' + reference,
          redirect_url: redirect,
          hosted_checkout: { enabled: true }
        })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.hosted_checkout_url) return json({ error: d.message || d.error_code || 'Erreur SumUp' }, 502, cors);
      return json({ id: d.id, url: d.hosted_checkout_url }, 200, cors);
    }

    // Vérifier le statut d'un paiement
    if (req.method === 'GET' && url.pathname === '/status') {
      const id = url.searchParams.get('id') || '';
      if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return json({ error: 'Identifiant invalide' }, 400, cors);
      const res = await fetch(API + '/' + encodeURIComponent(id), { headers: auth });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: 'Erreur SumUp' }, 502, cors);
      return json({ status: d.status, amount: d.amount, currency: d.currency, reference: d.checkout_reference }, 200, cors);
    }

    return json({ error: 'Introuvable' }, 404, cors);
  }
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
