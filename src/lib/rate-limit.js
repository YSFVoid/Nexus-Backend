const hits = new Map();
function checkRateLimit(key, max, windowMs) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetTime) {
    hits.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true };
  }
  entry.count++;
  if (entry.count > max) return { allowed: false };
  return { allowed: true };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) { if (now > entry.resetTime) hits.delete(key); }
}, 60000);
module.exports = { checkRateLimit };
