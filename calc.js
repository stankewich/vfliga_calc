// ==UserScript==
// @name         Virtual Soccer Strength Calculator
// @namespace    http://tampermonkey.net/
// @version      2.10
// @description  Калькулятор силы команд для Virtual Soccer: погода, стилевые бонусы, “И”, коллизии, капитан, химия, домашний стадион и расширенный UI с логированием
// @author       Arne + GPT
// @match        https://www.virtualsoccer.ru/previewmatch.php*
// @connect      virtualsoccer.ru
// @grant        GM_xmlhttpRequest
// @grant        GM_log
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

/* ----------------------------- УТИЛИТЫ И БОНУСЫ ----------------------------- */
const COLLISION_NONE = 'none';
const COLLISION_WIN = 'win';
const COLLISION_LOSE = 'lose';

const collision_bonuses = {
  norm: null,
  sp:     { brit: 0.38 },
  bb:     { sp: 0.42 },
  brazil: { bb: 0.34 },
  tiki:   { kat: 0.36 },
  kat:    { brazil: 0.44 },
  brit:   { tiki: 0.40 }
};

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

// Допустимые типы умений и стили
const SUPPORTED_ABILITY_TYPES = new Set(['Ск','Г','Пд','Пк','Д','Км']);
const KNOWN_STYLE_IDS = new Set(['sp','brazil','tiki','bb','kat','brit','norm']);

