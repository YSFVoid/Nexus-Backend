const { getDMArchives, getDMFilesByCracker, getTotalArchives, getTotalArchivedMessages, getTotalArchivedFiles } = require('../lib/anticrack');
const { getCrackerById } = require('../lib/anticrack');
const { discordFetch } = require('../lib/discord');

async function captureRoutes(fastify) {
  fastify.get('/archives', async (req) => {
    const { id, archiveId, action } = req.query;
    if (archiveId) {
      const archives = await getDMArchives(parseInt(id));
      return archives.find(a => a.id === parseInt(archiveId)) || null;
    }
    if (action === 'history') return []; // placeholder
    return getDMArchives(parseInt(id));
  });

  fastify.get('/download', async (req, reply) => {
    const id = parseInt(req.query.id);
    if (isNaN(id)) throw { statusCode: 400, message: 'Invalid id' };
    const cracker = await getCrackerById(id);
    const archives = await getDMArchives(id);
    if (archives.length === 0) throw { statusCode: 404, message: 'No archives found' };
    // For now return JSON - ZIP generation needs manual implementation or archiver dep
    const files = await getDMFilesByCracker(id);
    const username = cracker?.discord_user || cracker?.pc_user || `cracker_${id}`;
    return { username, archiveCount: archives.length, fileCount: files.length, archives: archives.map(a => ({ channel: a.channel_name, messages: a.message_count })) };
  });

  fastify.get('/stats', async () => {
    const [archives, messages, files] = await Promise.all([
      getTotalArchives().catch(() => 0),
      getTotalArchivedMessages().catch(() => 0),
      getTotalArchivedFiles().catch(() => 0),
    ]);
    return { total_archives: archives, total_archived_messages: messages, total_archived_files: files };
  });
}

module.exports = captureRoutes;
