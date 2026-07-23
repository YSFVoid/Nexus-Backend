const { getStats } = require('../lib/supabase');

async function statsRoutes(fastify) {
  fastify.get('/', async () => getStats());
}

module.exports = statsRoutes;