function parseAbilities(abilitiesStr) {
  if (!abilitiesStr) return [];
  const regex = /([А-Яа-яA-Za-zЁё]{1,2})([1-4])/g;
  const res = [];
  let m;
  while ((m = regex.exec(abilitiesStr)) !== null) {
    let type = m[1];
    const level = Number(m[2]);
    type = type.replace('ё','е').replace('Ё','Е');
    if (type.length === 2) type = type[0].toUpperCase() + type[1].toLowerCase();
    else type = type.toUpperCase();
    if (level >= 1 && level <= 4) res.push({ type, level });
  }
  return res;
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

function parseNumericWeatherStr(value) {
  if (value == null) return null;
  const s = String(value).replace(',', '.').replace(/[^\d.-]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Домашний бонус: возвращает долю
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

/* -------------------------------- ОСНОВА СКРИПТА ------------------------------- */
(function() {
  'use strict';

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

  function pickClosest(target, nums) {
    if (!nums || !nums.length) return null;
    let best = nums[0], bestDiff = Math.abs(nums[0] - target);
    for (let i = 1; i < nums.length; i++) {
      const d = Math.abs(nums[i] - target);
      if (d < bestDiff || (d === bestDiff && nums[i] > best)) { best = nums[i]; bestDiff = d; }
    }
    return best;
  }

  function mapCustomStyleToStyleId(customValue) {
    return customValue in STYLE_VALUES ? customValue : 'norm';
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

  const WEATHER_TEMP_MAP = {
    "очень жарко": [30, 26],
    "жарко": [29, 15],
    "солнечно": [29, 10],
    "облачно": [25, 5],
    "пасмурно": [20, 1],
    "дождь": [15, 1],
    "снег": [4, 0]
  };
  const WEATHER_OPTIONS = Object.keys(WEATHER_TEMP_MAP);

  function getTempsForWeather(weather) {
    const [max, min] = WEATHER_TEMP_MAP[weather];
    let arr = [];
    for (let t = max; t >= min; t--) arr.push(t);
    return arr;
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

    const weatherSel = document.createElement('select');
    WEATHER_OPTIONS.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w; opt.textContent = w; weatherSel.appendChild(opt);
    });

    const tempSel = document.createElement('select');
    function fillTempOptions(weather, selectedTemp) {
      tempSel.innerHTML = '';
      getTempsForWeather(weather).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t + '°'; tempSel.appendChild(opt);
      });
      if (selectedTemp && getTempsForWeather(weather).includes(Number(selectedTemp))) {
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

  function fetchWeatherStyleInfo(style, callback) {
    const url = `https://www.virtualsoccer.ru/weather.php?step=1&style=${encodeURIComponent(style)}`;
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
          callback({ temperatures, strengthTable });
        } catch (e) {
          callback(null);
        }
      },
      onerror: function() { callback(null); }
    });
  }

  const STYLE_VALUES = {
    'sp': 1, 'brazil': 3, 'tiki': 4, 'bb': 2, 'kat': 5, 'brit': 6, 'norm': 0
  };

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

  const STYLE_LABELS = {
    'sp': 'спартаковский','brazil':'бразильский','tiki':'тики-така','bb':'бей-беги','kat':'катеначчо','brit':'британский','norm':'нормальный'
  };

  function removeInfoBlocks() {
    const HEADERS = [
      'Стоимость команд','Рейтинг силы команд','Сумма сил 17-ти лучших игроков',
      'Сумма сил 14-ти лучших игроков','Сумма сил 11-ти лучших игроков'
    ];
    const tds = Array.from(document.querySelectorAll('td')).filter(td =>
      HEADERS.includes(td.textContent.trim())
    );
    tds.forEach(td => {
      const tr = td.closest('tr'); if (!tr) return;
      const innerTable = tr.closest('table.nol'); if (!innerTable) return;
      const outerTd = innerTable.closest('td[colspan="9"]'); if (!outerTd) return;
      outerTd.remove();
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
    if (!sort) return Promise.reject(new Error('Неизвестный тип турнира для загрузки состава'));
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

  class PositionStrengthCalculator {
    getStrengthMultiplier(mainPos, secondPos, matchPos) {
      if (mainPos === matchPos || secondPos === matchPos) return 100;
      const bonusMap = {
        LB: [['LD', 'LM'], ['LM', 'LD']],
        DM: [['CD', 'CM'], ['CM', 'CD']],
        RB: [['RD', 'RM'], ['RM', 'RD']],
        LW: [['LF', 'LM'], ['LM', 'LF']],
        RW: [['RF', 'RM'], ['RM', 'RF']],
        AM: [['CF', 'CM'], ['CM', 'CF']]
      };
      if (bonusMap[matchPos]) {
        for (const [pos1, pos2] of bonusMap[matchPos]) {
          if ((mainPos === pos1 && secondPos === pos2) || (mainPos === pos2 && secondPos === pos1)) {
            return 105;
          }
        }
      }
      return 80;
    }
  }

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
  const BENCH_PLACEHOLDER = { GK: 'выберите запасного вратаря:', ANY: 'выберите запасного игрока:' };

  function getCurrentTeamState(styleSel, formationSel, captainSel, lineupBlock) {
    return {
      style: styleSel.value,
      formation: formationSel.value,
      captain: captainSel.value,
      lineup: lineupBlock.lineup.map(slot => slot.getValue()),
      mini: lineupBlock.lineup.map(slot => slot.miniPositionSelect ? slot.miniPositionSelect.getValue() : null)
    };
  }

  function setTeamState(state, styleSel, formationSel, captainSel, lineupBlock, players) {
    if (!state) return;
    if (state.style) styleSel.value = state.style;
    if (state.formation) formationSel.value = state.formation;
    if (typeof lineupBlock.updatePlayerSelectOptions === 'function') {
      formationSel.dispatchEvent(new Event('change'));
    }
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

  function getAllowedMiniOptions({ formationName, positions, rowIndex }) {
    const pos = positions[rowIndex]; if (!pos) return [];
    const counts = positions.reduce((acc, p, i) => {
      acc[p] = (acc[p] || 0) + 1;
      if (!acc.indexes) acc.indexes = {};
      if (!acc.indexes[p]) acc.indexes[p] = [];
      acc.indexes[p].push(i);
      return acc;
    }, {});
    const hasLW = positions.includes('LW');
    const hasRW = positions.includes('RW');
    const add = (arr, v) => { if (!arr.some(o => o.value === v)) arr.push({ value: v, label: v }); };
    const minIndex = (p) => (counts.indexes[p] || []).length ? Math.min(...counts.indexes[p]) : null;
    const maxIndex = (p) => (counts.indexes[p] || []).length ? Math.max(...counts.indexes[p]) : null;
    const cmIdxs = counts.indexes['CM'] || [];
    const cmCount = cmIdxs.length;
    const cmSorted = [...cmIdxs].sort((a,b)=>a-b);
    const cmMin1 = cmSorted[0] ?? null;
    const cmMin2 = cmSorted[1] ?? null;
    const cmMax = cmSorted.length ? cmSorted[cmSorted.length-1] : null;
    const dmIdxs = counts.indexes['DM'] || [];
    const dmCount = dmIdxs.length;
    const cdIdxs = counts.indexes['CD'] || [];
    const cdCount = cdIdxs.length;
    const cdMin = cdIdxs.length ? Math.min(...cdIdxs) : null;
    const cfIdxs = counts.indexes['CF'] || [];
    const cfCount = cfIdxs.length;
    const cfMin = cfIdxs.length ? Math.min(...cfIdxs) : null;
    const cfMax = cfIdxs.length ? Math.max(...cfIdxs) : null;
    const options = [];
    add(options, pos);
    const is424 = formationName === '4-2-4';
    const is361 = formationName === '3-6-1';

    switch (pos) {
      case 'LD': add(options, 'LB'); break;
      case 'RD': add(options, 'RB'); break;
      case 'CD':
        if (cdCount > 1 && rowIndex === cdMin) add(options, 'SW');
        break;
      case 'CM': {
        if (!is424) {
          let cmToDMAllowed = false;
          if ((dmCount < 2) && cmCount > 2 && (rowIndex === cmMin1 || rowIndex === cmMin2)) cmToDMAllowed = true;
          if ((dmCount < 2) && cmCount === 2 && rowIndex === cmMin1) cmToDMAllowed = true;
          if ((dmCount < 2) && cmCount === 1) cmToDMAllowed = true;
          if (cmToDMAllowed) add(options, 'DM');

          const noLWnoRW = !hasLW && !hasRW;
          const amAbsent = (counts['AM'] || 0) < 1;
          const isMaxCM = rowIndex === cmMax;
          const amAllowed = noLWnoRW && amAbsent && isMaxCM;
          if (amAllowed) add(options, 'AM');
        }
        if (is424) {
          const frCount = counts['FR'] || 0;
          if (frCount < 1 && rowIndex === cmMax) add(options, 'FR');
        }
        break;
      }
      case 'DM': {
        const canChangeThisDM = !(is361 && dmCount === 1);
        if (canChangeThisDM) {
          add(options, 'CM');
          const amAllowed = !is424 && (counts['AM'] || 0) < 1 && hasLW && hasRW;
          if (amAllowed) add(options, 'AM');
        }
        break;
      }
      case 'AM': { add(options, 'CM'); break; }
      case 'CF': {
        if (is424) {
          if (rowIndex === cfMax) add(options, 'ST');
        } else if (cfCount === 2) {
          if (rowIndex === cfMin) add(options, 'LF');
          if (rowIndex === cfMax) add(options, 'RF');
        } else if (cfCount === 3) {
          if (rowIndex === cfMax) add(options, 'RF');
        }
        break;
      }
      case 'ST': { add(options, 'CF'); break; }
      default: break;
    }
    return options;
  }

  class FormationManager {
    constructor(formations) { this.formations = formations; this.formationNames = Object.keys(formations); }
    getPositions(formationName) { return this.formations[formationName] || []; }
    getAllFormations() { return this.formationNames; }
  }

  function createStyleSelector() {
    const select = document.createElement('select');
    const order = ['norm','sp','tiki','brazil','brit','bb','kat'];
    const labels = {
      norm: 'нормальный', sp: 'спартаковский', tiki: 'тики-така',
      brazil: 'бразильский', brit: 'британский', bb: 'бей-беги', kat: 'катеначчо'
    };
    order.forEach(id => {
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = labels[id]; select.appendChild(opt);
    });
    return select;
  }

  function createFormationSelector(formationManager) {
    const select = document.createElement('select');
    formationManager.getAllFormations().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name; select.appendChild(opt);
    });
    return select;
  }

  function createFormationHelpButton() {
    const btn = document.createElement('button');
    btn.tabIndex = 201; btn.className = 'btn-help'; btn.style = 'margin: 1px 2px 0px;'; btn.innerHTML = '?';
    btn.onclick = function(e) {
      if (typeof hintpos === 'function') { hintpos($(this), 3, 'Формация', 350, 'left top', 'right bottom'); }
      else { alert('Подсказка по формации'); }
      return false;
    };
    return btn;
  }

  function createDummySelect() {
    const select = document.createElement('select');
    select.innerHTML = '<option value="">—</option>';
    return select;
  }

  function createTeamSettingsBlock(styleSelector, formationSelector, formationHelpBtn) {
    const block = document.createElement('div');
    block.style.marginBottom = '8px';
    block.style.display = 'flex';
    block.style.flexDirection = 'column';
    block.style.alignItems = 'flex-start';

    const styleDiv = document.createElement('div');
    styleDiv.style.marginBottom = '8px';
    const styleLabel = document.createElement('label');
    styleLabel.textContent = 'стиль: ';
    styleLabel.style.verticalAlign = 'middle';
    styleLabel.appendChild(styleSelector);
    styleDiv.appendChild(styleLabel);
    block.appendChild(styleDiv);

    const formationDiv = document.createElement('div');
    const formationLabel = document.createElement('label');
    formationLabel.style.marginLeft = '0';
    formationLabel.textContent = 'формация: ';
    formationLabel.style.verticalAlign = 'middle';
    formationLabel.appendChild(formationSelector);
    formationLabel.appendChild(formationHelpBtn);
    formationDiv.appendChild(formationLabel);
    block.appendChild(formationDiv);

    const tacticDiv = document.createElement('div');
    const tacticLabel = document.createElement('label');
    tacticLabel.textContent = 'тактика: ';
    tacticLabel.appendChild(createDummySelect());
    tacticDiv.appendChild(tacticLabel);
    block.appendChild(tacticDiv);

    const defenseDiv = document.createElement('div');
    const defenseLabel = document.createElement('label');
    defenseLabel.textContent = 'вид защиты: ';
    defenseLabel.appendChild(createDummySelect());
    defenseDiv.appendChild(defenseLabel);
    block.appendChild(defenseDiv);

    const roughDiv = document.createElement('div');
    const roughLabel = document.createElement('label');
    roughLabel.textContent = 'грубость: ';
    roughLabel.appendChild(createDummySelect());
    roughDiv.appendChild(roughLabel);
    block.appendChild(roughDiv);

    const moodDiv = document.createElement('div');
    const moodLabel = document.createElement('label');
    moodLabel.textContent = 'настрой: ';
    moodLabel.appendChild(createDummySelect());
    moodDiv.appendChild(moodLabel);
    block.appendChild(moodDiv);

    return block;
  }

  const PLAYER_STYLES = [
    { value: 'sp',    label: '',  icon: 'styles/o1.gif' },
    { value: 'brazil',label: '',  icon: 'styles/o3.gif' },
    { value: 'tiki',  label: '',  icon: 'styles/o4.gif' },
    { value: 'bb',    label: '',  icon: 'styles/o2.gif' },
    { value: 'kat',   label: '',  icon: 'styles/o5.gif' },
    { value: 'brit',  label: '',  icon: 'styles/o6.gif' },
    { value: 'norm',  label: '—', icon: '' }
  ];

  const HIDDEN_STYLE_MAP = { 1:'sp', 2:'bb', 3:'brazil', 4:'tiki', 5:'kat', 6:'brit', 7:'norm' };

  (function addCSS() {
    const css = `
#vsol-calculator-ui .vs-captain-row { margin: 0 0 8px 0; display: flex; align-items: center; }
#vsol-calculator-ui .vs-captain-table { border-collapse: separate; }
#vsol-calculator-ui .vs-captain-cell-icon { height: 20px; background-color: #FFFFBB; text-align: center; font-family: "Courier New", monospace; font-size: 11px; vertical-align: middle; padding: 0 6px; }
#vsol-calculator-ui .vs-captain-cell-select { padding-left: 6px; }
#vsol-calculator-ui .vs-captain-select { min-width: 260px; height: 20px; line-height: 18px; font-size: 14px; padding: 1px 4px; box-sizing: border-box; }

#vsol-calculator-ui { margin: 20px 0; padding: 15px; background: #f9f9f9; border: 1px solid #ccc; border-radius: 6px; }

/* Погода */
#vsol-calculator-ui #vsol-weather-ui {
  padding: 8px 0; margin-bottom: 8px; background: #f9f9f9; border: 1px solid #ccc; border-radius: 6px;
  display: flex; gap: 12px; align-items: center;
}
#vsol-calculator-ui #vsol-weather-ui label { display: inline-flex; align-items: center; gap: 6px; }
#vsol-calculator-ui #vsol-weather-ui select {
  height: 20px; min-height: 20px; line-height: 18px; font-size: 11px; padding: 1px 4px; box-sizing: border-box;
}

/* Посещаемость */
#vsol-calculator-ui #vsol-attendance-ui {
  padding: 8px 0; margin-bottom: 8px; background: #f9f9f9; border: 1px solid #ccc; border-radius: 6px;
  display: flex; gap: 12px; align-items: center;
}
#vsol-calculator-ui #vsol-attendance-ui label { display: inline-flex; align-items: center; gap: 6px; }
#vsol-calculator-ui #vsol-attendance-ui input[type="number"] {
  height: 20px; line-height: 18px; font-size: 11px; padding: 1px 4px; box-sizing: border-box; width: 90px;
}
#vsol-calculator-ui #vsol-attendance-ui .capacity { color: #888; font-size: 12px; }

/* Таблица составов */
#vsol-calculator-ui .orders-table { width: 393px; border-collapse: separate; table-layout: fixed; }
#vsol-calculator-ui .orders-table td { vertical-align: middle; }
#vsol-calculator-ui .order { width: 40px; text-align: center; font-weight: bold; }
#vsol-calculator-ui .txt { width: 40px; text-align: center; }

/* Псевдо-select2 */
#vsol-calculator-ui .select2 { display: inline-block; position: relative; }
#vsol-calculator-ui .select2-container--orders { width: 271px; }
#vsol-calculator-ui .select2-selection {
  display: flex; align-items: center; justify-content: space-between; border: 1px solid #aaa;
  padding: 1px 4px; height: 20px; min-height: 20px; line-height: 18px; font-size: 11px; box-sizing: border-box; cursor: pointer; background: #fff;
}
#vsol-calculator-ui .select2-selection--single .select2-selection__rendered {
  color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; display: block; width: 100%;
}
#vsol-calculator-ui .select2-selection__arrow { height: 20px; }
#vsol-calculator-ui .select2-selection__arrow b {
  display: inline-block; border-style: solid; border-width: 5px 4px 0 4px; border-color: #555 transparent transparent transparent; margin-left: 6px;
}
#vsol-calculator-ui .dropdown-wrapper { display: none; }
#vsol-calculator-ui .orders-dropdown {
  position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #aaa; z-index: 9999; max-height: 240px; overflow-y: auto;
}
#vsol-calculator-ui .orders-option { padding: 0 4px; height: 20px; line-height: 20px; font-size: 11px; text-align: left; cursor: pointer; }
#vsol-calculator-ui .orders-option:hover { background: #f0f0f0; }
#vsol-calculator-ui .orders-option.disabled { color: #bbb; cursor: default; }
#vsol-calculator-ui .orders-placeholder { color: rgb(163,163,163); }

/* Селектор стиля игрока 40x20 */
#vsol-calculator-ui .custom-style-select { position: relative; width: 40px; user-select: none; display: inline-block; vertical-align: top; }
#vsol-calculator-ui .custom-style-select .selected {
  border: 1px solid #aaa; padding: 1px 4px; background: #fff; display: flex; align-items: center; gap: 6px; height: 20px; min-height: 20px; line-height: 18px; font-size: 11px; box-sizing: border-box; cursor: pointer;
}
#vsol-calculator-ui .custom-style-select .icon { width: 14px; height: 14px; }
#vsol-calculator-ui .custom-style-select .options {
  display: none; position: absolute; left: 0; right: 0; background: #fff; border: 1px solid #aaa; border-top: none; z-index: 9999; max-height: 180px; overflow-y: auto; margin: 0; padding: 0; list-style: none;
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

    (function init() {
      const styleObj = PLAYER_STYLES.find(s => s.value === currentValue) || PLAYER_STYLES[0];
      selectedLabel.textContent = styleObj.label || '—';
      if (styleObj.icon) { selectedIcon.src = styleObj.icon; selectedIcon.style.display = ''; }
      else { selectedIcon.style.display = 'none'; }
    })();

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
    sel.addEventListener('click', (e) => { toggle(); e.stopPropagation(); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) { open = false; dropdownWrapper.style.display = 'none'; } });

    let current = options && options[0] ? options[0] : { value: '', label: '' };
    rendered.textContent = current.label || '';

    function renderOptions(opts) {
      dropdown.innerHTML = '';
      opts.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'orders-option';
        div.textContent = opt.label;
        div.addEventListener('click', () => {
          current = opt;
          rendered.textContent = opt.label;
          toggle();
          if (onChange) onChange(opt.value);
        });
        dropdown.appendChild(div);
      });
    }
    renderOptions(options || []);

    return {
      el: wrap,
      getValue: () => current.value,
      setValue: (v) => {
        const f = options.find(o => o.value === v);
        if (f) { current = f; rendered.textContent = f.label; }
      },
      setBg: (color) => { sel.style.backgroundColor = color; },
      setOptions: (opts) => { renderOptions(opts); if (opts[0]) { current = opts[0]; rendered.textContent = opts[0].label; } }
    };
  }

  function paintStyleSelectByCollision(selectEl, status) {
    const WIN_BG = 'rgb(224, 255, 224)';
    const LOSE_BG = 'rgb(255, 208, 208)';
    const NEUTRAL = 'transparent';
    if (!selectEl) return;
    if (status === COLLISION_WIN) selectEl.style.background = WIN_BG;
    else if (status === COLLISION_LOSE) selectEl.style.background = LOSE_BG;
    else selectEl.style.background = NEUTRAL;
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
    sel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { open(); e.preventDefault(); }
      if (e.key === 'Escape') { close(); }
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

  function createTeamLineupBlock(players, initialFormationName = "4-4-2") {
    const lineup = [];
    const selectedPlayerIds = new Set();

    const table = document.createElement('table');
    table.className = 'orders-table';

    const rowsCount = 11;
    const positions = FORMATIONS[initialFormationName];
    const initialMiniAll = positions.map((_, idx) =>
      getAllowedMiniOptions({ formationName: initialFormationName, positions, rowIndex: idx })
    );

    function buildPlaceholder(posValue) { return POSITION_PLACEHOLDERS[posValue] || 'выберите игрока:'; }

    function getFilteredPlayersForRow(posValue, currentValue) {
      let pool;
      if (posValue === 'GK') pool = players.filter(p => p.mainPos === 'GK' || p.secondPos === 'GK');
      else pool = players.filter(p => p.mainPos !== 'GK' && p.secondPos !== 'GK');
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
      const prev = captainSelectRef.value;
      captainSelectRef.innerHTML = '<option value="">— Не выбран —</option>';
      available.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.age})`;
        captainSelectRef.appendChild(opt);
      });
      if (prev && inLineupIds.has(prev)) captainSelectRef.value = prev;
    }

    for (let row = 0; row < rowsCount; row++) {
      const tr = document.createElement('tr');
      const tdPos = document.createElement('td');
      const tdSel = document.createElement('td');

      let mini = null;
      const miniOpts = initialMiniAll[row] || [];
      const initialPos = positions[row];

      if (row === 0) {
        tdPos.className = 'order';
        tdPos.style.backgroundColor = '#FFFFBB';
        tdPos.textContent = 'GK';
      } else {
        tdPos.className = 'txt';
        mini = createMiniPositionSelect({
          options: miniOpts,
          bg: '#FFFFBB',
          onChange: (v) => {
            const slot = lineup[row];
            slot.posValue = v || slot.posValue;
            updatePlayerSelectOptions();
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

      const selEl = orders.el.querySelector('.select2-selection');
      const rendered = orders.el.querySelector('.select2-selection__rendered');
      if (selEl) {
        selEl.style.height = '20px';
        selEl.style.minHeight = '20px';
        selEl.style.lineHeight = '18px';
      }
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
      const onChange = (value) => {
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
              div.addEventListener('click', () => onChange(val), { once: true });
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

    updatePlayerSelectOptions();

    return { block: table, lineup, updatePlayerSelectOptions, attachCaptainSelect };
  }

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

    function createUI(homeTeam, awayTeam, homePlayers, awayPlayers) {
        const calc = new PositionStrengthCalculator();
        const formationManager = new FormationManager(FORMATIONS);

        const parsedWeather = parseWeatherFromPreview();
        const weatherUI = createWeatherUI(
            parsedWeather?.weather,
            parsedWeather?.temperature,
            parsedWeather?.icon
        );

        // Контейнер UI
        const container = document.createElement('div');
        container.id = 'vsol-calculator-ui';

        // 1. Погода
        container.appendChild(weatherUI.container);

        // 2. Посещаемость (внутри vsol-calculator-ui)
        const stadiumCapacity = parseStadiumCapacity() || 0;
        const attendanceUI = document.createElement('div');
        attendanceUI.id = 'vsol-attendance-ui';
        attendanceUI.className = 'lh16';

        const attendanceLabel = document.createElement('label');
        attendanceLabel.innerHTML = `
      Посещаемость:
      <img src="https://cdn-icons-png.flaticon.com/128/1259/1259792.png" style="vertical-align:top; padding:2px 3px 0 0" height="16">
    `;
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

        // Настройки команд/расстановки
        const homeStyle = createStyleSelector();
        const homeFormationSelect = createFormationSelector(formationManager);
        const homeFormationHelpBtn = createFormationHelpButton();
        const homeSettingsBlock = createTeamSettingsBlock(homeStyle, homeFormationSelect, homeFormationHelpBtn);
        const homeLineupBlock = createTeamLineupBlock(homePlayers);

        const awayStyle = createStyleSelector();
        const awayFormationSelect = createFormationSelector(formationManager);
        const awayFormationHelpBtn = createFormationHelpButton();
        const awaySettingsBlock = createTeamSettingsBlock(awayStyle, awayFormationSelect, awayFormationHelpBtn);
        const awayLineupBlock = createTeamLineupBlock(awayPlayers);

        const homeCaptainRow = makeCaptainRow(homeLineupBlock);
        const awayCaptainRow = makeCaptainRow(awayLineupBlock);
        window.__vs_homeCaptainSelect = homeLineupBlock.captainSelect;
        window.__vs_awayCaptainSelect = awayLineupBlock.captainSelect;

        function saveAllStates() {
            const homeState = getCurrentTeamState(homeStyle, homeFormationSelect, homeLineupBlock.captainSelect, homeLineupBlock);
            const awayState = getCurrentTeamState(awayStyle, awayFormationSelect, awayLineupBlock.captainSelect, awayLineupBlock);
            const synergyState = { synergy: getSynergyValue() };
            saveTeamState(STORAGE_KEYS.home, { ...homeState, ...synergyState });
            saveTeamState(STORAGE_KEYS.away, { ...awayState, ...synergyState });
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

        // --- Synergy (сыгранность) ---
        const synergyUI = document.createElement('div');
        synergyUI.id = 'vsol-synergy-ui';
        synergyUI.className = 'lh16';

        const synergyLabel = document.createElement('label');
        synergyLabel.textContent = 'Сыгранность (доля):';

        const synergyInput = document.createElement('input');
        synergyInput.type = 'number';
        synergyInput.id = 'vs_synergy';
        synergyInput.min = '0';
        synergyInput.max = '1';
        synergyInput.step = '0.01';
        synergyInput.value = '0.00';

        const synergyHint = document.createElement('span');
        synergyHint.className = 'hint';
        synergyHint.textContent = 'Введите 0…1 (например, 0.05 = +5% от contribBase)';

        synergyLabel.appendChild(synergyInput);
        synergyUI.appendChild(synergyLabel);
        synergyUI.appendChild(synergyHint);

        // Размещаем ниже таблиц составов
        container.appendChild(synergyUI);

        // --- Сохранение/загрузка synergy ---
        function getSynergyValue() {
            const el = document.getElementById('vs_synergy');
            const v = el ? Number(el.value) : 0;
            return Number.isFinite(v) ? v : 0;
        }
        function setSynergyValue(v) {
            const el = document.getElementById('vs_synergy');
            if (el) el.value = String(v != null ? v : 0);
        }

        synergyInput.addEventListener('input', () => saveAllStates());
        synergyInput.addEventListener('change', () => saveAllStates());

        // --- Загрузка состояния при инициализации ---
        const homeSaved = loadTeamState(STORAGE_KEYS.home);
        const awaySaved = loadTeamState(STORAGE_KEYS.away);
        if (homeSaved) setTeamState(homeSaved, homeStyle, homeFormationSelect, homeLineupBlock.captainSelect, homeLineupBlock, homePlayers);
        if (awaySaved) setTeamState(awaySaved, awayStyle, awayFormationSelect, awayLineupBlock.captainSelect, awayLineupBlock, awayPlayers);

        if (homeSaved && typeof homeSaved.synergy !== 'undefined') {
            setSynergyValue(homeSaved.synergy);
        } else if (awaySaved && typeof awaySaved.synergy !== 'undefined') {
            setSynergyValue(awaySaved.synergy);
        }

        // --- Инициализация (или восстановление) ---
        applyFormation(homeLineupBlock.lineup, homeFormationSelect.value, homeLineupBlock);
        applyFormation(awayLineupBlock.lineup, awayFormationSelect.value, awayLineupBlock);
        refreshCaptainOptions(homeLineupBlock, homePlayers);
        refreshCaptainOptions(awayLineupBlock, awayPlayers);

        // --- Сохранение при изменениях ---
        homeStyle.addEventListener('change', () => onStyleChange(repaintStyleCollision, saveAllStates));
        awayStyle.addEventListener('change', () => onStyleChange(repaintStyleCollision, saveAllStates));
        homeFormationSelect.addEventListener('change',
            makeFormationHandler(homeLineupBlock, homeFormationSelect, homePlayers, applyFormation, refreshCaptainOptions, saveAllStates));
        awayFormationSelect.addEventListener('change',
            makeFormationHandler(awayLineupBlock, awayFormationSelect, awayPlayers, applyFormation, refreshCaptainOptions, saveAllStates));
        homeLineupBlock.captainSelect.addEventListener('change', makeCaptainHandler(saveAllStates));
        awayLineupBlock.captainSelect.addEventListener('change', makeCaptainHandler(saveAllStates));

        function repaintStyleCollision() {
            const homeTeamStyleId = homeStyle.value || 'norm';
            const awayTeamStyleId = awayStyle.value || 'norm';
            const info = getCollisionInfo(homeTeamStyleId, awayTeamStyleId);
            paintStyleSelectByCollision(homeStyle, info.teamStatus);
            paintStyleSelectByCollision(awayStyle, info.oppStatus);
        }
        homeStyle.addEventListener('change', repaintStyleCollision);
        awayStyle.addEventListener('change', repaintStyleCollision);
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
            applyFormation(homeLineupBlock.lineup, homeFormationSelect.value, homeLineupBlock);
            applyFormation(awayLineupBlock.lineup, awayFormationSelect.value, awayLineupBlock);
            homeLineupBlock.lineup.forEach(slot => { slot.setValue('', ''); });
            awayLineupBlock.lineup.forEach(slot => { slot.setValue('', ''); });
            homeLineupBlock.captainSelect.value = '';
            awayLineupBlock.captainSelect.value = '';
            refreshCaptainOptions(homeLineupBlock, homePlayers);
            refreshCaptainOptions(awayLineupBlock, awayPlayers);
            repaintStyleCollision();
            setSynergyValue(0);
            saveAllStates();
        };
        container.appendChild(clearBtn);

        // --- Применение расстановок ---
        function applyFormation(lineup, formationName, lineupBlock) {
            const positions = FORMATIONS[formationName];
            const allMiniOpts = positions.map((_, idx) =>
                getAllowedMiniOptions({ formationName, positions, rowIndex: idx })
            );
            lineup.forEach((slot, idx) => {
                const newPos = positions[idx] || '';
                if (!newPos) return;
                slot.posValue = newPos;
                if (slot.miniPositionSelect) {
                    const opts = allMiniOpts[idx] || [{ value: newPos, label: newPos }];
                    slot.miniPositionSelect.setOptions(opts);
                    slot.miniPositionSelect.setValue(newPos);
                }
            });
            lineupBlock.updatePlayerSelectOptions();
        }

        // --- Кнопка расчёта ---
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

            const userSynergy = getSynergyValue(); // доля 0..1

            const homeTeamStyleId = mapCustomStyleToStyleId(homeStyle.value);
            const awayTeamStyleId = mapCustomStyleToStyleId(awayStyle.value);

            async function computeTeamStrength(lineup, players, teamStyleId, sideLabel, opponentTeamStyleId, homeBonusPercent = -1, userSynergy = 0) {
                const homeBonusValue = getHomeBonus(homeBonusPercent);
                let totalHomeBonus = 0;
                let totalSynergyBonus = 0;

                const myStyleId = teamStyleId || 'norm';
                const oppStyleId = opponentTeamStyleId || 'norm';
                console.log('[Calc] Collision debug', { side: sideLabel, teamStyleId: myStyleId, opponentTeamStyleId: oppStyleId });

                const inLineupPlayers = lineup
                    .map(slot => {
                        const id = slot.getValue && slot.getValue();
                        return id ? players.find(p => String(p.id) === String(id)) : null;
                    })
                    .filter(Boolean);

                const { teamIBonusByPlayer, teamIBonusTotal } = getTeamIBonusForLineup(inLineupPlayers);

                const captainSelectEl = sideLabel === 'home' ? (window.__vs_homeCaptainSelect || null) : (window.__vs_awayCaptainSelect || null);
                const { captainId, captainPlayer, dummyEntries } = buildCaptainContext(lineup, players, captainSelectEl);
                const teamCaptainPercent = estimateCaptainPercent(captainPlayer, dummyEntries) || 0;

                let captainBonus = 0;
                if (captainPlayer && teamCaptainPercent !== 0) {
                    const captainRealStr = Number(captainPlayer.realStr) || 0;
                    captainBonus = captainRealStr * teamCaptainPercent;
                }
                console.log('[Calc] Captain debug', {
                    side: sideLabel,
                    captain: captainPlayer ? captainPlayer.name : null,
                    captainRealStr: captainPlayer ? Number(captainPlayer.realStr) : null,
                    teamCaptainPercent,
                    captainBonus
                });

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

                    getWeatherStrengthValueCached(
                        styleNumeric,
                        wt.temperature,
                        wt.weather,
                        requestedStrength,
                        (res) => {
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
                                return resolve({
                                    player,
                                    weatherStr: null,
                                    wasNormalized: false,
                                    playerStyleId,
                                    teamStyleId: myStyleId
                                });
                            }
                            const ws = parseNumericWeatherStr(res.weatherStr);
                            resolve({
                                player,
                                weatherStr: (ws == null || ws === 0) ? null : ws,
                                wasNormalized: !!res.details.wasNormalized,
                                playerStyleId,
                                teamStyleId: myStyleId
                            });
                        }
                    );
                }));

                const results = await Promise.all(tasks);

                let total = 0;
                let totalCollisionWinBonus = 0;
                let totalChemistryBonus = 0;

                results.forEach(entry => {
                    if (!entry || !entry.player) return;

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
                    totalHomeBonus += homeBonusForPlayer;

                    // Synergy (доля от contribBase)
                    const synergyBonus = getSynergyBonus(entry.player, inLineupPlayers, myStyleId, userSynergy);
                    const synergyBonusForPlayer = contribBase * synergyBonus;
                    totalSynergyBonus += synergyBonusForPlayer;

                    const contribution = contribWithIndividualBonuses
                        + captainBonusForPlayer
                        + collisionWinBonusForPlayer
                        + chemistryBonusForPlayer
                        + homeBonusForPlayer
                        + synergyBonusForPlayer;

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
                        contribution
                    });
                });

                total += teamIBonusTotal;

                const nonCaptainCount = results.filter(entry =>
                    entry && entry.player && (!captainId || String(entry.player.id) !== String(captainId))
                ).length;
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
                    total
                });

                return total;
            }

            const [homeStrength, awayStrength] = await Promise.all([
                computeTeamStrength(homeLineupBlock.lineup, homePlayers, homeTeamStyleId, 'home', awayTeamStyleId, homeAttendancePercent, userSynergy),
                computeTeamStrength(awayLineupBlock.lineup, awayPlayers, awayTeamStyleId, 'away', homeTeamStyleId, -1, userSynergy)
            ]);

            const oldResult = container.querySelector('.vsol-result');
            if (oldResult) oldResult.remove();

            const resultDiv = document.createElement('div');
            resultDiv.className = 'vsol-result';
            resultDiv.style.marginTop = '15px';
            resultDiv.style.fontWeight = 'bold';
            resultDiv.innerHTML = `
        <div>Сила хозяев: <b>${Math.round(homeStrength)}</b></div>
        <div>Сила гостей: <b>${Math.round(awayStrength)}</b></div>
      `;
            container.appendChild(resultDiv);
        };

        container.appendChild(btn);
        return container;
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
    const temps = (result.temperatures || [])
      .map(v => parseInt(v, 10))
      .filter(v => !Number.isNaN(v));
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

  function getWeatherStrengthValueCached(styleId, temperature, weather, strength, callback) {
    const cacheKey = 'weather_style_' + styleId;
    let cachedRaw = vsStorage.get(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        return getWeatherStrengthValueFromParsed(cached, temperature, weather, strength, callback);
      } catch (e) { /* перекачаем */ }
    }
    fetchWeatherStyleInfo(styleId, function(result) {
      if (result) {
        try { vsStorage.set(cacheKey, JSON.stringify(result)); } catch (e) { /* ignore */ }
      }
      getWeatherStrengthValueFromParsed(result, temperature, weather, strength, callback);
    });
  }

