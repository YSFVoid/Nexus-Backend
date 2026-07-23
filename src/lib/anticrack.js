const { Pool } = require('pg');

let _pool = null;

function getPool() {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.ANTICRACK_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }
  return _pool;
}

async function pgQuery(text, params = []) {
  const pool = getPool();
  return pool.query(text, params);
}

async function getCrackers(page = 1, limit = 20, search = '') {
  let where = '';
  const params = [];
  if (search) { params.push(`%${search}%`); where = `WHERE pc_user ILIKE $${params.length} OR discord_user ILIKE $${params.length} OR hwid ILIKE $${params.length}`; }
  const countRes = await pgQuery(`SELECT COUNT(*) FROM crackers ${where}`, params);
  const total = parseInt(countRes.rows[0].count, 10);
  const offset = (page - 1) * limit;
  params.push(limit, offset);
  const dataRes = await pgQuery(`SELECT * FROM crackers ${where} ORDER BY last_seen DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { crackers: dataRes.rows, total, page, limit, pages: Math.ceil(total / limit) };
}

async function getCrackerById(id) {
  const res = await pgQuery('SELECT * FROM crackers WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function getDetections(page = 1, limit = 20) {
  const countRes = await pgQuery('SELECT COUNT(*) FROM detections');
  const total = parseInt(countRes.rows[0].count, 10);
  const offset = (page - 1) * limit;
  const dataRes = await pgQuery(`SELECT d.*, c.pc_user AS cracker_pc_user, c.discord_user AS cracker_discord_user FROM detections d LEFT JOIN crackers c ON d.cracker_id = c.id ORDER BY d.timestamp DESC LIMIT $1 OFFSET $2`, [limit, offset]);
  return { detections: dataRes.rows, total, page, limit, pages: Math.ceil(total / limit) };
}

async function getAntiCrackStats() {
  const [totalCrackers, totalDetections, todayDetections, uniqueHwids, tools, types, overtime, top, totalArchives, totalArchivedMessages, totalArchivedFiles] = await Promise.all([
    pgQuery('SELECT COUNT(*) FROM crackers'),
    pgQuery('SELECT COUNT(*) FROM detections'),
    pgQuery("SELECT COUNT(*) FROM detections WHERE timestamp >= NOW() - INTERVAL '24 hours'"),
    pgQuery('SELECT COUNT(DISTINCT hwid) FROM crackers WHERE hwid IS NOT NULL'),
    pgQuery('SELECT tool_detected, COUNT(*)::int AS count FROM detections GROUP BY tool_detected ORDER BY count DESC LIMIT 10'),
    pgQuery("SELECT TRIM(BOTH '\"' FROM TRIM(unnest(string_to_array(REPLACE(REPLACE(detection_type, '{', ''), '}', ''), ',')))) AS type, COUNT(*)::int AS count FROM detections WHERE detection_type IS NOT NULL AND detection_type != '' AND detection_type != '{}' GROUP BY type ORDER BY count DESC LIMIT 10"),
    pgQuery('SELECT DATE(timestamp) AS date, COUNT(*)::int AS count FROM detections GROUP BY DATE(timestamp) ORDER BY date ASC'),
    pgQuery('SELECT c.id, c.pc_user, c.discord_user, c.hwid, COUNT(d.id)::int AS detection_count FROM crackers c LEFT JOIN detections d ON c.id = d.cracker_id GROUP BY c.id ORDER BY detection_count DESC LIMIT 10'),
    pgQuery('SELECT COUNT(*) FROM dm_archives').catch(() => ({ rows: [{ count: '0' }] })),
    pgQuery('SELECT COALESCE(SUM(message_count), 0) AS count FROM dm_archives').catch(() => ({ rows: [{ count: '0' }] })),
    pgQuery('SELECT COUNT(*) FROM dm_files').catch(() => ({ rows: [{ count: '0' }] })),
  ]);
  return {
    total_crackers: parseInt(totalCrackers.rows[0].count, 10),
    total_detections: parseInt(totalDetections.rows[0].count, 10),
    today_detections: parseInt(todayDetections.rows[0].count, 10),
    unique_hwids: parseInt(uniqueHwids.rows[0].count, 10),
    total_archives: parseInt(totalArchives.rows[0].count, 10),
    total_archived_messages: parseInt(totalArchivedMessages.rows[0].count, 10),
    total_archived_files: parseInt(totalArchivedFiles.rows[0].count, 10),
    detection_by_tool: tools.rows,
    detection_by_type: types.rows,
    detections_over_time: overtime.rows,
    top_crackers: top.rows,
  };
}

async function initCaptureTables() {
  await pgQuery(`CREATE TABLE IF NOT EXISTS dm_archives (id SERIAL PRIMARY KEY, cracker_id INTEGER NOT NULL, channel_id TEXT NOT NULL, channel_name TEXT NOT NULL, messages JSONB DEFAULT '[]', message_count INTEGER DEFAULT 0, captured_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), UNIQUE(cracker_id, channel_id))`);
  await pgQuery(`CREATE TABLE IF NOT EXISTS dm_files (id SERIAL PRIMARY KEY, archive_id INTEGER REFERENCES dm_archives(id) ON DELETE CASCADE, message_id TEXT NOT NULL, filename TEXT NOT NULL, url TEXT NOT NULL, content_type TEXT, file_size INTEGER DEFAULT 0, local_path TEXT, downloaded_at TIMESTAMP DEFAULT NOW())`);
  await pgQuery(`CREATE TABLE IF NOT EXISTS token_history (id SERIAL PRIMARY KEY, cracker_id INTEGER NOT NULL, status TEXT NOT NULL, dm_count INTEGER DEFAULT 0, message_count INTEGER DEFAULT 0, checked_at TIMESTAMP DEFAULT NOW())`);
}

async function getDMArchives(crackerId) {
  const res = await pgQuery('SELECT * FROM dm_archives WHERE cracker_id = $1 ORDER BY captured_at DESC', [crackerId]);
  return res.rows;
}

async function getDMFilesByCracker(crackerId) {
  const res = await pgQuery('SELECT f.* FROM dm_files f JOIN dm_archives a ON f.archive_id = a.id WHERE a.cracker_id = $1', [crackerId]);
  return res.rows;
}

async function upsertDMArchive(crackerId, channelId, channelName, messages, incrementCount = false) {
  const existing = await pgQuery('SELECT id FROM dm_archives WHERE cracker_id = $1 AND channel_id = $2', [crackerId, channelId]);
  if (existing.rows.length > 0) {
    const id = existing.rows[0].id;
    if (incrementCount) {
      await pgQuery('UPDATE dm_archives SET messages = $1, message_count = message_count + $2, updated_at = NOW() WHERE id = $3', [JSON.stringify(messages), messages.length, id]);
    }
    return id;
  } else {
    const res = await pgQuery('INSERT INTO dm_archives (cracker_id, channel_id, channel_name, messages, message_count) VALUES ($1, $2, $3, $4, $5) RETURNING id', [crackerId, channelId, channelName, JSON.stringify(messages), messages.length]);
    return res.rows[0].id;
  }
}

async function upsertDMFile(archiveId, messageId, filename, url, contentType, fileSize, localPath) {
  await pgQuery('INSERT INTO dm_files (archive_id, message_id, filename, url, content_type, file_size, local_path) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING', [archiveId, messageId, filename, url, contentType, fileSize, localPath]);
}

async function recordTokenStatus(crackerId, status, dmCount, messageCount) {
  await pgQuery('INSERT INTO token_history (cracker_id, status, dm_count, message_count) VALUES ($1, $2, $3, $4)', [crackerId, status, dmCount, messageCount]);
}

async function getTotalArchives() {
  const res = await pgQuery('SELECT COUNT(*) FROM dm_archives');
  return parseInt(res.rows[0].count, 10);
}

async function getTotalArchivedMessages() {
  const res = await pgQuery('SELECT COALESCE(SUM(message_count), 0) AS count FROM dm_archives');
  return parseInt(res.rows[0].count, 10);
}

async function getTotalArchivedFiles() {
  const res = await pgQuery('SELECT COUNT(*) FROM dm_files');
  return parseInt(res.rows[0].count, 10);
}

module.exports = { pgQuery, getCrackers, getCrackerById, getDetections, getAntiCrackStats, initCaptureTables, getDMArchives, getDMFilesByCracker, upsertDMArchive, upsertDMFile, recordTokenStatus, getTotalArchives, getTotalArchivedMessages, getTotalArchivedFiles };
