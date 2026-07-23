const { getVictims, getVictimById } = require('../lib/supabase');

async function victimsRoutes(fastify) {
  fastify.get('/', async (req) => {
    const { page = 1, limit = 20, search = '', tag = '' } = req.query;
    return getVictims(parseInt(page), parseInt(limit), search, tag);
  });

  fastify.get('/:id', async (req) => {
    const victim = await getVictimById(req.params.id);
    if (!victim) throw { statusCode: 404, message: 'Not found' };
    return victim;
  });
}

module.exports = victimsRoutes;
