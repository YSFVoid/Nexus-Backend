const { getAntiCrackStats, getCrackers, getCrackerById, getDetections, getTotalArchives, getTotalArchivedFiles, getTotalArchivedMessages } = require('../lib/anticrack');

async function anticrackRoutes(fastify) {
  fastify.get('/stats', async () => {
    const [stats, archives, files, messages] = await Promise.all([
      getAntiCrackStats(), getTotalArchives().catch(() => 0), getTotalArchivedFiles().catch(() => 0), getTotalArchivedMessages().catch(() => 0),
    ]);
    return { ...stats, total_archives: archives, total_archived_files: files, total_archived_messages: messages };
  });

  fastify.get('/crackers', async (req) => {
    const { page = 1, limit = 20, search = '' } = req.query;
    return getCrackers(parseInt(page), parseInt(limit), search);
  });

  fastify.get('/crackers/:id', async (req) => {
    const cracker = await getCrackerById(parseInt(req.params.id));
    if (!cracker) throw { statusCode: 404, message: 'Not found' };
    return cracker;
  });

  fastify.get('/detections', async (req) => {
    const { page = 1, limit = 20 } = req.query;
    return getDetections(parseInt(page), parseInt(limit));
  });
}

module.exports = anticrackRoutes;
