// ==UserScript==
// @name         Virtual Soccer Strength Calculator TEST
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Калькулятор силы команд для Virtual Soccer с ручным UI
// @author       Arne (UI integration)
// @match        https://www.virtualsoccer.ru/previewmatch.php*
// @grant        GM_xmlhttpRequest
// @connect      virtualsoccer.ru
// @grant        GM_log
// ==/UserScript==

(function () {
    'use strict';

    // --- Парсинг plrdat из HTML ---
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
            } catch (e) {
                console.log('Ошибка парсинга игрока:', e, m[1]);
            }
        }
        return items;
    }

    // --- Преобразование массива plrdat в объекты ---
    function extractPlayersFromPlrdat(plrdat) {
        return plrdat.map(p => ({
            id: p[0],
            name: `${p[2]} ${p[3]}`,
            mainPos: p[6],
            secondPos: p[7],
            baseStrength: p[21],
            realStr: p[15]
        }));
    }

    // --- Загрузка состава команды ---
   function loadTeamRoster(teamId, tournamentType) {
    // Карта соответствия типа турнира и sort-параметра
    const sortMap = {
        'friendly': 1,
        'preseason_cup': 2,
        'championship': 3,
        'national_cup': 4,
        'challenge_cup': 47
    };
    const sort = sortMap[tournamentType];
    if (!sort) {
        console.error('[loadTeamRoster] Неизвестный тип турнира:', tournamentType);
        return Promise.reject(new Error('Неизвестный тип турнира для загрузки состава'));
    }

    // ВАЖНО: в URL должен быть только один знак "?"!
    const url = `https://www.virtualsoccer.ru/roster.php?num=${teamId}&sort=${sort}`;
    console.log(`[loadTeamRoster] Загрузка состава для teamId=${teamId}, tournamentType=${tournamentType}, url=${url}`);

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: function (response) {
                if (response.status !== 200) {
                    console.error('[loadTeamRoster] Ошибка загрузки:', response.status);
                    resolve([]);
                    return;
                }
                try {
                    const rawPlayers = extractPlrdatFromHTML(response.responseText);
                    if (!rawPlayers.length) {
                        console.warn('[loadTeamRoster] Не найдено ни одного игрока!');
                        resolve([]);
                        return;
                    }
                    const players = extractPlayersFromPlrdat(rawPlayers);
                    console.log(`[loadTeamRoster] Загружено игроков: ${players.length}`);
                    resolve(players);
                } catch (error) {
                    console.error('[loadTeamRoster] Ошибка парсинга:', error);
                    reject(error);
                }
            },
            onerror: function (err) {
                console.error('[loadTeamRoster] Ошибка сети:', err);
                reject(err);
            }
        });
    });
}

    // =============== СОЗДАНИЕ ИНТЕРФЕЙСА ===============
const FORMATIONS = {
  "4-4-2": ["GK", "LD", "CD", "CD", "RD", "LM", "CM", "CM", "RM", "CF", "CF"],
  "3-5-2": ["GK", "CD", "CD", "CD", "LM", "CM", "CM", "CM", "RM", "CF", "CF"],
  // ...добавляй другие схемы
};

class FormationManager {
  constructor(formations) {
    this.formations = formations;
    this.formationNames = Object.keys(formations);
  }
  getPositions(formationName) {
    return this.formations[formationName] || [];
  }
  getAllFormations() {
    return this.formationNames;
  }
}

function createUI(homeTeam, awayTeam, homePlayers, awayPlayers) {
  const calc = new PositionStrengthCalculator();
  const formationManager = new FormationManager(FORMATIONS);

  const container = document.createElement('div');
  container.id = 'vsol-calculator-ui';
  container.style = 'margin: 20px 0; padding: 15px; background: #f9f9f9; border: 1px solid #ccc; border-radius: 6px;';

  const title = document.createElement('h3');
  title.textContent = 'Калькулятор силы';
  container.appendChild(title);

  // --- Контейнер для селекторов схем ---
  const formationSelectorsContainer = document.createElement('div');
  formationSelectorsContainer.style.display = 'flex';
  formationSelectorsContainer.style.gap = '40px';
  formationSelectorsContainer.style.marginBottom = '10px';

  // --- Селектор схемы для хозяев ---
  const homeFormationLabel = document.createElement('label');
  homeFormationLabel.textContent = `Схема (${homeTeam}): `;
  const homeFormationSelect = document.createElement('select');
  formationManager.getAllFormations().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    homeFormationSelect.appendChild(opt);
  });
  homeFormationLabel.appendChild(homeFormationSelect);
  formationSelectorsContainer.appendChild(homeFormationLabel);

  // --- Селектор схемы для гостей ---
  const awayFormationLabel = document.createElement('label');
  awayFormationLabel.textContent = `Схема (${awayTeam}): `;
  const awayFormationSelect = document.createElement('select');
  formationManager.getAllFormations().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    awayFormationSelect.appendChild(opt);
  });
  awayFormationLabel.appendChild(awayFormationSelect);
  formationSelectorsContainer.appendChild(awayFormationLabel);

  container.appendChild(formationSelectorsContainer);

  // --- Выпадающие списки игроков ---
  const selectContainer = document.createElement('div');
  selectContainer.style.display = 'flex';
  selectContainer.style.gap = '20px';

