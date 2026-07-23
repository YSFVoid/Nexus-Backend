const TAG_RULES = [
  { pattern: /ff|freefire/i, tag: { id: 'ff_player', label: 'Free Fire', color: '#FF4500' } },
  { pattern: /pubg/i, tag: { id: 'pubg_player', label: 'PUBG', color: '#FFD700' } },
  { pattern: /valorant/i, tag: { id: 'valorant_player', label: 'Valorant', color: '#FF4655' } },
  { pattern: /mc|minecraft/i, tag: { id: 'mc_player', label: 'Minecraft', color: '#00AA00' } },
  { pattern: /roblox/i, tag: { id: 'roblox_player', label: 'Roblox', color: '#FF0033' } },
  { pattern: /fortnite/i, tag: { id: 'fortnite_player', label: 'Fortnite', color: '#7AC5CD' } },
  { pattern: /apex/i, tag: { id: 'apex_player', label: 'Apex', color: '#DA291C' } },
  { pattern: /csgo|cs2/i, tag: { id: 'csgo_player', label: 'CS:GO', color: '#FFD700' } },
  { pattern: /cod/i, tag: { id: 'cod_player', label: 'COD', color: '#8B0000' } },
  { pattern: /gta/i, tag: { id: 'gta_player', label: 'GTA', color: '#00BFFF' } },
  { pattern: /admin|root|owner/i, tag: { id: 'owner', label: 'Owner', color: '#FFD700' } },
];
function generateTags(username) {
  return TAG_RULES.filter(r => r.pattern.test(username)).map(r => r.tag);
}
module.exports = { generateTags };
