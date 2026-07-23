const { sendTextToWebhook } = require('../lib/discord');

async function sendWebhookWithZip(url, embed, filename, zipBuffer) {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(zipBuffer)], { type: 'application/zip' }), filename);
  formData.append('payload_json', JSON.stringify({ embeds: [embed] }));
  await fetch(url, { method: 'POST', body: formData });
}

module.exports = { sendTextToWebhook, sendWebhookWithZip };
