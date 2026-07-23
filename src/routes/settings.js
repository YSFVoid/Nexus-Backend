const { deleteAllVictims } = require('../lib/supabase');

async function settingsRoutes(fastify) {
  fastify.delete('/', async (req) => {
    const userCookie = req.cookies?.discord_user;
    if (!userCookie) throw { statusCode: 401, message: 'Unauthorized' };
    const body = req.body || {};
    if (body.action === 'clear_database') await deleteAllVictims();
    return { success: true };
  });
}

module.exports = settingsRoutes;
