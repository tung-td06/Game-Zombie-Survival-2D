-- Seed data: migrate from data/db.json
-- Profile: HOHO
INSERT OR REPLACE INTO profiles (username, high_score, total_kills, coins, player_level, xp, unlocked_weapons, weapon_upgrades, player_upgrades, achievements, quests_claimed, settings)
VALUES (
  'hoho',
  18150,
  319,
  2126,
  10,
  865,
  '["pistol","shotgun","smg","rifle"]',
  '{}',
  '{}',
  '["first_blood","kill_100","survive_10min","boss_slayer"]',
  '[]',
  '{"master_volume":1,"music_volume":1,"sfx_volume":1,"fullscreen":true,"show_fps":true,"resolution_index":0,"screen_shake":true,"damage_numbers":true,"hit_effects":true,"brightness":1,"bindings":{"up":"KeyW","down":"KeyS","left":"KeyA","right":"KeyD","reload":"KeyR","weapon1":"Digit1","weapon2":"Digit2","weapon3":"Digit3","weapon4":"Digit4","weapon5":"Digit5","next_weapon":"MouseMiddle","vacuum":"KeyE","pause":"Escape","debug":"F3","fullscreen":"F11"}}'
);

-- Profile: hihi
INSERT OR REPLACE INTO profiles (username, high_score, total_kills, coins, player_level, xp, unlocked_weapons, weapon_upgrades, player_upgrades, achievements, quests_claimed, settings)
VALUES (
  'hihi',
  18150,
  319,
  2126,
  10,
  865,
  '["pistol","shotgun","smg","rifle"]',
  '{}',
  '{}',
  '["first_blood","kill_100","survive_10min","boss_slayer"]',
  '[]',
  '{"master_volume":1,"music_volume":1,"sfx_volume":1,"fullscreen":true,"show_fps":true,"resolution_index":0,"screen_shake":true,"damage_numbers":true,"hit_effects":true,"brightness":1,"bindings":{"up":"KeyW","down":"KeyS","left":"KeyA","right":"KeyD","reload":"KeyR","weapon1":"Digit1","weapon2":"Digit2","weapon3":"Digit3","weapon4":"Digit4","weapon5":"Digit5","next_weapon":"MouseMiddle","vacuum":"KeyE","pause":"Escape","debug":"F3","fullscreen":"F11"}}'
);

-- Profile: haha
INSERT OR REPLACE INTO profiles (username, high_score, total_kills, coins, player_level, xp, unlocked_weapons, weapon_upgrades, player_upgrades, achievements, quests_claimed, settings)
VALUES (
  'haha',
  0,
  0,
  0,
  1,
  0,
  '["pistol"]',
  '{}',
  '{}',
  '[]',
  '[]',
  '{}'
);

-- Profile: survivor_408
INSERT OR REPLACE INTO profiles (username, high_score, total_kills, coins, player_level, xp, unlocked_weapons, weapon_upgrades, player_upgrades, achievements, quests_claimed, settings)
VALUES (
  'survivor_408',
  1000,
  20,
  265,
  2,
  160,
  '["pistol"]',
  '{}',
  '{}',
  '["first_blood"]',
  '[]',
  '{"master_volume":0.8,"music_volume":0.6,"sfx_volume":0.8,"fullscreen":false,"show_fps":false,"resolution_index":0,"screen_shake":true,"damage_numbers":true,"hit_effects":true,"brightness":1,"bindings":{"up":"KeyW","down":"KeyS","left":"KeyA","right":"KeyD","reload":"KeyR","weapon1":"Digit1","weapon2":"Digit2","weapon3":"Digit3","weapon4":"Digit4","weapon5":"Digit5","next_weapon":"MouseMiddle","vacuum":"KeyE","pause":"Escape","debug":"F3","fullscreen":"F11"}}'
);
