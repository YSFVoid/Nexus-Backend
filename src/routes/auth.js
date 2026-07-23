async function authRoutes(fastify) {
  fastify.get('/login', async (req, reply) => {
    const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.hostname}`;
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      redirect_uri: `${backendUrl}/api/auth/callback/discord`,
      response_type: 'code',
      scope: 'identify email guilds',
    });
    reply.redirect(`https://discord.com/api/v10/oauth2/authorize?${params}`);
  });

  fastify.get('/callback/discord', async (req, reply) => {
    const { code, error } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.hostname}`;
    if (error || !code) {
      return reply.redirect(`${frontendUrl}/?error=${error === 'access_denied' ? 'access_denied' : 'invalid_token'}`);
    }
    try {
      const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${backendUrl}/api/auth/callback/discord`,
      });
      const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
      if (!tokenRes.ok) return reply.redirect(`${frontendUrl}/?error=invalid_token`);
      const { access_token } = await tokenRes.json();

      const userRes = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
      if (!userRes.ok) return reply.redirect(`${frontendUrl}/?error=invalid_token`);
      const user = await userRes.json();

      const memberRes = await fetch(`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.id}`, { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } });
      if (!memberRes.ok) return reply.redirect(`${frontendUrl}/?error=not_in_guild`);
      const member = await memberRes.json();
      if (!(member.roles || []).includes(process.env.DISCORD_REQUIRED_ROLE_ID)) {
        return reply.redirect(`${frontendUrl}/no-access?username=${encodeURIComponent(user.username)}`);
      }

      const isProd = process.env.NODE_ENV === 'production';
      reply.setCookie('discord_token', access_token, { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
      reply.setCookie('discord_user', JSON.stringify(user), { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
      reply.redirect(`${frontendUrl}/dashboard`);
    } catch {
      reply.redirect(`${frontendUrl}/?error=invalid_token`);
    }
  });

  fastify.get('/me', async (req, reply) => {
    const userCookie = req.cookies?.discord_user;
    const token = req.cookies?.discord_token;
    if (!userCookie || !token) return reply.code(401).send({ user: null });
    try { return { user: JSON.parse(userCookie) }; } catch { return reply.code(401).send({ user: null }); }
  });

  fastify.get('/logout', async (req, reply) => {
    reply.clearCookie('discord_token', { path: '/' });
    reply.clearCookie('discord_user', { path: '/' });
    reply.redirect(process.env.FRONTEND_URL || '/');
  });
}

module.exports = authRoutes;
