async function discordFetch(token, path, options = {}) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: { Authorization: token, ...options.headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Discord API error: ${res.status}`);
  return res.json();
}

async function sendTextToWebhook(url, text) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text }),
  });
}

module.exports = { discordFetch, sendTextToWebhook };