function createTeamColumn(teamName, players) {
  const col = document.createElement('div');
  const h4 = document.createElement('h4');
  h4.textContent = teamName;
  col.appendChild(h4);

  const lineup = [];
  const selectedPlayerIds = new Set();

function updatePlayerSelectOptions() {
  // 1. Найти id игрока, выбранного на позиции GK
  let gkSelectedId = null;
  lineup.forEach(slot => {
    if (slot.posSelect.value === 'GK' && slot.playerSelect.value) {
      gkSelectedId = slot.playerSelect.value;
    }
  });

  lineup.forEach((slot, idx) => {
    const currentValue = slot.playerSelect.value;
    const pos = slot.posSelect.value;

    let filteredPlayers;
    if (pos === 'GK') {
      // Только вратари
      filteredPlayers = players.filter(p => p.mainPos === 'GK' || p.secondPos === 'GK');
    } else {
      // Все, кроме вратарей (но если вратарь выбран на GK, он не появляется и тут)
      filteredPlayers = players.filter(p =>
        p.mainPos !== 'GK' && p.secondPos !== 'GK'
      );
    }

    // Исключаем уже выбранных в других слотах
    const otherSelected = Array.from(selectedPlayerIds).filter(id => id !== currentValue);
    filteredPlayers = filteredPlayers.filter(p => !otherSelected.includes(String(p.id)));

    // Сортировка по силе (realStr)
    filteredPlayers.sort((a, b) => b.realStr - a.realStr);

    slot.playerSelect.innerHTML = '<option value="">— Выберите игрока —</option>';
    filteredPlayers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} - ${p.realStr} - ${p.mainPos} ${p.secondPos}`;
      slot.playerSelect.appendChild(opt);
    });

    if (currentValue && filteredPlayers.some(p => String(p.id) === currentValue)) {
      slot.playerSelect.value = currentValue;
    }
  });
}

  for (let i = 0; i < 11; i++) {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '8px';
    div.style.marginBottom = '6px';

    const playerSelect = document.createElement('select');
    playerSelect.style.width = '180px';

    const posSelect = document.createElement('select');
    posSelect.style.width = '70px';
    const positions = ['GK','LD','CD','RD','LM','CM','RM','LF','CF','RF','SW','LB','RB','DM','AM','LW','RW','ST','FR'];
    positions.forEach(pos => {
      const opt = document.createElement('option');
      opt.value = pos;
      opt.textContent = pos;
      posSelect.appendChild(opt);
    });

    posSelect.addEventListener('change', updatePlayerSelectOptions);

    playerSelect.addEventListener('change', () => {
      selectedPlayerIds.clear();
      lineup.forEach(slot => {
        if (slot.playerSelect.value) selectedPlayerIds.add(slot.playerSelect.value);
      });
      updatePlayerSelectOptions();
    });

    div.appendChild(playerSelect);
    div.appendChild(posSelect);
    col.appendChild(div);
    lineup.push({ playerSelect, posSelect });
  }

  updatePlayerSelectOptions();

  return { col, lineup };
}

  const homeCol = createTeamColumn(homeTeam, homePlayers);
  const awayCol = createTeamColumn(awayTeam, awayPlayers);

  selectContainer.appendChild(homeCol.col);
  selectContainer.appendChild(awayCol.col);
  container.appendChild(selectContainer);

  // --- Автоматическая установка позиций по выбранной схеме ---
  function applyFormation(lineup, formationName) {
    const positions = formationManager.getPositions(formationName);
    lineup.forEach((slot, idx) => {
      slot.posSelect.value = positions[idx] || '';
    });
  }

  // При изменении схемы — обновить позиции только для своей команды
  homeFormationSelect.addEventListener('change', () => {
    applyFormation(homeCol.lineup, homeFormationSelect.value);
  });
  awayFormationSelect.addEventListener('change', () => {
    applyFormation(awayCol.lineup, awayFormationSelect.value);
  });

  // По умолчанию применяем первую схему для обеих команд
  applyFormation(homeCol.lineup, homeFormationSelect.value);
  applyFormation(awayCol.lineup, awayFormationSelect.value);

  // --- Кнопка расчёта ---
  const btn = document.createElement('button');
  btn.textContent = 'Рассчитать силу';
  btn.style.marginTop = '15px';
  btn.style.padding = '8px 16px';
  btn.onclick = () => {
    let homeStrength = 0, awayStrength = 0;

    homeCol.lineup.forEach(slot => {
      const playerId = slot.playerSelect.value;
      if (!playerId) return;
      const player = homePlayers.find(p => String(p.id) === playerId);
      const matchPos = slot.posSelect.value;
const calc = new PositionStrengthCalculator();
const mult = calc.getStrengthMultiplier(player.mainPos, player.secondPos, matchPos);
      const rs = player.realStr * (mult / 100);
      homeStrength += rs;
    });

    awayCol.lineup.forEach(slot => {
      const playerId = slot.playerSelect.value;
      if (!playerId) return;
      const player = awayPlayers.find(p => String(p.id) === playerId);
      const matchPos = slot.posSelect.value;
const calc = new PositionStrengthCalculator();
const mult = calc.getStrengthMultiplier(player.mainPos, player.secondPos, matchPos);
      const rs = player.realStr * (mult / 100);
      awayStrength += rs;
    });

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
        // --- Класс для расчёта мультипликатора позиции ---
    class PositionStrengthCalculator {
    getStrengthMultiplier(mainPos, secondPos, matchPos) {
    // 1. Совпадение с основной или дополнительной позицией
    if (mainPos === matchPos || secondPos === matchPos) return 100;

    // 2. Бонусные позиции
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
        if (
          (mainPos === pos1 && secondPos === pos2) ||
          (mainPos === pos2 && secondPos === pos1)
        ) {
          return 105;
        }
      }
    }

    // 3. Всё остальное
    return 80;
  }
}
    function parseMatchInfo(html) {
  // 1. Тип турнира
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
    console.log('[parseMatchInfo] Тип турнира найден:', t, '->', tournamentType);
  } else {
    console.error('[parseMatchInfo] Не удалось определить тип турнира!');
    throw new Error('Неизвестный тип турнира');
  }

  // 2. Погода
  const weatherRegex = /Прогноз погоды:[^>]*> *([^,]+),/i;
  const weatherMatch = html.match(weatherRegex);
  let weather = null;
  if (weatherMatch) {
    weather = weatherMatch[1].trim().toLowerCase();
    console.log('[parseMatchInfo] Погода найдена:', weather);
  } else {
    console.warn('[parseMatchInfo] Погода не найдена!');
  }

  // 3. Температура
  const tempRegex = /([\-]?\d+)\s*-\s*<span[^>]*>([\-]?\d+)/i;
  const tempMatch = html.match(tempRegex);
  let temperature = null;
  if (tempMatch) {
    temperature = `${tempMatch[1]}-${tempMatch[2]}`;
    console.log('[parseMatchInfo] Температура найдена:', temperature);
  } else {
    console.warn('[parseMatchInfo] Температура не найдена!');
  }

  return {
    tournamentType,
    weather,
    temperature
  };
}

    try {
  const info = parseMatchInfo(document.body.innerHTML);
  // info.tournamentType, info.weather, info.temperature
  // Можно использовать дальше в логике скрипта
} catch (e) {
  alert(e.message); // "Неизвестный тип турнира"
  // или прекращаем выполнение скрипта
}

    // === Инициализация ===
async function init() {
    const teamLinks = document.querySelectorAll('table.tobl a[href^="roster.php?num="]');
    if (teamLinks.length < 2) return;

    const homeLink = teamLinks[0];
    const awayLink = teamLinks[1];
    const homeTeamId = new URL(homeLink.href).searchParams.get('num');
    const awayTeamId = new URL(awayLink.href).searchParams.get('num');

    if (!homeTeamId || !awayTeamId) return;

    // 1. Получаем тип турнира из HTML
    let tournamentType;
    try {
        const info = parseMatchInfo(document.body.innerHTML);
        tournamentType = info.tournamentType;
        console.log('[init] Тип турнира:', tournamentType);
    } catch (e) {
        alert(e.message);
        return;
    }

    // 2. Загружаем составы с нужным sort
    const [homePlayers, awayPlayers] = await Promise.all([
        loadTeamRoster(homeTeamId, tournamentType),
        loadTeamRoster(awayTeamId, tournamentType)
    ]);

    // Удаляем старый интерфейс если есть
    const oldUI = document.getElementById('vsol-calculator-ui');
    if (oldUI) oldUI.remove();

    const ui = createUI(
        homeLink.textContent.trim(),
        awayLink.textContent.trim(),
        homePlayers,
        awayPlayers
    );

    const comparisonTable = document.querySelector('table.tobl');
    if (comparisonTable && comparisonTable.parentNode) {
        comparisonTable.parentNode.insertBefore(ui, comparisonTable.nextSibling);
    }
}

    init();
})();