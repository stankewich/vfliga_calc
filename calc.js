// ==UserScript==
// @name         Virtual Soccer Strength Analyzer
// @namespace    http://tampermonkey.net/
// @version      2.11
// @description  Калькулятор силы команд для Virtual Soccer
// @author       Arne + GPT
// @match        https://www.virtualsoccer.ru/previewmatch.php*
// @connect      virtualsoccer.ru
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

/* ----------------------------- УТИЛИТЫ И БОНУСЫ ----------------------------- */
const COLLISION_NONE = 'none';
const COLLISION_WIN = 'win';
const COLLISION_LOSE = 'lose';
  const STYLE_VALUES = {
    'sp': 1, 'brazil': 3, 'tiki': 4, 'bb': 2, 'kat': 5, 'brit': 6, 'norm': 0
  };
  function VSStorage() {
    const hasGMGet = typeof GM_getValue === 'function';
    const hasGMSet = typeof GM_setValue === 'function';
    return {
      get(key) {
        try {
          if (hasGMGet) return GM_getValue(key, null);
          const v = localStorage.getItem(key);
          return v === null ? null : v;
        } catch (e) { return null; }
      },
      set(key, value) {
        try {
          if (hasGMSet) return GM_setValue(key, value);
          localStorage.setItem(key, value);
        } catch (e) { /* ignore */ }
      }
    };
  }
  const vsStorage = VSStorage();
const collision_bonuses = {
  norm: null,
  sp:     { brit: 0.38 },
  bb:     { sp: 0.42 },
  brazil: { bb: 0.34 },
  tiki:   { kat: 0.36 },
  kat:    { brazil: 0.44 },
  brit:   { tiki: 0.40 }
};
  function pickClosest(target, nums) {
    if (!nums || !nums.length) return null;
    let best = nums[0], bestDiff = Math.abs(nums[0] - target);
    for (let i = 1; i < nums.length; i++) {
      const d = Math.abs(nums[i] - target);
      if (d < bestDiff || (d === bestDiff && nums[i] > best)) { best = nums[i]; bestDiff = d; }
    }
    return best;
  }
  function normalizeTemperatureForWeather(result, weather, temperature) {
    const weatherMap = {
      "очень жарко": [0, 2],
      "жарко": [3, 6],
      "солнечно": [7, 11],
      "облачно": [12, 16],
      "пасмурно": [17, 21],
      "дождь": [22, 25],
      "снег": [26, 28]
    };
    const range = weatherMap[(weather || '').toLowerCase()];
    if (!range) return null;
    const [start, end] = range;
    const temps = [];
    for (let i = start; i <= end; i++) {
      const v = parseInt(result.temperatures[i], 10);
      if (!Number.isNaN(v)) temps.push(v);
    }
    if (!temps.length) return null;
    return pickClosest(Number(temperature), temps);
  }
  function normalizeTemperatureGlobally(result, temperature) {
    const temps = (result.temperatures || []).map(v => parseInt(v, 10)).filter(v => !Number.isNaN(v));
    if (!temps.length) return null;
    return pickClosest(Number(temperature), temps);
  }
  function getWeatherStrengthValueFromParsed(result, temperature, weather, strength, callback) {
    if (!result) return callback({found: false});
    const weatherMap = {
      "очень жарко": [0, 2],
      "жарко": [3, 6],
      "солнечно": [7, 11],
      "облачно": [12, 16],
      "пасмурно": [17, 21],
      "дождь": [22, 25],
      "снег": [26, 28]
    };
    let colRange = weatherMap[weather.toLowerCase()];
    if (!colRange) return callback({found: false, error: "Погода не найдена"});
    let tempIdx = -1;
    for (let i = colRange[0]; i <= colRange[1]; i++) {
      if (parseInt(result.temperatures[i], 10) === temperature) { tempIdx = i; break; }
    }
    let normalizedTemp = temperature;
    if (tempIdx === -1) {
      const n = normalizeTemperatureForWeather(result, weather, temperature);
      if (n != null) {
        normalizedTemp = n;
        for (let i = colRange[0]; i <= colRange[1]; i++) {
          if (parseInt(result.temperatures[i], 10) === normalizedTemp) { tempIdx = i; break; }
        }
      }
    }
    if (tempIdx === -1) {
      const g = normalizeTemperatureGlobally(result, temperature);
      if (g != null) {
        normalizedTemp = g;
        for (let i = 0; i < result.temperatures.length; i++) {
          if (parseInt(result.temperatures[i], 10) === normalizedTemp) { tempIdx = i; break; }
        }
      }
    }
    if (tempIdx === -1) {
      return callback({
        found: false,
        error: "Температура не найдена для этой погоды",
        normalizedTried: normalizedTemp,
        availableTempsInRange: Array.from({length: colRange[1]-colRange[0]+1}, (_,k)=>parseInt(result.temperatures[colRange[0]+k],10)).filter(v=>!Number.isNaN(v))
      });
    }
    let row = result.strengthTable.find(r => parseInt(r.strength, 10) === strength);
    if (!row) return callback({found: false, error: "Сила не найдена"});
    let weatherStr = row.values[tempIdx];
    const rangeTemps = [];
    for (let i = colRange[0]; i <= colRange[1]; i++) {
      const v = parseInt(result.temperatures[i], 10);
      if (!Number.isNaN(v)) rangeTemps.push(v);
    }
    const wasNormalized = normalizedTemp !== temperature;
    callback({
      found: true,
      weatherStr: weatherStr,
      details: {
        temperature: normalizedTemp,
        requestedTemperature: temperature,
        wasNormalized,
        weather,
        strength,
        tempIdx,
        range: colRange,
        rangeTemps
      }
    });
  }
function getCollisionInfo(teamStyleId, oppStyleId) {
  if (!teamStyleId || !oppStyleId) {
    return { teamStatus: COLLISION_NONE, oppStatus: COLLISION_NONE, teamBonus: 0, oppBonus: 0 };
  }
  const wins = collision_bonuses[teamStyleId] || null;
  const winBonus = wins && wins[oppStyleId] ? wins[oppStyleId] : 0;
  const oppWins = collision_bonuses[oppStyleId] || null;
  const oppWinBonus = oppWins && oppWins[teamStyleId] ? oppWins[teamStyleId] : 0;
  let teamStatus = COLLISION_NONE;
  let oppStatus = COLLISION_NONE;
  let teamBonus = 0;
  let oppBonus = 0;
  if (winBonus && !oppWinBonus) {
    teamStatus = COLLISION_WIN; oppStatus = COLLISION_LOSE; teamBonus = winBonus; oppBonus = 0;
  } else if (!winBonus && oppWinBonus) {
    teamStatus = COLLISION_LOSE; oppStatus = COLLISION_WIN; teamBonus = 0; oppBonus = oppWinBonus;
  }
  return { teamStatus, oppStatus, teamBonus, oppBonus };
}
const SUPPORTED_ABILITY_TYPES = new Set(['Ск','Г','Пд','Пк','Д','Км']);
const KNOWN_STYLE_IDS = new Set(['sp','brazil','tiki','bb','kat','brit','norm']);
function parseAbilities(abilitiesStr) {
  if (!abilitiesStr) return [];
  const res = [];
  const singleFlags = abilitiesStr.match(/\b[А-ЯЁA-Z]\b/gi) || [];
  singleFlags.forEach(f => {
    const up = f.replace('ё', 'е').replace('Ё', 'Е').toUpperCase();
    if (up === 'Л') {
      res.push({ type: 'Л', level: 1 });
    }
  });
  const regex = /([А-Яа-яA-Za-zЁё]{1,2})([1-4])/g;
  let m;
  while ((m = regex.exec(abilitiesStr)) !== null) {
    let type = m[1];
    const level = Number(m[2]);
    type = type.replace('ё', 'е').replace('Ё', 'Е');
    if (type.length === 2) {
      type = type[0].toUpperCase() + type[1].toLowerCase();
    } else {
      type = type.toUpperCase();
    }
    if (level >= 1 && level <= 4) {
      if (!(type === 'Л' && res.some(r => r.type === 'Л'))) {
        res.push({ type, level });
      }
    }
  }
  return res;
}
function defenceTypeBonus({ team, opponent, withResult = false }) {
  const DEF = new Set(['GK','LD','LB','SW','CD','RD','RB']);
  const ATT = new Set(['LW','LF','AM','CF','ST','RW','RF']);
  const defenceType = team.defenceType || 'zonal';
  const oppAttCount = opponent.positions.filter(pos => ATT.has(pos)).length;
  const bonusActive =
    (defenceType === 'zonal' && oppAttCount > 3) ||
    (defenceType === 'man'   && oppAttCount <= 3);
  const bonusValue = bonusActive ? 0.05 : 0;
  let totalBonus = 0;
  const perIndex = Array(team.positions.length).fill(0);
  team.positions.forEach((pos, idx) => {
    if (DEF.has(pos)) {
      const add = bonusValue * team.realStr[idx];
      team.contribution[idx] += add;
      perIndex[idx] = add;
      totalBonus += add;
    }
  });
  if (!team.log) team.log = [];
  team.log.push(
    bonusActive
      ? `DefenceTypeBonus: +${totalBonus.toFixed(2)} (${defenceType === 'zonal' ? 'зональный' : 'персональный'}; атакующих у соперника: ${oppAttCount})`
      : `DefenceTypeBonus: 0 (условия не выполнены; атакующих у соперника: ${oppAttCount})`
  );
  if (withResult) {
    return { applied: bonusActive, totalBonus, perIndex, defenceType, oppAttCount };
  }
}
function getMorale(team) {
    return (team && team.morale) || 'normal';
}
function getMoraleBonusBounds({ homeRating, awayRating, sideLabel }) {
    const h = Math.round(homeRating);
    const a = Math.round(awayRating);
    if (!h || !a) return { superBonus: 0.27, restBonus: -0.1 };
    let ratio = h > a ? h / a : a / h;
    ratio = Math.max(1, ratio);
    let superBonus = 0.27;
    let restBonus = -0.1;
    if (sideLabel === 'home') {
        if (h < a) {
            superBonus = Math.min(0.54, (ratio - 1) / 2 + 0.27);
            restBonus = -0.1;
        } else {
            superBonus = 0.27;
            restBonus = Math.max(-0.25, Math.min(-0.1, -((ratio - 1) / 4) - 0.1));
        }
    } else {
        if (a < h) {
            superBonus = Math.min(0.54, (ratio - 1) / 2 + 0.27);
            restBonus = -0.1;
        } else {
            superBonus = 0.27;
            restBonus = Math.max(-0.25, Math.min(-0.1, -((ratio - 1) / 4) - 0.1));
        }
    }
    return { superBonus, restBonus };
}
function getMoraleBonusForPlayer({ moraleMode, baseContrib, bounds }) {
    if (moraleMode === 'super') return baseContrib * bounds.superBonus;
    if (moraleMode === 'rest') return baseContrib * bounds.restBonus;
    return 0;
}
function getRough(team) {
  return (team && team.rough) || 'clean';
}
function getRoughBonusForPlayer(realStr, roughMode) {
  if (roughMode !== 'rough') return 0;
  const base = (Number(realStr) || 0) * 0.08;
  return Math.max(base, 5.0);
}
function roughBonus({ team, slotEntries }) {
  const mode = getRough(team);
  team.roughContribution = new Array(slotEntries.length).fill(0);
  if (mode !== 'rough') return 0;
  let total = 0;
  slotEntries.forEach((e, idx) => {
    const rs = Number(e.player.realStr) || 0;
    const b = getRoughBonusForPlayer(rs, mode);
    team.roughContribution[idx] = b;
    total += b;
  });
  return total;
}
function getCaptainAbilityLevel(abilitiesStr) {
  if (!abilitiesStr) return 0;
  const m = abilitiesStr.match(/Ка(\d)?/);
  if (!m) return 0;
  const lvl = m[1] ? Number(m[1]) : 1;
  return Math.max(1, Math.min(lvl, 4));
}
function getAgeCaptainPercent(age) {
  const a = Number(age) || 0;
  if (a >= 34) return 0.08;
  if (a === 33) return 0.07;
  if (a === 32) return 0.06;
  if (a === 31) return 0.05;
  if (a === 30) return 0.04;
  if (a === 29) return 0.03;
  if (a === 28) return 0.02;
  if (a === 27 || a === 26) return 0.01;
  if (a === 25 || a === 24) return 0;
  if (a === 23) return -0.01;
  if (a === 22) return -0.02;
  if (a === 21) return -0.03;
  if (a === 20) return -0.04;
  if (a === 19) return -0.05;
  if (a === 18) return -0.06;
  if (a === 17) return -0.07;
  if (a === 16) return -0.08;
  return 0;
}
function getCaptainAbilityMinPercent(age, kaLevel) {
  if (!kaLevel) return null;
  const a = Number(age) || 0;
  const row = (() => {
    if (a >= 34) return [0.08, 0.08, 0.09, 0.12];
    if (a === 33) return [0.07, 0.07, 0.09, 0.12];
    if (a === 32) return [0.06, 0.06, 0.09, 0.12];
    if (a === 31) return [0.05, 0.05, 0.09, 0.12];
    if (a === 30) return [0.04, 0.04, 0.09, 0.12];
    if (a === 29) return [0.03, 0.03, 0.09, 0.12];
    if (a === 28) return [0.02, 0.02, 0.09, 0.12];
    if (a === 27 || a === 26) return [0.01, 0.02, 0.09, 0.12];
    if (a === 25 || a === 24) return [0.00, 0.02, 0.09, 0.12];
    if (a >= 16) return [0.02, 0.06, 0.09, 0.12];
    return [0.00, 0.02, 0.09, 0.12];
  })();
  const idx = Math.max(1, Math.min(kaLevel, 4)) - 1;
  return row[idx];
}
function estimateCaptainPercent(captainPlayer, lineupEntries) {
  if (!captainPlayer) return 0;
  const captainRealStr = Number(captainPlayer.realStr) || 0;
  const captainAge = Number(captainPlayer.age) || 0;
  const avgRealStr = computeAverageRealStrForLineup((lineupEntries || []).filter(Boolean));
  const kaLevel = getCaptainAbilityLevel(captainPlayer.abilities);
  const percentAge = getAgeCaptainPercent(captainAge);
  const percentKaMin = kaLevel ? getCaptainAbilityMinPercent(captainAge, kaLevel) : null;
  let finalPercent;
  if (percentAge >= 0) {
    if (!kaLevel && captainRealStr < avgRealStr) finalPercent = 0;
    else finalPercent = kaLevel ? Math.max(percentAge, percentKaMin) : percentAge;
  } else {
    finalPercent = kaLevel ? percentKaMin : percentAge;
  }
  return finalPercent || 0;
}
function computeAverageRealStrForLineup(entries) {
  const valid = entries.filter(e => e && e.player);
  if (!valid.length) return 0;
  const sum = valid.reduce((acc, e) => acc + (Number(e.player.realStr) || 0), 0);
  return sum / valid.length;
}
const STYLE_ABILITIES_BONUS_MAP = {
  'Ск': { bb:[0.10,0.20,0.30,0.40], brit:[0.06,0.12,0.18,0.24], norm:[0.05,0.10,0.15,0.20], kat:[0.04,0.08,0.12,0.16], other:[0.02,0.04,0.06,0.08] },
  'Г':  { brit:[0.10,0.20,0.30,0.40], kat:[0.06,0.12,0.18,0.24], norm:[0.05,0.10,0.15,0.20], bb:[0.04,0.08,0.12,0.16], other:[0.02,0.04,0.06,0.08] },
  'Пд': { kat:[0.10,0.20,0.30,0.40], bb:[0.06,0.12,0.18,0.24], norm:[0.05,0.10,0.15,0.20], brit:[0.04,0.08,0.12,0.16], other:[0.02,0.04,0.06,0.08] },
  'Пк': { sp:[0.10,0.20,0.30,0.40], tiki:[0.06,0.12,0.18,0.24], norm:[0.05,0.10,0.15,0.20], brazil:[0.04,0.08,0.12,0.16], other:[0.02,0.04,0.06,0.08] },
  'Д':  { brazil:[0.10,0.20,0.30,0.40], sp:[0.06,0.12,0.18,0.24], norm:[0.05,0.10,0.15,0.20], tiki:[0.04,0.08,0.12,0.16], other:[0.02,0.04,0.06,0.08] },
  'Км': { tiki:[0.10,0.20,0.30,0.40], brazil:[0.06,0.12,0.18,0.24], norm:[0.05,0.10,0.15,0.20], sp:[0.04,0.08,0.12,0.16], other:[0.02,0.04,0.06,0.08] }
};
const LEADERSHIP_LEVEL_COEFF = [0, 0.03, 0.06, 0.09, 0.12];
function getLineByMatchPos(matchPos) {
  const DEF = new Set(['GK','LD','LB','SW','CD','RD','RB']);
  const MID = new Set(['LM','DM','CM','FR','RM']);
  const ATT = new Set(['LW','LF','AM','CF','ST','RW','RF']);
  if (DEF.has(matchPos)) return 'DEF';
  if (MID.has(matchPos)) return 'MID';
  if (ATT.has(matchPos)) return 'ATT';
  return null;
}
function getAbilitiesBonusesDetailed(abilitiesStr, teamStyleId) {
  const arr = parseAbilities(abilitiesStr);
  if (!arr || !arr.length) return [];
  const result = [];
  for (const ab of arr) {
    const map = STYLE_ABILITIES_BONUS_MAP[ab.type];
    if (!map) continue;
    const table = map[teamStyleId] || map.other;
    if (!table || !Array.isArray(table)) continue;
    const idx = Math.min(Math.max(ab.level - 1, 0), 3);
    const bonus = Number(table[idx]) || 0;
    result.push({ type: ab.type, level: ab.level, bonus });
  }
  return result;
}
function getAbilitiesBonusForStyleId(abilitiesStr, teamStyleId) {
  if (!abilitiesStr) return 0;
  const arr = parseAbilities(abilitiesStr);
  if (!arr || !arr.length) return 0;
  const styleId = KNOWN_STYLE_IDS.has(teamStyleId) ? teamStyleId : 'norm';
  let sum = 0;
  for (const ab of arr) {
    if (!SUPPORTED_ABILITY_TYPES.has(ab.type)) continue;
    const map = STYLE_ABILITIES_BONUS_MAP[ab.type];
    if (!map) continue;
    const table = map[styleId] || map.other;
    if (!Array.isArray(table) || table.length < 4) continue;
    const idx = Math.min(Math.max((Number(ab.level) || 1) - 1, 0), 3);
    const bonus = Number(table[idx]) || 0;
    sum += bonus;
  }
  return sum;
}
  function getWeatherStrengthValueCached(styleId, temperature, weather, strength, callback) {
    const cacheKey = 'weather_style_' + styleId;
    let cachedRaw = vsStorage.get(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        return getWeatherStrengthValueFromParsed(cached, temperature, weather, strength, callback);
      } catch (e) { /* перекачаем */ }
    }
    const url = `https://www.virtualsoccer.ru/weather.php?step=1&style=${encodeURIComponent(styleId)}`;
    GM_xmlhttpRequest({
      method: "GET",
      url: url,
      onload: function(response) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(response.responseText, "text/html");
          const tables = Array.from(doc.querySelectorAll('table'));
          let weatherTable = null;
          for (const table of tables) {
            const rows = Array.from(table.querySelectorAll('tr'));
            if (!rows.length) continue;
            const hasTempRow = rows.some(row => {
              const tds = Array.from(row.querySelectorAll('td'));
              return tds.length > 5 && tds.every(td => td.textContent.trim().endsWith('°'));
            });
            if (hasTempRow) {
              weatherTable = table;
              break;
            }
          }
          if (!weatherTable) return callback(null);
          const rows = Array.from(weatherTable.querySelectorAll('tr'));
          const tempRow = rows.find(row => {
            const tds = Array.from(row.querySelectorAll('td'));
            return tds.length > 5 && tds.every(td => td.textContent.trim().endsWith('°'));
          });
          if (!tempRow) return callback(null);
          const temperatures = Array.from(tempRow.querySelectorAll('td')).map(td => {
            const n = parseInt(td.textContent, 10);
            return Number.isNaN(n) ? null : n;
          });
          const strengthTable = [];
          for (const row of rows) {
            const tds = Array.from(row.querySelectorAll('td'));
            if (tds.length === temperatures.length + 1) {
              const first = tds[0].textContent.trim();
              if (/^\d+$/.test(first)) {
                const strength = parseInt(first, 10);
                const values = tds.slice(1).map(td => td.textContent.trim());
                strengthTable.push({ strength, values });
              }
            }
          }
          const result = { temperatures, strengthTable };
          try { vsStorage.set(cacheKey, JSON.stringify(result)); } catch (e) { /* ignore */ }
          getWeatherStrengthValueFromParsed(result, temperature, weather, strength, callback);
        } catch (e) {
          callback(null);
        }
      },
      onerror: function() { callback(null); }
    });
  }