async function init() {
        removeInfoBlocks();
        replaceTeamIcons();

        const teamLinks = document.querySelectorAll('table.tobl a[href^="roster.php?num="]');
        if (teamLinks.length < 2) return;
        const homeTeam = teamLinks[0].textContent.trim();
        const awayTeam = teamLinks[1].textContent.trim();
        const homeTeamId = new URL(teamLinks[0].href).searchParams.get('num');
        const awayTeamId = new URL(teamLinks[1].href).searchParams.get('num');
        if (!homeTeamId || !awayTeamId) return;

        let tournamentType;
        try {
            const info = parseMatchInfo(document.body.innerHTML);
            tournamentType = info.tournamentType;
        } catch (e) {
            alert(e.message); return;
        }

        const [homePlayers, awayPlayers] = await Promise.all([
            loadTeamRoster(homeTeamId, tournamentType),
            loadTeamRoster(awayTeamId, tournamentType)
        ]);

        const oldUI = document.getElementById('vsol-calculator-ui');
        if (oldUI) oldUI.remove();

        const ui = createUI(homeTeam, awayTeam, homePlayers, awayPlayers);

        const comparisonTable = document.querySelector('table.tobl');
        if (comparisonTable && comparisonTable.parentNode) {
            comparisonTable.parentNode.insertBefore(ui, comparisonTable.nextSibling);
        }
    }

    init();
})();