function getFavoriteStyleBonus(teamStyleId, playerStyleId) {
  if (!teamStyleId || !playerStyleId) return 0;
  if (teamStyleId === playerStyleId) return 0.025;
  const teamWins = collision_bonuses[teamStyleId] || null;
  const oppWins  = collision_bonuses[playerStyleId] || null;
  const teamBeatsPlayer = !!(teamWins && teamWins[playerStyleId]);
  const playerBeatsTeam = !!(oppWins  && oppWins[teamStyleId]);
  if (teamBeatsPlayer || playerBeatsTeam) return -0.01;
  return 0;
}
const TEAM_I_LEVEL_COEFF = [0, 0.005, 0.01, 0.02, 0.03];
function getTeamIBonusForLineup(inLineupPlayers) {
  const teamIBonusByPlayer = [];
  let teamIBonusTotal = 0;
  for (const p of inLineupPlayers) {
    const abilities = parseAbilities(p.abilities);
    const intuition = abilities.find(a => a.type === 'И');
    if (!intuition) continue;
    const lvl = Math.max(1, Math.min(4, Number(intuition.level) || 1));
    const coeff = TEAM_I_LEVEL_COEFF[lvl] || 0;
    const realStr = Number(p.realStr) || 0;
    const bonus = realStr * coeff;
    teamIBonusByPlayer.push({ playerId: p.id, name: p.name, level: lvl, realStr, coeff, bonus });
    teamIBonusTotal += bonus;
  }
  return { teamIBonusByPlayer, teamIBonusTotal };
}
function parseTeamsRatingFromPage() {
    const table = Array.from(document.querySelectorAll('table.nol')).find(tbl =>
        tbl.textContent.includes('Рейтинг силы команд')
    );
    if (!table) return null;
    const tds = table.querySelectorAll('td.rdl, td.gdl');
    if (tds.length < 2) return null;
    const home = parseInt(tds[0].textContent, 10);
    const away = parseInt(tds[1].textContent, 10);
    if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
    return { home, away };
}
function parseNumericWeatherStr(value) {
  if (value == null) return null;
  const s = String(value).replace(',', '.').replace(/[^\d.-]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function getHomeBonus(percent) {
  if (percent === 100) return 0.15;
  if (percent >= 90 && percent <= 99) return 0.10;
  if (percent >= 80 && percent <= 89) return 0.05;
  if (percent >= 0 && percent < 80) return 0.025;
  if (percent === -1) return 0;
  console.log('Incorrect percentage of spectators');
  return 0;
}
function parseStadiumCapacity() {
  const divs = Array.from(document.querySelectorAll('div.lh16'));
  for (const div of divs) {
    const m = div.textContent.match(/Стадион\s+["«][^"»]+["»]\s+\(([\d\s]+)\)/i);
    if (m) {
      const cap = parseInt(m[1].replace(/\s/g, ''), 10);
      if (!isNaN(cap)) return cap;
    }
  }
  return null;
}
function getChemistryBonus(player, lineup, teamStyleId) {
  return 0.125;
}
function getSynergyBonus(player, lineup, teamStyleId, userSynergy) {
    const v = Number(userSynergy);
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.min(v, 1);
}
function buildCaptainContext(lineup, players, captainSelectEl) {
  const captainId = captainSelectEl && captainSelectEl.value ? String(captainSelectEl.value) : '';
  const captainPlayer = players.find(p => String(p.id) === captainId) || null;
  const dummyEntries = lineup.map(slot => {
    const pid = slot.getValue && slot.getValue();
    if (!pid) return null;
    const pl = players.find(p => String(p.id) === String(pid));
    return pl ? { player: pl } : null;
  });
  return { captainPlayer, captainId, dummyEntries };
}
window.homeTeam = window.homeTeam || { defenceType: 'zonal', rough: 'clean', morale: 'normal' };
window.awayTeam = window.awayTeam || { defenceType: 'zonal', rough: 'clean', morale: 'normal' };
//вынесено наружу (TODO)
    function getSynergyPercentHome() {
      const el = document.getElementById('vs_synergy_home');
      const v = el ? Number(el.value) : 0;
      return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
    }
    function getSynergyPercentAway() {
      const el = document.getElementById('vs_synergy_away');
      const v = el ? Number(el.value) : 0;
      return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
    }
    function setSynergyPercentHome(v) {
      const el = document.getElementById('vs_synergy_home');
      if (el) el.value = String(v != null ? Math.min(100, Math.max(0, v)) : 0);
    }
    function setSynergyPercentAway(v) {
      const el = document.getElementById('vs_synergy_away');
      if (el) el.value = String(v != null ? Math.min(100, Math.max(0, v)) : 0);
    }
    function clampSynergyInput(inputEl) {
      if (!inputEl) return;
      const n = Number(inputEl.value);
      if (!Number.isFinite(n)) { inputEl.value = '0.00'; return; }
      const clamped = Math.min(100, Math.max(0, n));
      if (clamped !== n) inputEl.value = String(clamped);
    }
function saveAllStates() {
  // Проверяем, что ссылки уже проинициализированы
  if (!window.homeTeam || !window.awayTeam || !window.homeLineupBlock || !window.awayLineupBlock) return;
  if (!window.homeTeam._styleSelector || !window.awayTeam._styleSelector || !window.homeTeam._formationSelector || !window.awayTeam._formationSelector) return;

  const homeState = getCurrentTeamState(
    window.homeTeam._styleSelector,
    window.homeTeam._formationSelector,
    window.homeLineupBlock.captainSelect,
    window.homeLineupBlock
  );
  const awayState = getCurrentTeamState(
    window.awayTeam._styleSelector,
    window.awayTeam._formationSelector,
    window.awayLineupBlock.captainSelect,
    window.awayLineupBlock
  );

  const synergyHomePercent = getSynergyPercentHome();
  const synergyAwayPercent = getSynergyPercentAway();

  saveTeamState(STORAGE_KEYS.home, {
    ...homeState,
    synergyHomePercent,
    defenceType: window.homeTeam.defenceType,
    rough: window.homeTeam.rough,
    morale: window.homeTeam.morale
  });
  saveTeamState(STORAGE_KEYS.away, {
    ...awayState,
    synergyAwayPercent,
    defenceType: window.awayTeam.defenceType,
    rough: window.awayTeam.rough,
    morale: window.awayTeam.morale
  });
}
  function getCurrentTeamState(styleSel, formationSel, captainSel, lineupBlock) {
    return {
      style: styleSel.value,
      formation: formationSel.value,
      captain: captainSel.value,
      lineup: lineupBlock.lineup.map(slot => slot.getValue()),
      mini: lineupBlock.lineup.map(slot => slot.miniPositionSelect ? slot.miniPositionSelect.getValue() : null)
    };
  }
  function saveTeamState(key, state) {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch(e){}
  }
  function loadTeamState(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e){ return null; }
  }
  function clearTeamState(key) {
    try { localStorage.removeItem(key); } catch(e){}
  }
  const STORAGE_KEYS = { home: 'vs_calc_home', away: 'vs_calc_away' };
// --- Вспомогательные селекторы ---
function createRoughSelector(team, onChange) {
  const select = document.createElement('select');
  select.className = 'rough-select';
  select.innerHTML = `<option value="clean">аккуратная</option><option value="rough">грубая</option>`;
  select.value = team.rough || 'clean';
  select.addEventListener('change', () => {
    team.rough = select.value;
    if (typeof onChange === 'function') onChange();
  });
  return select;
}

function createMoraleSelector(team, onChange) {
  const select = document.createElement('select');
  select.className = 'morale-select';
  select.innerHTML = `<option value="normal">обычный</option><option value="super">супер</option><option value="rest">отдых</option>`;
  const initial = (team && team.morale) ? String(team.morale) : 'normal';
  select.value = initial;
  function setTeamMorale(val) {
    if (team === window.homeTeam) window.homeTeam.morale = val;
    else if (team === window.awayTeam) window.awayTeam.morale = val;
    team.morale = val;
  }
  select.addEventListener('change', () => {
    const val = select.value;
    setTeamMorale(val);
    console.log('[UI] Morale changed', {
      side: team === window.homeTeam ? 'home' : 'away',
      value: val
    });
    try { if (typeof saveAllStates === 'function') saveAllStates(); } catch (e) {}
    if (typeof onChange === 'function') onChange();
    if (typeof window.__vs_recalcAll === 'function') window.__vs_recalcAll();
  });
  return select;
}

// --- UI UTILS ---
function createStyleSelector() {
  const select = document.createElement('select');
  const order = ['norm','sp','tiki','brazil','brit','bb','kat'];
  const labels = { norm:'нормальный', sp:'спартаковский', tiki:'тики-така', brazil:'бразильский', brit:'британский', bb:'бей-беги', kat:'катеначчо' };
  order.forEach(id => {
    const opt = document.createElement('option'); opt.value = id; opt.textContent = labels[id]; select.appendChild(opt);
  });
  return select;
}

function createFormationSelector(formationManager) {
  const select = document.createElement('select');
  formationManager.getAllFormations().forEach(name => {
    const opt = document.createElement('option'); opt.value = name; opt.textContent = name; select.appendChild(opt);
  });
  return select;
}

function createDummySelect() {
  const select = document.createElement('select');
  select.innerHTML = '<option value="">—</option>';
  return select;
}

// --- CSS ---
(function addCSS() {
  const css = `
    .morale-select, .rough-select, .defence-type-select {
      min-width: 110px; height: 20px; font-size: 11px; border: 1px solid #aaa;
      border-radius: 4px; padding: 1px 4px; margin-left: 4px; transition: background 0.2s;
    }
    #vsol-calculator-ui { margin: 20px 0; padding: 15px; background: #f9f9f9; border: 1px solid #ccc; border-radius: 6px; }
    #vsol-calculator-ui #vsol-synergy-ui {
      display: flex; gap: 24px; align-items: center; margin-top: 8px;
    }
    #vsol-calculator-ui .vs-synergy-block { display: inline-flex; align-items: center; gap: 6px; }
    #vsol-calculator-ui .vs-synergy-input {
      width: 80px; height: 20px; line-height: 18px; font-size: 11px; padding: 1px 4px; box-sizing: border-box;
    }

    /* Таблица составов — фикс строк и выравнивание */
    #vsol-calculator-ui .orders-table { width: 393px; border-collapse: separate; table-layout: fixed; }
    #vsol-calculator-ui .orders-table tr { height: 22px; }
    #vsol-calculator-ui .orders-table td { vertical-align: middle; padding: 0; }

    #vsol-calculator-ui .order { width: 40px; text-align: center; font-weight: bold; }
    #vsol-calculator-ui .txt { width: 40px; text-align: center; }

    /* Псевдо-select2 для игрока */
    #vsol-calculator-ui .select2 { display: inline-block; position: relative; vertical-align: top; }
    #vsol-calculator-ui .select2-container--orders { width: 271px; }

    #vsol-calculator-ui .select2-selection {
      display: flex; align-items: center; justify-content: space-between;
      border: 1px solid #aaa; padding: 1px 4px;
      height: 20px; min-height: 20px; line-height: 18px; font-size: 11px;
      box-sizing: border-box; cursor: pointer; background: #fff;
    }
    #vsol-calculator-ui .select2-selection__rendered {
      color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      text-align: left; display: block; width: 100%;
    }
    #vsol-calculator-ui .select2-selection__arrow { height: 20px; display: flex; align-items: center; }
    #vsol-calculator-ui .select2-selection__arrow b {
      display: inline-block; border-style: solid; border-width: 5px 4px 0 4px;
      border-color: #555 transparent transparent transparent; margin-left: 6px;
    }
    #vsol-calculator-ui .dropdown-wrapper { display: none; }
    #vsol-calculator-ui .orders-dropdown {
      position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #aaa;
      z-index: 9999; max-height: 240px; overflow-y: auto;
    }
    #vsol-calculator-ui .orders-option { padding: 0 4px; height: 20px; line-height: 20px; font-size: 11px; text-align: left; cursor: pointer; }
    #vsol-calculator-ui .orders-option:hover { background: #f0f0f0; }
    #vsol-calculator-ui .orders-option.disabled { color: #bbb; cursor: default; }
    #vsol-calculator-ui .orders-placeholder { color: rgb(163,163,163); }

    /* Мини-селектор позиции */
    #vsol-calculator-ui .mini-pos-cell { width: 40px; }
    #vsol-calculator-ui .mini-pos-cell .select2-selection { height: 20px; min-height: 20px; line-height: 18px; }

    /* Селектор стиля игрока */
    #vsol-calculator-ui .custom-style-select { position: relative; width: 40px; user-select: none; display: inline-block; vertical-align: top; }
    #vsol-calculator-ui .custom-style-select .selected {
      border: 1px solid #aaa; padding: 1px 4px; background: #fff;
      display: flex; align-items: center; gap: 6px;
      height: 20px; min-height: 20px; line-height: 18px; font-size: 11px; box-sizing: border-box; cursor: pointer;
    }
    #vsol-calculator-ui .custom-style-select .icon { width: 14px; height: 14px; }
    #vsol-calculator-ui .custom-style-select .options {
      display: none; position: absolute; left: 0; right: 0; background: #fff; border: 1px solid #aaa; border-top: none;
      z-index: 9999; max-height: 180px; overflow-y: auto; margin: 0; padding: 0; list-style: none;
    }
    #vsol-calculator-ui .custom-style-select.open .options { display: block; }
    #vsol-calculator-ui .custom-style-select .options li {
      height: 20px; line-height: 20px; font-size: 11px; display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 0 4px;
    }
    #vsol-calculator-ui .custom-style-select .options li:hover { background: #f0f0f0; }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
})();

// --- PLAYER SELECTORS ---
const PLAYER_STYLES = [
  { value: 'sp', label: '', icon: 'styles/o1.gif' },
  { value: 'brazil', label: '', icon: 'styles/o3.gif' },
  { value: 'tiki', label: '', icon: 'styles/o4.gif' },
  { value: 'bb', label: '', icon: 'styles/o2.gif' },
  { value: 'kat', label: '', icon: 'styles/o5.gif' },
  { value: 'brit', label: '', icon: 'styles/o6.gif' },
  { value: 'norm', label: '—', icon: '' }
];

function createCustomStyleSelect(onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-style-select';
  const selectedDiv = document.createElement('div');
  selectedDiv.className = 'selected';
  const selectedIcon = document.createElement('img');
  selectedIcon.className = 'icon';
  selectedIcon.style.display = 'none';
  const selectedLabel = document.createElement('span');
  selectedLabel.textContent = '—';
  selectedDiv.appendChild(selectedIcon);
  selectedDiv.appendChild(selectedLabel);
  wrapper.appendChild(selectedDiv);
  const optionsUl = document.createElement('ul');
  optionsUl.className = 'options';
  let currentValue = 'norm';
  PLAYER_STYLES.forEach(style => {
    const li = document.createElement('li');
    li.dataset.value = style.value;
    if (style.icon) {
      const img = document.createElement('img');
      img.src = style.icon; img.className = 'icon'; li.appendChild(img);
    }
    li.appendChild(document.createTextNode(style.label));
    li.addEventListener('click', () => {
      currentValue = li.dataset.value;
      const styleObj = PLAYER_STYLES.find(s => s.value === currentValue) || PLAYER_STYLES[0];
      selectedLabel.textContent = styleObj.label || '—';
      if (styleObj.icon) { selectedIcon.src = styleObj.icon; selectedIcon.style.display = ''; }
      else { selectedIcon.style.display = 'none'; }
      wrapper.classList.remove('open');
      optionsUl.style.display = 'none';
      if (onChange) onChange(currentValue);
    });
    optionsUl.appendChild(li);
  });
  wrapper.appendChild(optionsUl);
  const styleObj = PLAYER_STYLES.find(s => s.value === currentValue) || PLAYER_STYLES[0];
  selectedLabel.textContent = styleObj.label || '—';
  if (styleObj.icon) { selectedIcon.src = styleObj.icon; selectedIcon.style.display = ''; }
  selectedDiv.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = wrapper.classList.toggle('open');
    optionsUl.style.display = open ? 'block' : 'none';
  });
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      wrapper.classList.remove('open');
      optionsUl.style.display = 'none';
    }
  });
  wrapper.getValue = () => currentValue;
  wrapper.setValue = (val) => {
    currentValue = val;
    const styleObj = PLAYER_STYLES.find(s => s.value === currentValue) || PLAYER_STYLES[0];
    selectedLabel.textContent = styleObj.label || '—';
    if (styleObj.icon) { selectedIcon.src = styleObj.icon; selectedIcon.style.display = ''; }
    else { selectedIcon.style.display = 'none'; }
  };
  return wrapper;
}

function createMiniPositionSelect({ options, bg = '#FFFFBB', widthPx = 40, onChange }) {
  const wrap = document.createElement('span');
  wrap.className = 'select2 select2-container select2-container--orders';
  wrap.style.width = widthPx + 'px';
  const selection = document.createElement('span');
  selection.className = 'selection';
  const sel = document.createElement('span');
  sel.className = 'select2-selection select2-selection--single';
  sel.style.backgroundColor = bg;
  const rendered = document.createElement('span');
  rendered.className = 'select2-selection__rendered';
  const arrow = document.createElement('span');
  arrow.className = 'select2-selection__arrow';
  arrow.appendChild(document.createElement('b'));
  sel.appendChild(rendered);
  sel.appendChild(arrow);
  selection.appendChild(sel);
  wrap.appendChild(selection);
  const dropdownWrapper = document.createElement('span');
  dropdownWrapper.className = 'dropdown-wrapper';
  wrap.appendChild(dropdownWrapper);
  const dropdown = document.createElement('div');
  dropdown.className = 'orders-dropdown';
  dropdownWrapper.appendChild(dropdown);
  let open = false;
  function toggle() {
    open = !open;
    dropdownWrapper.style.display = open ? 'block' : 'none';
  }
  sel.addEventListener('click', (e) => {
    toggle(); e.stopPropagation();
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) {
      open = false;
      dropdownWrapper.style.display = 'none';
    }
  });
  let localOptions = Array.isArray(options) ? options.slice() : [];
  let current = localOptions[0] ? localOptions[0] : { value: '', label: '' };
  rendered.textContent = current.label || '';
  function renderOptions(opts) {
    dropdown.innerHTML = '';
    opts.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'orders-option';
      div.textContent = opt.label;
      div.dataset.value = opt.value;
      div.addEventListener('click', () => {
        current = opt;
        rendered.textContent = opt.label;
        toggle();
        if (onChange) onChange(opt);
      });
      dropdown.appendChild(div);
    });
  }
  renderOptions(localOptions);
  return {
    el: wrap,
    getValue: () => current.value,
    setValue: (v, { allowTemp = true } = {}) => {
      const f = localOptions.find(o => o.value === v);
      if (f) {
        current = f;
      } else if (allowTemp) {
        current = { value: v, label: String(v) };
      } else {
        return;
      }
      rendered.textContent = current.label || '';
    },
    setBg: (color) => { sel.style.backgroundColor = color; },
    setOptions: (opts) => {
      localOptions = Array.isArray(opts) ? opts.slice() : [];
      renderOptions(localOptions);
      const still = localOptions.find(o => o.value === current.value);
      if (!still) {
        if (localOptions[0]) {
          current = localOptions[0];
          rendered.textContent = current.label || '';
        } else {
          current = { value: '', label: '' };
          rendered.textContent = '';
        }
      } else {
        current = still;
        rendered.textContent = still.label || '';
      }
    }
  };
}

function createOrdersSelect({ placeholder, options, widthPx = 271, onChange }) {
  const wrap = document.createElement('span');
  wrap.className = 'select2 select2-container select2-container--orders';
  wrap.style.width = widthPx + 'px';
  const selection = document.createElement('span');
  selection.className = 'selection';
  const sel = document.createElement('span');
  sel.className = 'select2-selection select2-selection--single';
  sel.setAttribute('role', 'combobox');
  sel.setAttribute('aria-haspopup', 'true');
  sel.setAttribute('aria-expanded', 'false');
  sel.tabIndex = 0;
  const rendered = document.createElement('span');
  rendered.className = 'select2-selection__rendered orders-placeholder';
  rendered.textContent = placeholder || '';
  const arrow = document.createElement('span');
  arrow.className = 'select2-selection__arrow';
  const b = document.createElement('b');
  arrow.appendChild(b);
  sel.appendChild(rendered);
  sel.appendChild(arrow);
  selection.appendChild(sel);
  wrap.appendChild(selection);
  const dropdownWrapper = document.createElement('span');
  dropdownWrapper.className = 'dropdown-wrapper';
  wrap.appendChild(dropdownWrapper);
  const dropdown = document.createElement('div');
  dropdown.className = 'orders-dropdown';
  dropdownWrapper.appendChild(dropdown);
  let currentValue = '';
  function close() {
    dropdownWrapper.style.display = 'none';
    sel.setAttribute('aria-expanded', 'false');
  }
  function open() {
    dropdownWrapper.style.display = 'block';
    sel.setAttribute('aria-expanded', 'true');
  }
  sel.addEventListener('click', (e) => {
    if (dropdownWrapper.style.display === 'block') close(); else open();
    e.stopPropagation();
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });
  function renderOptions(opts) {
    dropdown.innerHTML = '';
    opts.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'orders-option' + (opt.disabled ? ' disabled' : '');
      div.textContent = opt.label;
      div.dataset.value = opt.value;
      if (!opt.disabled) {
        div.addEventListener('click', () => {
          currentValue = String(opt.value || '');
          rendered.textContent = opt.label;
          rendered.classList.remove('orders-placeholder');
          close();
          if (onChange) onChange(currentValue);
        });
      }
      dropdown.appendChild(div);
    });
  }
  renderOptions(options || []);
  return {
    el: wrap,
    setOptions(newOptions) { renderOptions(newOptions); },
    setPlaceholder(text) { rendered.textContent = text; rendered.classList.add('orders-placeholder'); },
    getValue() { return currentValue; },
    setValue(value, label) {
      currentValue = String(value || '');
      rendered.textContent = label || '';
      if (!label) rendered.classList.add('orders-placeholder'); else rendered.classList.remove('orders-placeholder');
    }
  };
}

// --- FORMATIONS ---
const FORMATIONS = {
  "4-4-2": ["GK", "LD", "CD", "CD", "RD", "LM", "CM", "CM", "RM", "CF", "CF"],
  "3-5-2": ["GK", "LD", "CD", "RD", "LM", "CM", "CM", "CM", "RM", "CF", "CF"],
  "5-3-2": ["GK", "LD", "CD", "CD", "CD", "RD", "LM", "CM", "RM", "CF", "CF"],
  "4-3-3": ["GK", "LD", "CD", "CD", "RD", "LM", "CM", "RM", "CF", "CF", "CF"],
  "3-4-3": ["GK", "LD", "CD", "RD", "LM", "CM", "CM", "RM", "CF", "CF", "CF"],
  "4-5-1": ["GK", "LD", "CD", "CD", "RD", "LM", "CM", "CM", "CM", "RM", "CF"],
  "3-6-1": ["GK", "LD", "CD", "RD", "LM", "DM", "CM", "CM", "CM", "RM", "CF"],
  "4-2-4": ["GK", "LD", "CD", "CD", "RD", "CM", "CM", "LF", "CF", "CF", "RF"],
  "5-4-1": ["GK", "LD", "CD", "CD", "CD", "RD", "LM", "CM", "CM", "RM", "CF"],
};

const POSITION_PLACEHOLDERS = {
  GK: 'выберите вратаря:',
  LD: 'выберите левого защитника:', LB: 'выберите левого вингбэка:',
  CD: 'выберите центрального защитника:', SW: 'выберите последнего защитника:',
  RD: 'выберите правого защитника:', RB: 'выберите правого вингбэка:',
  LM: 'выберите левого полузащитника:', LW: 'выберите левого вингера:',
  CM: 'выберите центрального полузащитника:', DM: 'выберите опорного полузащитника:', AM: 'выберите атакующего полузащитника:', FR: 'выберите свободного художника:',
  RM: 'выберите правого полузащитника:', RW: 'выберите правого вингера:',
  CF: 'выберите центрального нападающего:', ST: 'выберите выдвинутого нападающего:',
  LF: 'выберите левого нападающего:', RF: 'выберите правого нападающего:'
};

function getAllowedMiniOptions({ formationName, positions, rowIndex }) {
  const pos = positions[rowIndex];
  if (!pos) return [];
  const is424 = formationName === '4-2-4';
  const is361 = formationName === '3-6-1';
  const counts = positions.reduce((acc, p, i) => {
    acc[p] = (acc[p] || 0) + 1;
    if (!acc.indexes) acc.indexes = {};
    if (!acc.indexes[p]) acc.indexes[p] = [];
    acc.indexes[p].push(i);
    return acc;
  }, {});
  const hasLW = positions.includes('LW');
  const hasRW = positions.includes('RW');
  const add = (arr, v, extra = {}) => {
    if (!arr.some(o => o.value === v)) arr.push({ value: v, label: v, ...extra });
  };
  const cmIdxs = (counts.indexes && counts.indexes['CM']) || [];
  const cmCount = cmIdxs.length;
  const cmSorted = [...cmIdxs].sort((a, b) => a - b);
  const cmMin1 = cmSorted[0] ?? null;
  const cmMin2 = cmSorted[1] ?? null;
  const cmMax = cmSorted.length ? cmSorted[cmSorted.length - 1] : null;
  const dmIdxs = (counts.indexes && counts.indexes['DM']) || [];
  const dmCount = dmIdxs.length;
  const cdIdxs = (counts.indexes && counts.indexes['CD']) || [];
  const cdCount = cdIdxs.length;
  const cdMin = cdIdxs.length ? Math.min(...cdIdxs) : null;
  const cfIdxs = (counts.indexes && counts.indexes['CF']) || [];
  const cfCount = cfIdxs.length;
  const cfMin = cfIdxs.length ? Math.min(...cfIdxs) : null;
  const cfMax = cfIdxs.length ? Math.max(...cfIdxs) : null;
  const lmIdxs = (counts.indexes && counts.indexes['LM']) || [];
  const rmIdxs = (counts.indexes && counts.indexes['RM']) || [];
  const options = [];
  add(options, pos);
  switch (pos) {
    case 'LD': add(options, 'LB'); break;
    case 'RD': add(options, 'RB'); break;
    case 'CD': {
      if (cdCount > 1 && rowIndex === cdMin) add(options, 'SW');
      break;
    }
    case 'SW': {
      add(options, 'CD');
      break;
    }
    case 'LM': {
      if (is424) add(options, 'CM');
      const amAbsent = (counts['AM'] || 0) < 1;
      if (amAbsent && !hasLW) add(options, 'LW');
      break;
    }
    case 'RM': {
      if (is424) add(options, 'CM');
      const amAbsent = (counts['AM'] || 0) < 1;
      if (amAbsent && !hasRW) add(options, 'RW');
      break;
    }
    case 'CM': {
      if (!is424) {
        let cmToDMAllowed = false;
        if ((dmCount < 2) && cmCount > 2 && (rowIndex === cmMin1 || rowIndex === cmMin2)) cmToDMAllowed = true;
        if ((dmCount < 2) && cmCount === 2 && rowIndex === cmMin1) cmToDMAllowed = true;
        if ((dmCount < 2) && cmCount === 1) cmToDMAllowed = true;
        if (cmToDMAllowed) add(options, 'DM');
        const noLWnoRW = !hasLW || !hasRW;
        const amAbsent = (counts['AM'] || 0) < 1;
        const isMaxCM = rowIndex === cmMax;
        if (noLWnoRW && amAbsent && isMaxCM) add(options, 'AM');
      } else {
        if (rowIndex === cmMin1) add(options, 'LM');
        if (rowIndex === cmMax) add(options, 'RM');
        const frCount = counts['FR'] || 0;
        if (frCount < 1 && rowIndex === cmMax) add(options, 'FR');
      }
      break;
    }
    case 'DM': {
      const locked = is361 && dmCount === 1;
      if (!locked) {
        add(options, 'CM');
        const amAllowed = !is424 && (counts['AM'] || 0) < 1 && hasLW && hasRW;
        if (amAllowed) add(options, 'AM');
      }
      break;
    }
    case 'AM': add(options, 'CM'); break;
    case 'CF': {
      if (is424) {
        const stIdxs = (counts.indexes && counts.indexes['ST']) || [];
        const stTaken = stIdxs.length > 0;
        if (positions[rowIndex] === 'CF' && !stTaken) add(options, 'ST');
        if (positions[rowIndex] === 'ST') add(options, 'CF');
      } else if (cfCount === 2) {
        if (rowIndex === cfMin) add(options, 'LF');
        if (rowIndex === cfMax) add(options, 'RF');
      } else if (cfCount === 3) {
        const cfSorted = [...cfIdxs].sort((a, b) => a - b);
        const leftCF = cfSorted[0];
        const midCF = cfSorted[1];
        const rightCF = cfSorted[2];
        if (rowIndex === leftCF) add(options, 'LF');
        if (rowIndex === rightCF) add(options, 'RF');
        if (rowIndex === midCF) add(options, 'ST');
      }
      break;
    }
    case 'ST': add(options, 'CF'); break;
    case 'LF': {
      if (!is424) add(options, 'CF');
      break;
    }
    case 'RF': {
      if (!is424) add(options, 'CF');
      break;
    }
    default: break;
  }
  if (is424) {
    if (pos === 'CM' && cmCount === 2) {
      const otherCMIndex = cmIdxs.find(idx => idx !== rowIndex);
      options.forEach(opt => {
        if (opt.value === 'LM' || opt.value === 'RM') {
          const otherValue = (opt.value === 'LM') ? 'RM' : 'LM';
          opt.syncChange = [{ index: otherCMIndex, value: otherValue }];
        }
      });
    }
    if (pos === 'LM' && rmIdxs.length >= 1) {
      const otherRM = rmIdxs[0];
      options.forEach(opt => {
        if (opt.value === 'CM') {
          opt.syncChange = [{ index: otherRM, value: 'CM' }];
        }
      });
    }
    if (pos === 'RM' && lmIdxs.length >= 1) {
      const otherLM = lmIdxs[0];
      options.forEach(opt => {
        if (opt.value === 'CM') {
          opt.syncChange = [{ index: otherLM, value: 'CM' }];
        }
      });
    }
  }
  return options;
}

function onMiniPositionChange({ formationName, positions, rowIndex, selectedOpt, lineup, afterChange }) {
  if (!selectedOpt) return positions;
  const is424 = formationName === '4-2-4';
  const newPositions = [...positions];
  newPositions[rowIndex] = selectedOpt.value;
  const syncArr = Array.isArray(selectedOpt.syncChange) ? selectedOpt.syncChange : (selectedOpt.syncChange ? [selectedOpt.syncChange] : []);
  for (const sc of syncArr) {
    if (sc && typeof sc.index === 'number' && sc.value) {
      newPositions[sc.index] = sc.value;
      if (lineup && lineup[sc.index] && lineup[sc.index].miniPositionSelect) {
        const opts2 = getAllowedMiniOptions({ formationName, positions: newPositions, rowIndex: sc.index });
        lineup[sc.index].miniPositionSelect.setOptions(opts2);
        lineup[sc.index].miniPositionSelect.setValue(sc.value);
      }
    }
  }
  if (is424) {
    const lmIdxs = [];
    const rmIdxs = [];
    const cmIdxs = [];
    newPositions.forEach((p, i) => {
      if (p === 'LM') lmIdxs.push(i);
      if (p === 'RM') rmIdxs.push(i);
      if (p === 'CM') cmIdxs.push(i);
    });
    const exactlyOneCM = cmIdxs.length === 1;
    const exactlyOneWing = (lmIdxs.length + rmIdxs.length) === 1;
    if (exactlyOneCM && exactlyOneWing) {
      const wingIndex = lmIdxs[0] ?? rmIdxs[0];
      newPositions[wingIndex] = 'CM';
      if (lineup && lineup[wingIndex] && lineup[wingIndex].miniPositionSelect) {
        const optsW = getAllowedMiniOptions({ formationName, positions: newPositions, rowIndex: wingIndex });
        lineup[wingIndex].miniPositionSelect.setOptions(optsW);
        lineup[wingIndex].miniPositionSelect.setValue('CM');
      }
    }
  }
  if (lineup && lineup[rowIndex] && lineup[rowIndex].miniPositionSelect) {
    const opts1 = getAllowedMiniOptions({ formationName, positions: newPositions, rowIndex });
    lineup[rowIndex].miniPositionSelect.setOptions(opts1);
    lineup[rowIndex].miniPositionSelect.setValue(selectedOpt.value);
  }
  if (typeof afterChange === 'function') afterChange(newPositions);
  return newPositions;
}
  function mapCustomStyleToStyleId(customValue) {
    return customValue in STYLE_VALUES ? customValue : 'norm';
  }
  function parseWeatherFromPreview() {
    const weatherDiv = Array.from(document.querySelectorAll('div.lh16')).find(div =>
      div.textContent.includes('Прогноз погоды:')
    );
    if (!weatherDiv) return null;
    const text = weatherDiv.textContent;
    const weatherMatch = text.match(/Прогноз погоды:.*?([а-яё\- ]+),/i);
    const weather = weatherMatch ? weatherMatch[1].trim() : '';
    const tempMatch = text.match(/, ([\d\-]+)[°]/);
    let temperature = '';
    if (tempMatch) {
      const tempStr = tempMatch[1].trim();
      if (tempStr.includes('-')) temperature = parseInt(tempStr.split('-')[0]);
      else temperature = parseInt(tempStr);
    }
    return { weather, temperature, icon: weatherDiv.querySelector('img')?.src || '' };
  }
class FormationManager {
  constructor(formations) { this.formations = formations; this.formationNames = Object.keys(formations); }
  getPositions(formationName) { return this.formations[formationName] || []; }
  getAllFormations() { return this.formationNames; }
}
  function logPlayerWeatherCoef({ player, customStyleValue, strength }) {
    const wt = getCurrentWeatherFromUI();
    if (!wt) {
      console.log('[WeatherCoef] UI погоды не найден. Пропускаю логирование.');
      return;
    }
    const styleId = mapCustomStyleToStyleId(customStyleValue);
    const styleNumeric = STYLE_VALUES[styleId] ?? 0;
    getWeatherStrengthValueCached(styleNumeric, wt.temperature, wt.weather, strength, (res) => {
      if (!res || !res.found) {
        console.log('[WeatherCoef] not found', {
          player: player?.name, playerId: player?.id, style: styleId, styleNumeric,
          weather: wt.weather, temperature: wt.temperature, strength, error: res?.error,
          normalizedTried: res?.normalizedTried, availableTempsInRange: res?.availableTempsInRange
        });
      } else {
        console.log('[WeatherCoef] found', {
          player: player?.name, playerId: player?.id, style: styleId, styleNumeric,
          weather: res.details.weather, temperature: res.details.temperature,
          requestedTemperature: res.details.requestedTemperature, wasNormalized: res.details.wasNormalized,
          range: res.details.range, rangeTemps: res.details.rangeTemps, strength: res.details.strength,
          weatherStr: res.weatherStr
        });
      }
    });
  }
  function getCurrentWeatherFromUI() {
    const ui = document.getElementById('vsol-weather-ui');
    if (!ui) return null;
    const selects = ui.querySelectorAll('select');
    if (selects.length < 2) return null;
    return {
      weather: selects[0].value,
      temperature: Number((selects[1].value || '').replace('°','')) || 0
    };
  }
// --- MAIN LINEUP BLOCK ---
function createTeamLineupBlock(players, initialFormationName = "4-4-2") {
  const lineup = [];
  const selectedPlayerIds = new Set();
  const table = document.createElement('table');
  table.className = 'orders-table';
  const rowsCount = 11;
  let formationName = initialFormationName;
  let positions = FORMATIONS[formationName];
  function buildPlaceholder(posValue) {
    return POSITION_PLACEHOLDERS[posValue] || 'выберите игрока:';
  }
  function getFilteredPlayersForRow(posValue, currentValue) {
    let pool;
    if (posValue === 'GK') {
      pool = players.filter(p => p.mainPos === 'GK' || p.secondPos === 'GK');
    } else {
      pool = players.filter(p => p.mainPos !== 'GK' && p.secondPos !== 'GK');
    }
    const otherSelected = Array.from(selectedPlayerIds).filter(id => id !== currentValue);
    pool = pool.filter(p => !otherSelected.includes(String(p.id)));
    pool.sort((a, b) => (Number(b.realStr || 0) - Number(a.realStr || 0)));
    return pool;
  }
  function toOptionLabel(p) {
    const pos = [p.mainPos, p.secondPos].filter(Boolean).join('/');
    const percent = (Number(p.form) || 0) + '%';
    const rs = Number(p.realStr) || 0;
    return `${p.name.padEnd(16, ' ')} ${pos.padEnd(6, ' ')} ${percent.padStart(3, ' ')}   ${rs}`;
  }
  function updatePlayerSelectOptions() {
    lineup.forEach(slot => {
      const currentVal = slot.getValue();
      const pool = getFilteredPlayersForRow(slot.posValue, currentVal);
      const placeholder = buildPlaceholder(slot.posValue);
      const opts = pool.map(p => ({ value: String(p.id), label: toOptionLabel(p) }));
      slot.setOptions(opts);
      if (!currentVal || !pool.some(p => String(p.id) === currentVal)) {
        slot.setValue('', '');
        if (typeof slot.setPlaceholder === 'function') slot.setPlaceholder(placeholder);
      }
    });
    if (typeof updateCaptainOptionsProxy === 'function') updateCaptainOptionsProxy();
    if (typeof window.__vs_onLineupChanged === 'function') window.__vs_onLineupChanged();
  }
  let captainSelectRef = null;
  function attachCaptainSelect(ref) { captainSelectRef = ref; }
  function updateCaptainOptionsProxy() {
    if (!captainSelectRef) return;
    const inLineupIds = new Set(lineup.map(s => s.getValue()).filter(Boolean));
    const available = players.filter(p => inLineupIds.has(String(p.id)));
    const dummyEntries = lineup.map(slot => {
      const pid = slot.getValue && slot.getValue();
      if (!pid) return null;
      const pl = players.find(pp => String(pp.id) === String(pid));
      return pl ? { player: pl } : null;
    });
    const prev = captainSelectRef.value;
    captainSelectRef.innerHTML = '<option value="">— Не выбран —</option>';
    available.forEach(p => {
      const percent = estimateCaptainPercent(p, dummyEntries);
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} — ${percent >= 0 ? '+' : ''}${(percent * 100).toFixed(2)}%`;
      captainSelectRef.appendChild(opt);
    });
    if (prev && Array.from(captainSelectRef.options).some(o => o.value === prev)) {
      captainSelectRef.value = prev;
    }
  }
  for (let row = 0; row < rowsCount; row++) {
    const tr = document.createElement('tr');
    const tdPos = document.createElement('td');
    const tdSel = document.createElement('td');
    let mini = null;
    const miniOpts = getAllowedMiniOptions({ formationName, positions, rowIndex: row });
    const initialPos = positions[row];
    if (row === 0) {
      tdPos.className = 'order';
      tdPos.style.backgroundColor = '#FFFFBB';
      tdPos.textContent = 'GK';
    } else {
      tdPos.className = 'txt mini-pos-cell';
      mini = createMiniPositionSelect({
        options: miniOpts,
        bg: '#FFFFBB',
        onChange: (selectedOpt) => {
          const currentPositions = lineup.map(s => s.posValue || '');
          const updated = onMiniPositionChange({
            formationName,
            positions: currentPositions,
            rowIndex: row,
            selectedOpt,
            lineup,
            afterChange: (newPositions) => {
              newPositions.forEach((p, i) => { lineup[i].posValue = p; });
              selectedPlayerIds.clear();
              lineup.forEach(s => { const v = s.getValue(); if (v) selectedPlayerIds.add(v); });
              updatePlayerSelectOptions();
              if (typeof updateCaptainOptionsProxy === 'function') updateCaptainOptionsProxy();
              if (typeof window.__vs_onLineupChanged === 'function') window.__vs_onLineupChanged();
            }
          });
          lineup[row].posValue = updated[row];
        }
      });
      const miniSel = mini.el.querySelector('.select2-selection');
      if (miniSel) {
        miniSel.style.height = '20px';
        miniSel.style.minHeight = '20px';
        miniSel.style.lineHeight = '18px';
      }
      if (miniOpts[0]) mini.setValue(miniOpts[0].value);
      tdPos.appendChild(mini.el);
    }
    const placeholder = buildPlaceholder(initialPos);
    const orders = createOrdersSelect({ placeholder, options: [] });
    orders.setPlaceholder(placeholder);
    orders.setValue('', '');
    const rendered = orders.el.querySelector('.select2-selection__rendered');

    if (rendered) {
      rendered.style.textAlign = 'left';
      rendered.style.justifyContent = 'flex-start';
    }
    const styleSelect = createCustomStyleSelect((styleValue) => {
      slotApi.customStyleValue = styleValue;
      const playerId = slotApi.getValue && slotApi.getValue();
      const player = players.find(p => String(p.id) === String(playerId));
      if (player) {
        logPlayerWeatherCoef({
          player,
          customStyleValue: slotApi.customStyleValue || 'norm',
          strength: Number(player.realStr) || 0
        });
      }
    });
    styleSelect.style.display = 'inline-block';
    styleSelect.style.verticalAlign = 'top';
    const styleSelSelected = styleSelect.querySelector('.selected');
    if (styleSelSelected) {
      styleSelSelected.style.height = '20px';
      styleSelSelected.style.minHeight = '20px';
      styleSelSelected.style.lineHeight = '18px';
      styleSelSelected.style.padding = '1px 4px';
      styleSelSelected.style.boxSizing = 'border-box';
    }
    const slotApi = {
      rowIndex: row,
      posValue: initialPos,
      getValue: () => orders.getValue(),
      setValue: (v, label) => orders.setValue(v, label),
      setOptions: (opts) => orders.setOptions(opts),
      setPlaceholder: (ph) => orders.setPlaceholder(ph),
      customStyleValue: 'norm',
      miniPositionSelect: mini
    };
    orders.el.addEventListener('click', (e) => e.stopPropagation());
    const onChangePlayer = (value) => {
      selectedPlayerIds.clear();
      lineup.forEach(s => { const v = s.getValue(); if (v) selectedPlayerIds.add(v); });
      updatePlayerSelectOptions();
      const player = players.find(p => String(p.id) === value);
      if (player) {
        logPlayerWeatherCoef({
          player,
          customStyleValue: slotApi.customStyleValue || 'norm',
          strength: Number(player.realStr) || 0
        });
      }
    };
    const origSetOptions = slotApi.setOptions.bind(slotApi);
    slotApi.setOptions = (opts) => {
      origSetOptions(opts);
      const dropdown = orders.el.querySelector('.orders-dropdown');
      if (dropdown) {
        dropdown.querySelectorAll('.orders-option').forEach(div => {
          const val = div.dataset.value;
          if (val) {
            div.addEventListener('click', () => onChangePlayer(val), { once: true });
          }
        });
      }
    };
    tdSel.appendChild(orders.el);
    const spacer = document.createElement('span');
    spacer.style.display = 'inline-block';
    spacer.style.width = '6px';
    tdSel.appendChild(spacer);
    tdSel.appendChild(styleSelect);
    tr.appendChild(tdPos);
    tr.appendChild(tdSel);
    table.appendChild(tr);
    lineup.push(slotApi);
  }
  function applyFormation(newFormationName) {
    formationName = newFormationName || formationName;
    positions = FORMATIONS[formationName];
    if (!Array.isArray(positions)) return;
    lineup.forEach((slot, idx) => {
      const newPos = positions[idx] || '';
      slot.posValue = newPos;
      if (idx > 0 && slot.miniPositionSelect) {
        const opts = getAllowedMiniOptions({ formationName, positions, rowIndex: idx });
        slot.miniPositionSelect.setOptions(opts);
        const exists = opts.some(o => o.value === slot.posValue);
        if (!exists && opts[0]) {
          slot.posValue = opts[0].value;
          slot.miniPositionSelect.setValue(opts[0].value);
        } else {
          slot.miniPositionSelect.setValue(slot.posValue);
        }
      }
    });
    selectedPlayerIds.clear();
    lineup.forEach(s => { const v = s.getValue(); if (v) selectedPlayerIds.add(v); });
    updatePlayerSelectOptions();
  }
  updatePlayerSelectOptions();
  return {
    block: table,
    lineup,
    updatePlayerSelectOptions,
    attachCaptainSelect,
    applyFormation,
    getFormationName() { return formationName; }
  };
}

// --- CAPTAIN AND HELPERS ---
function refreshCaptainOptions(lineupBlock, players) {
  const sel = lineupBlock.captainSelect;
  if (!sel) return;
  const inLineupIds = new Set(lineupBlock.lineup.map(s => s.getValue()).filter(Boolean));
  const available = players.filter(p => inLineupIds.has(String(p.id)));
  const dummyEntries = lineupBlock.lineup.map(slot => {
    const pid = slot.getValue && slot.getValue();
    if (!pid) return null;
    const pl = players.find(p => String(p.id) === String(pid));
    return pl ? { player: pl } : null;
  });
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Не выбран —</option>';
  available.forEach(p => {
    const percent = estimateCaptainPercent(p, dummyEntries);
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} — ${percent >= 0 ? '+' : ''}${(percent * 100).toFixed(2)}%`;
    sel.appendChild(opt);
  });
  if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
}

function makeCaptainRow(lineupBlock) {
  const rowWrap = document.createElement('div');
  rowWrap.className = 'vs-captain-row';
  const tbl = document.createElement('table');
  tbl.className = 'vs-captain-table';
  const tr = document.createElement('tr');
  const tdIcon = document.createElement('td');
  tdIcon.className = 'qt vs-captain-cell-icon';
  tdIcon.title = 'Капитан команды';
  tdIcon.innerHTML = '<img src="pics/captbig.png" style="vertical-align:top">';
  tr.appendChild(tdIcon);
  const tdSel = document.createElement('td');
  tdSel.className = 'vs-captain-cell-select';
  const select = document.createElement('select');
  select.className = 'vs-captain-select';
  select.innerHTML = '<option value="">— Не выбран —</option>';
  tdSel.appendChild(select);
  tr.appendChild(tdSel);
  tbl.appendChild(tr);
  rowWrap.appendChild(tbl);
  lineupBlock.captainSelect = select;
  lineupBlock.attachCaptainSelect(select);
  return rowWrap;
}

// --- SETTINGS BLOCK ---
function createDefenceTypeSelector(team, onChange) {
  const select = document.createElement('select');
  select.className = 'defence-type-select';
  select.innerHTML = `<option value="zonal">Зональный</option><option value="man">Персональный</option>`;
  select.value = team.defenceType || 'zonal';
  select.style.background = 'transparent';
  select.addEventListener('change', () => {
    team.defenceType = select.value;
    if (typeof onChange === 'function') onChange();
  });
  select.setHighlight = function(status) {
    const WIN_BG = 'rgb(224, 255, 224)';
    const LOSE_BG = 'rgb(255, 208, 208)';
    const NEUTRAL = 'transparent';
    select.style.background = status === 'win' ? WIN_BG : (status === 'lose' ? LOSE_BG : NEUTRAL);
  };
  return select;
}

function createTeamSettingsBlock(team, sideLabel, onChange) {
  if (sideLabel === 'home') {
    if (!window.homeTeam) window.homeTeam = { defenceType: 'zonal', rough: 'clean', morale: 'normal' };
    team = window.homeTeam;
  } else {
    if (!window.awayTeam) window.awayTeam = { defenceType: 'zonal', rough: 'clean', morale: 'normal' };
    team = window.awayTeam;
  }
  const styleSelector = createStyleSelector();
  const formationManager = new FormationManager(FORMATIONS);
  const formationSelector = createFormationSelector(formationManager);
  if (team.style) styleSelector.value = team.style;
  styleSelector.addEventListener('change', () => {
    team.style = styleSelector.value;
    if (typeof onChange === 'function') onChange();
  });
  if (team.formation && [...formationSelector.options].some(o => o.value === team.formation)) {
    formationSelector.value = team.formation;
  }
  formationSelector.addEventListener('change', () => {
    team.formation = formationSelector.value;
    if (typeof onChange === 'function') onChange();
  });
  const block = document.createElement('div');
  block.style.marginBottom = '8px';
  block.style.display = 'flex';
  block.style.flexDirection = 'column';
  block.style.alignItems = 'flex-start';
  const styleDiv = document.createElement('div');
  styleDiv.style.marginBottom = '8px';
  const styleLabel = document.createElement('label');
  styleLabel.textContent = 'стиль: ';
  styleLabel.appendChild(styleSelector);
  styleDiv.appendChild(styleLabel);
  block.appendChild(styleDiv);
  const formationDiv = document.createElement('div');
  const formationLabel = document.createElement('label');
  formationLabel.textContent = 'формация: ';
  const formationHelpBtn = document.createElement('button');
  formationHelpBtn.textContent = '?';
  formationHelpBtn.style.marginLeft = '4px';
  formationHelpBtn.title = 'Подсказка по формации';
  formationHelpBtn.onclick = function(e) {
    e.preventDefault();
    alert('• В 4-2-4 крайние CM могут меняться на LM/RM синхронно и обратно.\n• При отсутствии AM: LM↔LW и RM↔RW доступны.\n• CF в 4-2-4 может стать ST.');
  };
  formationLabel.appendChild(formationSelector);
  formationLabel.appendChild(formationHelpBtn);
  formationDiv.appendChild(formationLabel);
  block.appendChild(formationDiv);
  const tacticDiv = document.createElement('div');
  const tacticLabel = document.createElement('label');
  tacticLabel.textContent = 'тактика: ';
  const tacticSelect = createDummySelect();
  tacticLabel.appendChild(tacticSelect);
  tacticDiv.appendChild(tacticLabel);
  block.appendChild(tacticDiv);
  const defenseDiv = document.createElement('div');
  const defenseLabel = document.createElement('label');
  defenseLabel.textContent = 'вид защиты: ';
  const defenseSelect = createDefenceTypeSelector(team, onChange);
  defenseLabel.appendChild(defenseSelect);
  defenseDiv.appendChild(defenseLabel);
  block.appendChild(defenseDiv);
  if (team === window.homeTeam) window.homeDefenceTypeSelect = defenseSelect;
  if (team === window.awayTeam) window.awayDefenceTypeSelect = defenseSelect;
  const roughDiv = document.createElement('div');
  const roughLabel = document.createElement('label');
  roughLabel.textContent = 'грубость: ';
  const roughSelect = createRoughSelector(team, onChange);
  roughLabel.appendChild(roughSelect);
  roughDiv.appendChild(roughLabel);
  block.appendChild(roughDiv);
  if (team === window.homeTeam) window.homeRoughSelect = roughSelect;
  if (team === window.awayTeam) window.awayRoughSelect = roughSelect;
  const moraleDiv = document.createElement('div');
  const moraleLabel = document.createElement('label');
  moraleLabel.textContent = 'настрой: ';
  const moraleSelect = createMoraleSelector(team, onChange);
  moraleLabel.appendChild(moraleSelect);
  moraleDiv.appendChild(moraleLabel);
  block.appendChild(moraleDiv);
  if (team === window.homeTeam) window.homeMoraleSelect = moraleSelect;
  if (team === window.awayTeam) window.awayMoraleSelect = moraleSelect;
  team._styleSelector = styleSelector;
  team._formationSelector = formationSelector;
  return block;
}

// --- MAIN LOGIC ---
(function() {
  'use strict';
      async function init() {
    replaceTeamIcons();
    const teamLinks = document.querySelectorAll('table.tobl a[href^="roster.php?num="]');
    if (teamLinks.length < 2) return;
    const homeTeamId = new URL(teamLinks[0].href).searchParams.get('num');
    const awayTeamId = new URL(teamLinks[1].href).searchParams.get('num');
    if (!homeTeamId || !awayTeamId) return;
    let tournamentType;
    try {
      const info = parseMatchInfo(document.body.innerHTML);
      tournamentType = info.tournamentType;
    } catch (e) {
      alert(e.message);
      return;
    }
    const [homePlayers, awayPlayers] = await Promise.all([
      loadTeamRoster(homeTeamId, tournamentType),
      loadTeamRoster(awayTeamId, tournamentType)
    ]);
    const oldUI = document.getElementById('vsol-calculator-ui');
    if (oldUI) oldUI.remove();
    const ui = createUI(null, null, homePlayers, awayPlayers);
    const comparisonTable = document.querySelector('table.tobl');
    if (comparisonTable && comparisonTable.parentNode) {
      comparisonTable.parentNode.insertBefore(ui, comparisonTable.nextSibling);
    }
  }




  function createWeatherUI(defaultWeather, defaultTemp, iconUrl) {
    const container = document.createElement('div');
    container.id = 'vsol-weather-ui';
    container.className = 'lh16';
    if (iconUrl) {
      const iconImg = document.createElement('img');
      iconImg.src = iconUrl;
      iconImg.height = 16;
      iconImg.style.verticalAlign = 'top';
      iconImg.style.padding = '0 3px 0 0';
      container.appendChild(iconImg);
    }
    const WEATHER_OPTIONS = ["очень жарко","жарко","солнечно","облачно","пасмурно","дождь","снег"];
    const weatherSel = document.createElement('select');
    WEATHER_OPTIONS.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w; opt.textContent = w; weatherSel.appendChild(opt);
    });
    const tempSel = document.createElement('select');
    function fillTempOptions(weather, selectedTemp) {
      tempSel.innerHTML = '';
      const WEATHER_TEMP_MAP = {
        "очень жарко": [30, 26],
        "жарко": [29, 15],
        "солнечно": [29, 10],
        "облачно": [25, 5],
        "пасмурно": [20, 1],
        "дождь": [15, 1],
        "снег": [4, 0]
      };
      const [max, min] = WEATHER_TEMP_MAP[weather];
      for (let t = max; t >= min; t--) {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t + '°'; tempSel.appendChild(opt);
      }
      if (selectedTemp && parseInt(selectedTemp) >= min && parseInt(selectedTemp) <= max) {
        tempSel.value = selectedTemp;
      }
    }
    weatherSel.value = defaultWeather && WEATHER_OPTIONS.includes(defaultWeather) ? defaultWeather : WEATHER_OPTIONS[0];
    fillTempOptions(weatherSel.value, defaultTemp);
    weatherSel.addEventListener('change', function() { fillTempOptions(weatherSel.value); });
    const weatherLabel = document.createElement('label');
    weatherLabel.textContent = 'Погода: '; weatherLabel.appendChild(weatherSel);
    const tempLabel = document.createElement('label');
    tempLabel.textContent = 'Температура: '; tempLabel.appendChild(tempSel);
    container.appendChild(weatherLabel);
    container.appendChild(tempLabel);
    const mainTable = document.querySelector('table.wst.tobl');
    if (mainTable && mainTable.parentNode) {
      mainTable.parentNode.insertBefore(container, mainTable.nextSibling);
    } else {
      document.body.prepend(container);
    }
    return {
      container,
      getWeather: () => weatherSel.value,
      getTemperature: () => Number(tempSel.value),
      setWeather: (w) => { weatherSel.value = w; fillTempOptions(w); },
      setTemperature: (t) => { tempSel.value = t; }
    };
  }

  function parseMatchInfo(html) {
    const typeRegex = /(?:Чемпионат|Кубок межсезонья|Кубок страны|Кубок вызова|Товарищеский матч)/i;
    const typeMatch = html.match(typeRegex);
    let tournamentType = null;
    if (typeMatch) {
      const t = typeMatch[0].toLowerCase();
      if (t.includes('чемпионат')) tournamentType = 'championship';
      else if (t.includes('межсезонья')) tournamentType = 'preseason_cup';
      else if (t.includes('страны')) tournamentType = 'national_cup';
      else if (t.includes('вызова')) tournamentType = 'challenge_cup';
      else if (t.includes('товарищеский')) tournamentType = 'friendly';
    } else {
      throw new Error('Неизвестный тип турнира');
    }
    return { tournamentType };
  }
  function extractPlayersFromPlrdat(plrdat) {
    return plrdat.map(p => ({
      id: p[0],
      name: `${p[2]} ${p[3]}`,
      mainPos: p[6],
      secondPos: p[7],
      age: p[9],
      baseStrength: p[10],
      fatigue: p[12],
      form: p[13],
      form_mod: p[14],
      realStr: p[15],
      abilities: `${p[16]} ${p[17]} ${p[18]} ${p[19]}`,
      real_sign: p[32],
      transfer: p[38],
      training: p[44]
    }));
  }
  function extractPlrdatFromHTML(html) {
    const match = html.match(/var plrdat\s*=\s*\[(.*?)\];/s);
    if (!match) return [];
    const arrText = match[1];
    const items = [];
    const regex = /new jPlayer\(([\s\S]*?)\),?/g;
    let m;
    while ((m = regex.exec(arrText)) !== null) {
      try {
        const arr = eval(`[${m[1]}]`);
        items.push(arr);
      } catch (e) { console.log('Ошибка парсинга игрока:', e, m[1]); }
    }
    return items;
  }
  function loadTeamRoster(teamId, tournamentType) {
    const sortMap = { friendly:1, preseason_cup:2, championship:3, national_cup:4, challenge_cup:47 };
    const sort = sortMap[tournamentType];
    if (!sort) return Promise.reject(new Error('Неизвестный тип турнира'));
    const url = `https://www.virtualsoccer.ru/roster.php?num=${teamId}&sort=${sort}`;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        onload: function (response) {
          if (response.status !== 200) { resolve([]); return; }
          try {
            const rawPlayers = extractPlrdatFromHTML(response.responseText);
            if (!rawPlayers.length) { resolve([]); return; }
            const players = extractPlayersFromPlrdat(rawPlayers);
            resolve(players);
          } catch (error) { reject(error); }
        },
        onerror: function (err) { reject(err); }
      });
    });
  }
  function replaceTeamIcons() {
    const divs = Array.from(document.querySelectorAll('div[style*="pics/teams32"]'));
    divs.forEach(div => {
      const style = div.getAttribute('style');
      const m = style.match(/url\(pics\/teams32\/(\d+\.png\?[\d]+)\)/);
      if (!m) return;
      const imgName = m[1];
      const teamId = imgName.match(/^(\d+)\.png/)[1];
      const query = imgName.split('?')[1] || '';
      let align = 'left';
      if (style.includes('float:right')) align = 'right';
      const img = document.createElement('img');
      img.src = `pics/teams80/${teamId}.png${query ? '?' + query : ''}`;
      img.setAttribute('hspace', '4');
      img.setAttribute('vspace', '0');
      img.setAttribute('border', '0');
      img.setAttribute('width', '80');
      img.setAttribute('align', align);
      img.setAttribute('alt', '');
      div.parentNode.replaceChild(img, div);
    });
  }
  function paintStyleSelectByCollision(selectEl, status) {
    const WIN_BG = 'rgb(224, 255, 224)';
    const LOSE_BG = 'rgb(255, 208, 208)';
    const NEUTRAL = 'transparent';
    if (!selectEl) return;
    selectEl.style.background = status === COLLISION_WIN ? WIN_BG : (status === COLLISION_LOSE ? LOSE_BG : NEUTRAL);
  }

  function setTeamState(state, styleSel, formationSel, captainSel, lineupBlock, players) {
    if (!state) return;
    if (state.style) styleSel.value = state.style;
    if (state.formation) formationSel.value = state.formation;
    if (state.mini && Array.isArray(state.mini)) {
      state.mini.forEach((miniVal, idx) => {
        if (lineupBlock.lineup[idx] && lineupBlock.lineup[idx].miniPositionSelect && miniVal) {
          lineupBlock.lineup[idx].miniPositionSelect.setValue(miniVal);
        }
      });
    }
    if (state.lineup && Array.isArray(state.lineup)) {
      state.lineup.forEach((pid, idx) => {
        if (lineupBlock.lineup[idx]) {
          const player = players.find(p => String(p.id) === String(pid));
          if (player) lineupBlock.lineup[idx].setValue(String(pid), player.name);
          else lineupBlock.lineup[idx].setValue('', '');
        }
      });
    }
    setTimeout(() => { if (state.captain) captainSel.value = state.captain; }, 100);
  }
  function createUI(homeTeam, awayTeam, homePlayers, awayPlayers) {
    const parsedWeather = parseWeatherFromPreview();
    const weatherUI = createWeatherUI(parsedWeather?.weather, parsedWeather?.temperature, parsedWeather?.icon);
    const container = document.createElement('div');
    container.id = 'vsol-calculator-ui';
    container.appendChild(weatherUI.container);
    const stadiumCapacity = parseStadiumCapacity() || 0;
    const attendanceUI = document.createElement('div');
    attendanceUI.id = 'vsol-attendance-ui';
    attendanceUI.className = 'lh16';
    const attendanceLabel = document.createElement('label');
    attendanceLabel.innerHTML = `Посещаемость: <img src="https://cdn-icons-png.flaticon.com/128/1259/1259792.png" style="vertical-align:top; padding:2px 3px 0 0" height="16">`;
    const attendanceInput = document.createElement('input');
    attendanceInput.type = 'number';
    attendanceInput.id = 'vs_home_attendance';
    attendanceInput.min = '0';
    attendanceInput.max = String(stadiumCapacity);
    attendanceInput.value = String(stadiumCapacity);
    attendanceInput.style.marginLeft = '4px';
    const capacitySpan = document.createElement('span');
    capacitySpan.className = 'capacity';
    capacitySpan.textContent = ` / ${stadiumCapacity}`;
    attendanceLabel.appendChild(attendanceInput);
    attendanceUI.appendChild(attendanceLabel);
    attendanceUI.appendChild(capacitySpan);
    container.appendChild(attendanceUI);
    const homeTeamObj = { defenceType: 'zonal', rough: 'clean', morale: 'normal' };
    const awayTeamObj = { defenceType: 'zonal', rough: 'clean', morale: 'normal' };
    window.homeTeam = homeTeamObj;
    window.awayTeam = awayTeamObj;
    const homeSettingsBlock = createTeamSettingsBlock(homeTeamObj, 'home', saveAllStates);
    const awaySettingsBlock = createTeamSettingsBlock(awayTeamObj, 'away', saveAllStates);
    const homeStyle = window.homeTeam._styleSelector;
    const awayStyle = window.awayTeam._styleSelector;
    const homeFormationSelect = window.homeTeam._formationSelector;
    const awayFormationSelect = window.awayTeam._formationSelector;
    const homeLineupBlock = createTeamLineupBlock(homePlayers);
    const awayLineupBlock = createTeamLineupBlock(awayPlayers);
    const homeCaptainRow = makeCaptainRow(homeLineupBlock);
    const awayCaptainRow = makeCaptainRow(awayLineupBlock);
window.homeStyle = homeStyle;
window.awayStyle = awayStyle;
window.homeFormationSelect = homeFormationSelect;
window.awayFormationSelect = awayFormationSelect;
window.homeLineupBlock = homeLineupBlock;
window.awayLineupBlock = awayLineupBlock;
    const homeSaved = loadTeamState(STORAGE_KEYS.home);
    const awaySaved = loadTeamState(STORAGE_KEYS.away);
    if (homeSaved) setTeamState(homeSaved, homeStyle, homeFormationSelect, homeLineupBlock.captainSelect, homeLineupBlock, homePlayers);
    if (awaySaved) setTeamState(awaySaved, awayStyle, awayFormationSelect, awayLineupBlock.captainSelect, awayLineupBlock, awayPlayers);
    // ✅ Восстановление morale — ПОСЛЕ создания селекторов
    if (homeSaved?.morale && window.homeMoraleSelect) {
      window.homeTeam.morale = homeSaved.morale;
      window.homeMoraleSelect.value = homeSaved.morale;
    }
    if (awaySaved?.morale && window.awayMoraleSelect) {
      window.awayTeam.morale = awaySaved.morale;
      window.awayMoraleSelect.value = awaySaved.morale;
    }

    window.__vs_onLineupChanged = () => {
      refreshCaptainOptions(homeLineupBlock, homePlayers);
      refreshCaptainOptions(awayLineupBlock, awayPlayers);
      saveAllStates();
    };
    const mainTable = document.createElement('table');
    mainTable.style.width = '750px';
    mainTable.style.margin = '0 auto 10px auto';
    mainTable.style.borderCollapse = 'separate';
    mainTable.style.tableLayout = 'fixed';
    const tr1 = document.createElement('tr');
    const homeCol1 = document.createElement('td');
    homeCol1.style.verticalAlign = 'top';
    homeCol1.style.width = '175px';
    homeCol1.appendChild(homeSettingsBlock);
    const fieldCol = document.createElement('td');
    fieldCol.style.width = '400px';
    fieldCol.style.height = '566px';
    fieldCol.style.background = "url('https://github.com/stankewich/vfliga_calc/blob/main/img/field_01.webp?raw=true') no-repeat center center";
    fieldCol.style.backgroundSize = 'contain';
    fieldCol.style.verticalAlign = 'top';
    const awayCol1 = document.createElement('td');
    awayCol1.style.verticalAlign = 'top';
    awayCol1.style.width = '175px';
    awayCol1.appendChild(awaySettingsBlock);
    tr1.appendChild(homeCol1);
    tr1.appendChild(fieldCol);
    tr1.appendChild(awayCol1);
    mainTable.appendChild(tr1);
    const lineupsTable = document.createElement('table');
    lineupsTable.style.width = '750px';
    lineupsTable.style.margin = '0 auto 10px auto';
    lineupsTable.style.borderCollapse = 'separate';
    lineupsTable.style.tableLayout = 'fixed';
    const tr2 = document.createElement('tr');
    const homeCol2 = document.createElement('td');
    homeCol2.style.verticalAlign = 'top';
    homeCol2.style.width = '393px';
    homeCol2.appendChild(homeCaptainRow);
    homeCol2.appendChild(homeLineupBlock.block);
    const awayCol2 = document.createElement('td');
    awayCol2.style.verticalAlign = 'top';
    awayCol2.style.width = '393px';
    awayCol2.appendChild(awayCaptainRow);
    awayCol2.appendChild(awayLineupBlock.block);
    tr2.appendChild(homeCol2);
    tr2.appendChild(awayCol2);
    lineupsTable.appendChild(tr2);
    const title = document.createElement('h3');
    title.textContent = 'Калькулятор силы';
    container.appendChild(title);
    container.appendChild(mainTable);
    container.appendChild(lineupsTable);
    const synergyWrap = document.createElement('div');
    synergyWrap.id = 'vsol-synergy-ui';
    function createSynergyBlock(labelText, inputId, blockId) {
      const block = document.createElement('div');
      block.className = 'vs-synergy-block';
      block.id = blockId;
      const label = document.createElement('label');
      label.setAttribute('for', inputId);
      label.textContent = labelText + ' ';
      const input = document.createElement('input');
      input.type = 'number';
      input.id = inputId;
      input.className = 'vs-synergy-input';
      input.min = '0';
      input.max = '100';
      input.step = '0.01';
      input.value = '0.00';
      label.appendChild(input);
      const hint = document.createElement('span');
      hint.className = 'vs-synergy-hint';
      block.appendChild(label);
      block.appendChild(hint);
      return { block, input };
    }
    const synergyHomeUI = createSynergyBlock('Сыгранность хозяев:', 'vs_synergy_home', 'vs-synergy-home');
    const synergyAwayUI = createSynergyBlock('Сыгранность гостей:', 'vs_synergy_away', 'vs-synergy-away');
    synergyWrap.appendChild(synergyHomeUI.block);
    synergyWrap.appendChild(synergyAwayUI.block);
    container.appendChild(synergyWrap);

    if (homeSaved && typeof homeSaved.synergyHomePercent !== 'undefined') {
      setSynergyPercentHome(homeSaved.synergyHomePercent);
    }
    if (awaySaved && typeof awaySaved.synergyAwayPercent !== 'undefined') {
      setSynergyPercentAway(awaySaved.synergyAwayPercent);
    }
    synergyHomeUI.input.addEventListener('input', () => { clampSynergyInput(synergyHomeUI.input); saveAllStates(); });
    synergyHomeUI.input.addEventListener('change', () => { clampSynergyInput(synergyHomeUI.input); saveAllStates(); });
    synergyAwayUI.input.addEventListener('input', () => { clampSynergyInput(synergyAwayUI.input); saveAllStates(); });
    synergyAwayUI.input.addEventListener('change', () => { clampSynergyInput(synergyAwayUI.input); saveAllStates(); });
    homeLineupBlock.applyFormation(homeFormationSelect.value || '4-4-2');
    awayLineupBlock.applyFormation(awayFormationSelect.value || '4-4-2');
    refreshCaptainOptions(homeLineupBlock, homePlayers);
    refreshCaptainOptions(awayLineupBlock, awayPlayers);
    function onStyleChange(repaintStyleCollision, saveAllStates) {
      repaintStyleCollision();
      saveAllStates();
    }
    function makeFormationHandler(lineupBlock, formationSelect, players, applyFormation, refreshCaptainOptions, saveAllStates) {
      return () => {
        applyFormation(lineupBlock.lineup, formationSelect.value, lineupBlock);
        refreshCaptainOptions(lineupBlock, players);
        saveAllStates();
      };
    }
    function makeCaptainHandler(saveAllStates) {
      return () => saveAllStates();
    }
    function repaintStyleCollision() {
      const homeTeamStyleId = homeStyle.value || 'norm';
      const awayTeamStyleId = awayStyle.value || 'norm';
      const info = getCollisionInfo(homeTeamStyleId, awayTeamStyleId);
      paintStyleSelectByCollision(homeStyle, info.teamStatus);
      paintStyleSelectByCollision(awayStyle, info.oppStatus);
    }
    homeStyle.addEventListener('change', () => onStyleChange(repaintStyleCollision, saveAllStates));
    awayStyle.addEventListener('change', () => onStyleChange(repaintStyleCollision, saveAllStates));
homeFormationSelect.addEventListener('change', () => {
    homeLineupBlock.applyFormation(homeFormationSelect.value);
    refreshCaptainOptions(homeLineupBlock, homePlayers);
    saveAllStates();
});
awayFormationSelect.addEventListener('change', () => {
    awayLineupBlock.applyFormation(awayFormationSelect.value);
    refreshCaptainOptions(awayLineupBlock, awayPlayers);
    saveAllStates();
});
    homeLineupBlock.captainSelect.addEventListener('change', makeCaptainHandler(saveAllStates));
    awayLineupBlock.captainSelect.addEventListener('change', makeCaptainHandler(saveAllStates));
    repaintStyleCollision();
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Очистить состав';
    clearBtn.style.marginTop = '15px';
    clearBtn.className = 'butn-red';
    clearBtn.style.padding = '8px 16px';
    clearBtn.onclick = () => {
      clearTeamState(STORAGE_KEYS.home);
      clearTeamState(STORAGE_KEYS.away);
      homeStyle.value = 'norm';
      awayStyle.value = 'norm';
      homeFormationSelect.value = Object.keys(FORMATIONS)[0];
      awayFormationSelect.value = Object.keys(FORMATIONS)[0];
      homeLineupBlock.applyFormation(homeFormationSelect.value);
      awayLineupBlock.applyFormation(awayFormationSelect.value);
      homeLineupBlock.lineup.forEach(slot => { slot.setValue('', ''); });
      awayLineupBlock.lineup.forEach(slot => { slot.setValue('', ''); });
      homeLineupBlock.captainSelect.value = '';
      awayLineupBlock.captainSelect.value = '';
      refreshCaptainOptions(homeLineupBlock, homePlayers);
      refreshCaptainOptions(awayLineupBlock, awayPlayers);
      repaintStyleCollision();
      setSynergyPercentHome(0);
      setSynergyPercentAway(0);
      saveAllStates();
    };
    container.appendChild(clearBtn);
    const btn = document.createElement('button');
    btn.textContent = 'Рассчитать силу';
    btn.style.marginTop = '15px';
    btn.className = 'butn-green';
    btn.style.padding = '8px 16px';
    btn.onclick = async () => {
      const wt = getCurrentWeatherFromUI();
      if (!wt) { alert('Не найдены элементы UI погоды'); return; }
      const stadiumCapacityLocal = stadiumCapacity;
      const homeAttendanceInput = document.getElementById('vs_home_attendance');
      const homeAttendance = homeAttendanceInput ? parseInt(homeAttendanceInput.value, 10) : stadiumCapacityLocal;
      const homeAttendancePercent = stadiumCapacityLocal ? Math.round((homeAttendance / stadiumCapacityLocal) * 100) : -1;
      const userSynergyHome = getSynergyPercentHome() / 100;
      const userSynergyAway = getSynergyPercentAway() / 100;
      const homeTeamStyleId = mapCustomStyleToStyleId(homeStyle.value);
      const awayTeamStyleId = mapCustomStyleToStyleId(awayStyle.value);
      async function computeTeamStrength(lineup, players, teamStyleId, sideLabel, opponentTeamStyleId, homeBonusPercent = -1, userSynergy = 0) {
        const teamRatings = parseTeamsRatingFromPage() || { home: 0, away: 0 };
        const moraleMode = (sideLabel === 'home' ? (window.homeTeam && window.homeTeam.morale) : (window.awayTeam && window.awayTeam.morale)) || 'normal';
        const moraleBounds = getMoraleBonusBounds({ homeRating: teamRatings.home, awayRating: teamRatings.away, sideLabel });
        const homeBonusValue = getHomeBonus(homeBonusPercent);
        const myStyleId = teamStyleId || 'norm';
        const oppStyleId = opponentTeamStyleId || 'norm';
        const inLineupPlayers = lineup.map(slot => {
          const id = slot.getValue && slot.getValue();
          return id ? players.find(p => String(p.id) === String(id)) : null;
        }).filter(Boolean);
        const { teamIBonusByPlayer, teamIBonusTotal } = getTeamIBonusForLineup(inLineupPlayers);
        const captainSelectEl = sideLabel === 'home' ? homeLineupBlock.captainSelect : awayLineupBlock.captainSelect;
        const { captainId, captainPlayer, dummyEntries } = buildCaptainContext(lineup, players, captainSelectEl);
        const teamCaptainPercent = estimateCaptainPercent(captainPlayer, dummyEntries) || 0;
        let captainBonus = 0;
        if (captainPlayer && teamCaptainPercent !== 0) {
          const captainRealStr = Number(captainPlayer.realStr) || 0;
          captainBonus = captainRealStr * teamCaptainPercent;
        }
        const { teamStatus, teamBonus } = getCollisionInfo(myStyleId, oppStyleId);
        const tasks = lineup.map(slot => new Promise(resolve => {
          const playerId = slot.getValue && slot.getValue();
          if (!playerId) return resolve(null);
          const player = players.find(p => String(p.id) === String(playerId));
          if (!player) return resolve(null);
          const playerCustomStyle = slot.customStyleValue || 'norm';
          const playerStyleId = KNOWN_STYLE_IDS.has(playerCustomStyle) ? playerCustomStyle : 'norm';
          const styleNumeric = STYLE_VALUES[playerStyleId] ?? 0;
          const requestedStrength = Number(player.baseStrength) || 0;
          getWeatherStrengthValueCached(styleNumeric, wt.temperature, wt.weather, requestedStrength, (res) => {
            if (!res || !res.found) {
              console.warn('[Calc] WeatherStrength not found', {
                side: sideLabel,
                player: player?.name,
                playerStyleId,
                teamStyleId: myStyleId,
                weather: wt.weather,
                temperature: wt.temperature,
                strengthRow: requestedStrength,
                error: res?.error
              });
              return resolve({ player, weatherStr: null, wasNormalized: false, playerStyleId, teamStyleId: myStyleId });
            }
            const ws = parseNumericWeatherStr(res.weatherStr);
            resolve({ player, weatherStr: (ws == null || ws === 0) ? null : ws, wasNormalized: !!res.details.wasNormalized, playerStyleId, teamStyleId: myStyleId });
          });
        }));
        const results = await Promise.all(tasks);
        let total = 0;
        let totalCollisionWinBonus = 0;
          let totalHomeBonus = 0;
        let totalChemistryBonus = 0;
        let totalLeadershipBonus = 0;
        let totalDefenceTypeBonus = 0;
        let totalMoraleBonus = 0;
          let  totalSynergyBonus = 0;
        const slotEntries = lineup.map((slot, idx) => {
          const playerId = slot.getValue && slot.getValue();
          const player = playerId ? players.find(p => String(p.id) === String(playerId)) : null;
          const matchPos = slot.posValue || null;
          return player ? { idx, slot, player, matchPos } : null;
        }).filter(Boolean);
        const team = {
          positions: slotEntries.map(e => e.matchPos),
          realStr: slotEntries.map(e => Number(e.player.realStr) || 0),
          contribution: slotEntries.map(e => 0),
          defenceType: (sideLabel === 'home' ? (window.homeTeam && window.homeTeam.defenceType) : (window.awayTeam && window.awayTeam.defenceType)) || 'zonal',
          rough: (sideLabel === 'home' ? (window.homeTeam && window.homeTeam.rough) : (window.awayTeam && window.awayTeam.rough)) || 'clean',
          morale: (sideLabel === 'home' ? (window.homeTeam && window.homeTeam.morale) : (window.awayTeam && window.awayTeam.morale)) || 'normal',
          log: [],
          name: sideLabel
        };
        const opponent = {
          positions: (sideLabel === 'home' ? (window.awayLineupBlock && window.awayLineupBlock.lineup.map(slot => slot.posValue)) : (window.homeLineupBlock && window.homeLineupBlock.lineup.map(slot => slot.posValue))) || []
        };
        const totalRoughBonus = roughBonus({ team, slotEntries }) || 0;
        defenceTypeBonus({ team, opponent });
        const bonusActive = team.contribution.some(v => v > 0);
        const defenceTypeWinStatus = bonusActive ? 'win' : 'lose';
        if (sideLabel === 'home' && window.homeDefenceTypeSelect) {
          window.homeDefenceTypeSelect.setHighlight(defenceTypeWinStatus);
        }
        if (sideLabel === 'away' && window.awayDefenceTypeSelect) {
          window.awayDefenceTypeSelect.setHighlight(defenceTypeWinStatus);
        }
        totalDefenceTypeBonus = team.contribution.reduce((s, v) => s + (Number(v) || 0), 0);
        const leadersByLine = { DEF: [], MID: [], ATT: [] };
        slotEntries.forEach(entry => {
          const line = getLineByMatchPos(entry.matchPos);
          if (!line) return;
          const abilities = parseAbilities(entry.player.abilities);
          const leaderAb = abilities.find(a => a.type === 'Л');
          if (!leaderAb) return;
          const lvl = Math.max(1, Math.min(4, Number(leaderAb.level) || 1));
          leadersByLine[line].push({ entry, level: lvl });
        });
        const leadershipBonusByPlayerId = new Map();
        ['DEF','MID','ATT'].forEach(line => {
          const leaders = leadersByLine[line];
          if (!leaders || leaders.length !== 1) return;
          const leader = leaders[0];
          const leaderRealStr = Number(leader.entry.player.realStr) || 0;
          const coeff = LEADERSHIP_LEVEL_COEFF[leader.level] || 0;
          const perPlayerBonus = leaderRealStr * coeff;
          slotEntries.forEach(entry => {
            const l = getLineByMatchPos(entry.matchPos);
            if (l !== line) return;
            const prev = leadershipBonusByPlayerId.get(String(entry.player.id)) || 0;
            leadershipBonusByPlayerId.set(String(entry.player.id), prev + perPlayerBonus);
          });
        });
        results.forEach(entry => {
          if (!entry || !entry.player) return;
          const idx = slotEntries.findIndex(e => String(e.player.id) === String(entry.player.id));
          if (idx < 0) return;
          const realStr = Number(entry.player.realStr) || 0;
          const baseStr = Number(entry.player.baseStrength) || 0;
          const abilityBonusesDetailed = getAbilitiesBonusesDetailed(entry.player.abilities, myStyleId);
          const abilitiesBonus = getAbilitiesBonusForStyleId(entry.player.abilities, myStyleId);
          const favoriteStyleBonus = getFavoriteStyleBonus(myStyleId, entry.playerStyleId);
          const ws = Number(entry.weatherStr);
          const chemistryBonus = getChemistryBonus(entry.player, inLineupPlayers, myStyleId);
          const chemistryBonusForPlayer = realStr * chemistryBonus;
          totalChemistryBonus += chemistryBonusForPlayer;
          if (!ws || ws === 0) {
            console.warn('[Calc] Skip player due to invalid WeatherStrength', {
              side: sideLabel, name: entry.player.name, realStr, baseStr, ws, abilitiesBonus
            });
            return;
          }
          const denom = ws / (baseStr || 1);
          if (!Number.isFinite(denom) || denom === 0) {
            console.warn('[Calc] Skip player due to invalid denominator', {
              side: sideLabel, name: entry.player.name, realStr, baseStr, ws, denom, abilitiesBonus
            });
            return;
          }
          const contribBase = realStr * denom;
          const totalBonus = abilitiesBonus + favoriteStyleBonus;
          const contribWithIndividualBonuses = contribBase * (1 + totalBonus);
          const isCaptain = captainId && String(entry.player.id) === String(captainId);
          const captainBonusForPlayer = isCaptain ? 0 : captainBonus;
          let collisionWinBonusForPlayer = 0;
          if (teamStatus === COLLISION_WIN && teamBonus > 0) {
            collisionWinBonusForPlayer = contribBase * teamBonus;
            totalCollisionWinBonus += collisionWinBonusForPlayer;
          }
          const homeBonusForPlayer = realStr * homeBonusValue;
          const defenceTypeBonusForPlayer = idx >= 0 ? (team.contribution[idx] || 0) : 0;
          const synergyBonus = getSynergyBonus(entry.player, inLineupPlayers, myStyleId, userSynergy);
          const synergyBonusForPlayer = contribBase * synergyBonus;
          const leadershipBonusForPlayer = leadershipBonusByPlayerId.get(String(entry.player.id)) || 0;
          const roughBonusForPlayer = idx >= 0 ? (team.roughContribution?.[idx] || 0) : 0;
          let moraleBonusForPlayer = getMoraleBonusForPlayer({ moraleMode, baseContrib: contribBase, bounds: moraleBounds });
          const contribution = contribWithIndividualBonuses
            + captainBonusForPlayer
            + collisionWinBonusForPlayer
            + chemistryBonusForPlayer
            + homeBonusForPlayer
            + leadershipBonusForPlayer
            + synergyBonusForPlayer
            + roughBonusForPlayer
            + defenceTypeBonusForPlayer
            + moraleBonusForPlayer;
          total += contribution;
          const iRecord = teamIBonusByPlayer.find(x => String(x.playerId) === String(entry.player.id));
          const teamIBonusValueForPlayer = iRecord ? iRecord.bonus : 0;
          console.log('[Calc] Player contribution', {
            side: sideLabel,
            name: entry.player.name,
            playerStyleId: entry.playerStyleId,
            teamStyleId: entry.teamStyleId,
            realStr,
            baseStr,
            weatherStr: ws,
            normalized: entry.wasNormalized,
            denom,
            contribBase,
            abilities: entry.player.abilities,
            abilitiesBonus,
            abilityBonuses: abilityBonusesDetailed,
            favoriteStyleBonus,
            teamIBonusValueForPlayer,
            teamCaptainPercent,
            captainBonusForPlayer,
            teamStatus,
            teamBonus,
            collisionWinBonusForPlayer,
            chemistryBonus,
            chemistryBonusForPlayer,
            homeBonusValue,
            homeBonusForPlayer,
            synergyBonus,
            synergyBonusForPlayer,
            roughBonusForPlayer,
            leadershipBonusForPlayer,
            moraleBonusForPlayer,
            contribution
          });
        });
        total += teamIBonusTotal;
        const nonCaptainCount = results.filter(entry => entry && entry.player && (!captainId || String(entry.player.id) !== String(captainId))).length;
        const totalCaptainBonus = (Number(captainBonus) || 0) * nonCaptainCount;
        console.log('[Calc] Team total', {
          side: sideLabel,
          teamIBonusByPlayer,
          teamIBonusTotal,
          teamCaptainPercent,
          captainBonus,
          nonCaptainCount,
          totalCaptainBonus,
          teamStatus,
          teamBonus,
          totalCollisionWinBonus,
          totalSynergyBonus,
          totalChemistryBonus,
          totalHomeBonus,
          totalDefenceTypeBonus,
          totalLeadershipBonus,
          totalRoughBonus,
          totalMoraleBonus,
          total
        });
        return total;
      }
      try {
        const [homeStrength, awayStrength] = await Promise.all([
          computeTeamStrength(homeLineupBlock.lineup, homePlayers, homeTeamStyleId, 'home', awayTeamStyleId, homeAttendancePercent, userSynergyHome),
          computeTeamStrength(awayLineupBlock.lineup, awayPlayers, awayTeamStyleId, 'away', homeTeamStyleId, -1, userSynergyAway)
        ]);
        const oldResult = container.querySelector('.vsol-result');
        if (oldResult) oldResult.remove();
        const resultDiv = document.createElement('div');
        resultDiv.className = 'vsol-result';
        resultDiv.style.marginTop = '15px';
        resultDiv.style.fontWeight = 'bold';
        resultDiv.innerHTML = `<div>Сила хозяев: <b>${Math.round(homeStrength)}</b></div><div>Сила гостей: <b>${Math.round(awayStrength)}</b></div>`;
        container.appendChild(resultDiv);
      } catch (e) {
        console.error('Ошибка расчёта:', e);
        alert('Ошибка при расчёте силы команд. Подробности в консоли.');
      }
    };
    container.appendChild(btn);
      window.saveAllStates = saveAllStates;
    return container;
  }
  init();
})();