// ==UserScript==
// @name         Virtual Soccer Strength Calculator
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Калькулятор силы команд для Virtual Soccer
// @author       Arne + GPT
// @match        https://www.virtualsoccer.ru/previewmatch.php*
// @grant        GM_xmlhttpRequest
// @connect      virtualsoccer.ru
// @grant        GM_log
// ==/UserScript==

(function () {
    'use strict';

const STYLE_VALUES = {
    'sp': 1,       // спартаковский
    'brazil': 3,   // бразильский
    'tiki': 4,     // тики-така
    'bb': 2,       // бей-беги
    'kat': 5,      // катеначчо
    'brit': 6,     // британский
    'norm': 0      // нормальный/дефолт
};
    // --- Преобразование массива plrdat в объекты ---
    function extractPlayersFromPlrdat(plrdat) {
    return plrdat.map(p => {
        const playerObj = {
            id: p[0],
            name: `${p[2]} ${p[3]}`,
            mainPos: p[6],
            secondPos: p[7],
            baseStrength: p[21],
            realStr: p[15],
            fatigue: p[13],
            form: p[14],
            form_mod: p[16],
            real_sign: p[17],
            real_str: p[18],
            str: p[19],
            transfer: p[20],
            hidden_style: p[24],
            training: p[23]
        };
        console.log('[extractPlayersFromPlrdat] Parsed player:', playerObj);
        return playerObj;
    });
}
    const STYLE_LABELS = {
    'sp': 'спартаковский',
    'brazil': 'бразильский',
    'tiki': 'тики-така',
    'bb': 'бей-беги',
    'kat': 'катеначчо',
    'brit': 'британский',
    'norm': 'нормальный'
};
    // --- Удаление инфоблоков ---
    function removeInfoBlocks() {
        const HEADERS = [
            'Стоимость команд',
            'Рейтинг силы команд',
            'Сумма сил 17-ти лучших игроков',
            'Сумма сил 14-ти лучших игроков',
            'Сумма сил 11-ти лучших игроков'
        ];
        const tds = Array.from(document.querySelectorAll('td')).filter(td =>
            HEADERS.includes(td.textContent.trim())
        );
        tds.forEach(td => {
            const tr = td.closest('tr');
            if (!tr) return;
            const innerTable = tr.closest('table.nol');
            if (!innerTable) return;
            const outerTd = innerTable.closest('td[colspan="9"]');
            if (!outerTd) return;
            outerTd.remove();
        });
    }

    // --- Замена старых эмблем на большие ---
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



    // --- Загрузка состава команды ---
    function loadTeamRoster(teamId, tournamentType) {

        const sortMap = {
            'friendly': 1,
            'preseason_cup': 2,
            'championship': 3,
            'national_cup': 4,
            'challenge_cup': 47
        };
        const sort = sortMap[tournamentType];
        if (!sort) {
            return Promise.reject(new Error('Неизвестный тип турнира для загрузки состава'));
        }
        const url = `https://www.virtualsoccer.ru/roster.php?num=${teamId}&sort=${sort}`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: function (response) {
                    console.log('HTML:', response.responseText);
                    if (response.status !== 200) {
                        resolve([]);
                        return;
                    }
                    try {
                        const rawPlayers = extractPlrdatFromHTML(response.responseText);
                        if (!rawPlayers.length) {
                            resolve([]);
                            return;
                        }
                        const players = extractPlayersFromPlrdat(rawPlayers);
                        resolve(players);
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: function (err) {
                    reject(err);
                }
            });
        });
    }

    // --- Класс для расчёта мультипликатора позиции ---
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
                    if (
                        (mainPos === pos1 && secondPos === pos2) ||
                        (mainPos === pos2 && secondPos === pos1)
                    ) {
                        return 105;
                    }
                }
            }
            return 80;
        }
    }

    // --- Парсинг информации о матче ---
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

    // --- Стили игры ---
    const GAME_STYLES = [
        { value: 'normal', label: 'Нормальный', group: 'default', color: 'rgb(255, 208, 208)' },
        { value: 'spartak', label: 'Спартаковский', group: 'sunny', color: 'rgb(255, 255, 187)' },
        { value: 'tikitaka', label: 'Тики-така', group: 'sunny', color: 'rgb(255, 255, 187)' },
        { value: 'brazil', label: 'Бразильский', group: 'sunny', color: 'rgb(255, 255, 187)' },
        { value: 'british', label: 'Британский', group: 'rainy', color: 'rgb(204, 204, 238)' },
        { value: 'kickrun', label: 'Бей-беги', group: 'rainy', color: 'rgb(204, 204, 238)' },
        { value: 'catenaccio', label: 'Катеначчо', group: 'rainy', color: 'rgb(204, 204, 238)' }
    ];

    // --- Расстановки ---
    const FORMATIONS = {
        "4-4-2": ["GK", "LD", "CD", "CD", "RD", "LM", "CM", "CM", "RM", "CF", "CF"],
        "3-5-2": ["GK", "CD", "CD", "CD", "LM", "CM", "CM", "CM", "RM", "CF", "CF"],
        // ...можно добавить другие схемы
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

    // --- Селектор стиля игры ---
    function createStyleSelector() {
        const select = document.createElement('select');
        GAME_STYLES.forEach(style => {
            const opt = document.createElement('option');
            opt.value = style.value;
            opt.textContent = style.label;
            opt.style.background = style.color;
            if (style.value === 'normal') opt.selected = true;
            select.appendChild(opt);
        });
        select.addEventListener('change', function() {
            const selected = GAME_STYLES.find(s => s.value === select.value);
            select.style.background = selected ? selected.color : '';
        });
        select.style.background = GAME_STYLES.find(s => s.value === 'normal').color;
        return select;
    }

    // --- Селектор формации ---
    function createFormationSelector(formationManager) {
        const select = document.createElement('select');
        formationManager.getAllFormations().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
        return select;
    }

    // --- Кнопка-подсказка для формации ---
    function createFormationHelpButton() {
        const btn = document.createElement('button');
        btn.tabIndex = 201;
        btn.className = 'btn-help';
        btn.style = 'margin: 1px 2px 0px;';
        btn.innerHTML = '?';
        btn.onclick = function(e) {
            if (typeof hintpos === 'function') {
                hintpos($(this), 3, 'Формация', 350, 'left top', 'right bottom');
            } else {
                alert('Подсказка по формации');
            }
            return false;
        };
        return btn;
    }

    // --- Заготовки для тактики и прочего ---
    function createDummySelect() {
        const select = document.createElement('select');
        select.innerHTML = '<option value="">—</option>';
        return select;
    }

    // --- Блок настроек команды ---
    function createTeamSettingsBlock(styleSelector, formationSelector, formationHelpBtn) {
        const block = document.createElement('div');
        block.style.marginBottom = '8px';
        block.style.display = 'flex';
        block.style.flexDirection = 'column';
        block.style.alignItems = 'flex-start';

        // стиль
        const styleDiv = document.createElement('div');
        styleDiv.style.marginBottom = '8px';
        const styleLabel = document.createElement('label');
        styleLabel.textContent = 'стиль: ';
        styleLabel.style.verticalAlign = 'middle';
        styleLabel.appendChild(styleSelector);
        styleDiv.appendChild(styleLabel);
        block.appendChild(styleDiv);

        // формация + help
        const formationDiv = document.createElement('div');
        const formationLabel = document.createElement('label');
        formationLabel.style.marginLeft = '0';
        formationLabel.textContent = 'формация: ';
        formationLabel.style.verticalAlign = 'middle';
        formationLabel.appendChild(formationSelector);
        formationLabel.appendChild(formationHelpBtn);
        formationDiv.appendChild(formationLabel);
        block.appendChild(formationDiv);

        // тактика
        const tacticDiv = document.createElement('div');
        const tacticLabel = document.createElement('label');
        tacticLabel.style.marginLeft = '0';
        tacticLabel.textContent = 'тактика: ';
        tacticLabel.style.verticalAlign = 'middle';
        tacticLabel.appendChild(createDummySelect());
        tacticDiv.appendChild(tacticLabel);
        block.appendChild(tacticDiv);

        // вид защиты
        const defenseDiv = document.createElement('div');
        const defenseLabel = document.createElement('label');
        defenseLabel.style.marginLeft = '0';
        defenseLabel.textContent = 'вид защиты: ';
        defenseLabel.style.verticalAlign = 'middle';
        defenseLabel.appendChild(createDummySelect());
        defenseDiv.appendChild(defenseLabel);
        block.appendChild(defenseDiv);

        // грубость
        const roughDiv = document.createElement('div');
        const roughLabel = document.createElement('label');
        roughLabel.style.marginLeft = '0';
        roughLabel.textContent = 'грубость: ';
        roughLabel.style.verticalAlign = 'middle';
        roughLabel.appendChild(createDummySelect());
        roughDiv.appendChild(roughLabel);
        block.appendChild(roughDiv);

        // настрой
        const moodDiv = document.createElement('div');
        const moodLabel = document.createElement('label');
        moodLabel.style.marginLeft = '0';
        moodLabel.textContent = 'настрой: ';
        moodLabel.style.verticalAlign = 'middle';
        moodLabel.appendChild(createDummySelect());
        moodDiv.appendChild(moodLabel);
        block.appendChild(moodDiv);

        return block;
    }

    // --- Колонка с позициями и игроками ---
const PLAYER_STYLES = [
    { value: 'sp', label: '', icon: 'styles/o1.gif' },
    { value: 'brazil', label: '', icon: 'styles/o3.gif' },
    { value: 'tiki', label: '', icon: 'styles/o4.gif' },
    { value: 'bb', label: '', icon: 'styles/o2.gif' },
    { value: 'kat', label: '', icon: 'styles/o5.gif' },
    { value: 'brit', label: '', icon: 'styles/o6.gif' },
    { value: 'norm', label: '—', icon: '' }
];

    // Маппинг hidden_style -> value кастомного селектора
const HIDDEN_STYLE_MAP = {
    1: 'sp',
    2: 'bb',
    3: 'brazil',
    4: 'tiki',
    5: 'kat',
    6: 'brit',
    7: 'norm'
    // если появятся новые значения — добавьте сюда
};
    //CSS для кастомного селектора (стиль игрока)
    (function() {
    const style = document.createElement('style');
    style.textContent = `
    .custom-style-select { position: relative; width: 40px; font-size: 14px; user-select: none; }
    .custom-style-select .selected { border: 1px solid #aaa; padding: 4px 8px; background: #fff; cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .custom-style-select .options { display: none; position: absolute; left: 0; right: 0; background: #fff; border: 1px solid #aaa; border-top: none; z-index: 10; max-height: 180px; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
    .custom-style-select.open .options { display: block; }
    .custom-style-select .options li { padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .custom-style-select .options li:hover { background: #f0f0f0; }
    .custom-style-select .icon { width: 14px; height: 14px; }
    `;
    document.head.appendChild(style);
})();
    function createCustomStyleSelect(onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-style-select';

    // Selected
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

    // Options
    const optionsUl = document.createElement('ul');
    optionsUl.className = 'options';
    PLAYER_STYLES.forEach(style => {
        const li = document.createElement('li');
        li.dataset.value = style.value;
        if (style.icon) {
            const img = document.createElement('img');
            img.src = style.icon;
            img.className = 'icon';
            li.appendChild(img);
        }
        li.appendChild(document.createTextNode(style.label));
        optionsUl.appendChild(li);
    });
    wrapper.appendChild(optionsUl);

    // State
    let currentValue = '';

    // Events
    selectedDiv.addEventListener('click', () => {
        wrapper.classList.toggle('open');
    });
    optionsUl.addEventListener('click', e => {
        if (e.target.tagName === 'LI' || e.target.closest('li')) {
            const li = e.target.tagName === 'LI' ? e.target : e.target.closest('li');
            currentValue = li.dataset.value;
            const style = PLAYER_STYLES.find(s => s.value === currentValue) || PLAYER_STYLES[0];
            selectedLabel.textContent = style.label;
            if (style.icon) {
                selectedIcon.src = style.icon;
                selectedIcon.style.display = '';
            } else {
                selectedIcon.style.display = 'none';
            }
            wrapper.classList.remove('open');
            if (onChange) onChange(currentValue);
        }
    });
    // Закрытие при клике вне
    document.addEventListener('click', e => {
        if (!wrapper.contains(e.target)) wrapper.classList.remove('open');
    });

    // API
    wrapper.getValue = () => currentValue;
    wrapper.setValue = (val) => {
        currentValue = val;
        const style = PLAYER_STYLES.find(s => s.value === currentValue) || PLAYER_STYLES[0];
        selectedLabel.textContent = style.label;
        if (style.icon) {
            selectedIcon.src = style.icon;
            selectedIcon.style.display = '';
        } else {
            selectedIcon.style.display = 'none';
        }
    };

    return wrapper;
}

function createTeamLineupBlock(players) {
    const lineup = [];
    const selectedPlayerIds = new Set();
    const block = document.createElement('div');
    block.style.marginTop = '12px';

    function updatePlayerSelectOptions() {
        lineup.forEach((slot, idx) => {
            const currentValue = slot.playerSelect.value;
            const pos = slot.posSelect.value;

            let filteredPlayers;
            if (pos === 'GK') {
                filteredPlayers = players.filter(p => p.mainPos === 'GK' || p.secondPos === 'GK');
            } else {
                filteredPlayers = players.filter(p => p.mainPos !== 'GK' && p.secondPos !== 'GK');
            }
            const otherSelected = Array.from(selectedPlayerIds).filter(id => id !== currentValue);
            filteredPlayers = filteredPlayers.filter(p => !otherSelected.includes(String(p.id)));
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
    //обработчик выбора игрока
for (let i = 0; i < 11; i++) {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '8px';
    div.style.marginBottom = '6px';

    const playerSelect = document.createElement('select');
    playerSelect.style.width = '180px';

    const posSelect = document.createElement('select');
    posSelect.style.width = '70px';
    const positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'LF', 'CF', 'CF', 'RF', 'SW', 'LB', 'RB', 'DM', 'AM', 'LW', 'RW', 'ST', 'FR'];
    positions.forEach(pos => {
        const opt = document.createElement('option');
        opt.value = pos;
        opt.textContent = pos;
        posSelect.appendChild(opt);
    });

    // Кастомный селектор стиля
    const styleSelect = createCustomStyleSelect();

    // ВАЖНО: создаём slot и добавляем в lineup ДО объявления обработчика!
    let slot = { playerSelect, posSelect, styleSelect };
    lineup.push(slot);

    // Теперь объявляем обработчик, который использует slot, playerSelect и т.д.
    playerSelect.addEventListener('change', () => {
        selectedPlayerIds.clear();
        lineup.forEach(slot2 => {
            if (slot2.playerSelect.value) selectedPlayerIds.add(slot2.playerSelect.value);
        });
        updatePlayerSelectOptions();

        const playerId = playerSelect.value;
        const player = players.find(p => String(p.id) === playerId);
        console.log('[playerSelect change] Selected playerId:', playerId, 'Player object:', player);

        if (player && player.hidden_style && player.hidden_style != 0) {
            const styleCode = HIDDEN_STYLE_MAP[player.hidden_style];
            console.log('[playerSelect change] Player has hidden_style:', player.hidden_style, 'Mapped styleCode:', styleCode);
            if (styleCode) slot.styleSelect.setValue(styleCode);
        } else {
            console.log('[playerSelect change] Player has no hidden_style or hidden_style == 0');
            // slot.styleSelect.setValue(''); // если хотите сбрасывать стиль
        }
    });

    posSelect.addEventListener('change', updatePlayerSelectOptions);

    div.appendChild(playerSelect);
    div.appendChild(posSelect);
    div.appendChild(styleSelect);

    block.appendChild(div);
}

    updatePlayerSelectOptions();

    return { block, lineup, updatePlayerSelectOptions };
}
    // --- UI ---
    function createUI(homeTeam, awayTeam, homePlayers, awayPlayers) {
        const calc = new PositionStrengthCalculator();
        const formationManager = new FormationManager(FORMATIONS);

        // --- Настройки и составы для обеих команд ---
        // Хозяева
        const homeStyle = createStyleSelector();
        const homeFormationSelect = createFormationSelector(formationManager);
        const homeFormationHelpBtn = createFormationHelpButton();
        const homeSettingsBlock = createTeamSettingsBlock(homeStyle, homeFormationSelect, homeFormationHelpBtn);
        const homeLineupBlock = createTeamLineupBlock(homePlayers);

        // Гости
        const awayStyle = createStyleSelector();
        const awayFormationSelect = createFormationSelector(formationManager);
        const awayFormationHelpBtn = createFormationHelpButton();
        const awaySettingsBlock = createTeamSettingsBlock(awayStyle, awayFormationSelect, awayFormationHelpBtn);
        const awayLineupBlock = createTeamLineupBlock(awayPlayers);

        // --- Верхняя таблица: настройки и поле ---
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

        // --- Нижняя таблица: составы ---
        const lineupsTable = document.createElement('table');
        lineupsTable.style.width = '750px';
        lineupsTable.style.margin = '0 auto 10px auto';
        lineupsTable.style.borderCollapse = 'separate';
        lineupsTable.style.tableLayout = 'fixed';

        const tr2 = document.createElement('tr');
        const homeCol2 = document.createElement('td');
        homeCol2.style.verticalAlign = 'top';
        homeCol2.style.width = '393px';
        homeCol2.appendChild(homeLineupBlock.block);

        const awayCol2 = document.createElement('td');
        awayCol2.style.verticalAlign = 'top';
        awayCol2.style.width = '393px';
        awayCol2.appendChild(awayLineupBlock.block);

        tr2.appendChild(homeCol2);
        tr2.appendChild(awayCol2);
        lineupsTable.appendChild(tr2);

        // --- Главный контейнер ---
        const container = document.createElement('div');
        container.id = 'vsol-calculator-ui';
        container.style = 'margin: 20px 0; padding: 15px; background: #f9f9f9; border: 1px solid #ccc; border-radius: 6px;';
        const title = document.createElement('h3');
        title.textContent = 'Калькулятор силы';
        container.appendChild(title);
        container.appendChild(mainTable);
        container.appendChild(lineupsTable);

        // --- Автоматическая установка позиций по выбранной схеме ---
        function applyFormation(lineup, formationName) {
            const positions = formationManager.getPositions(formationName);
            lineup.forEach((slot, idx) => {
                slot.posSelect.value = positions[idx] || '';
            });
        }
        homeFormationSelect.addEventListener('change', () => {
            applyFormation(homeLineupBlock.lineup, homeFormationSelect.value);
            homeLineupBlock.updatePlayerSelectOptions();
        });
        awayFormationSelect.addEventListener('change', () => {
            applyFormation(awayLineupBlock.lineup, awayFormationSelect.value);
            awayLineupBlock.updatePlayerSelectOptions();
        });
        applyFormation(homeLineupBlock.lineup, homeFormationSelect.value);
        applyFormation(awayLineupBlock.lineup, awayFormationSelect.value);

        // --- Кнопка расчёта ---
        const btn = document.createElement('button');
        btn.textContent = 'Рассчитать силу';
        btn.style.marginTop = '15px';
        btn.style.padding = '8px 16px';
        btn.onclick = () => {
            let homeStrength = 0, awayStrength = 0;

            homeLineupBlock.lineup.forEach(slot => {
                const playerId = slot.playerSelect.value;
                if (!playerId) return;
                const player = homePlayers.find(p => String(p.id) === playerId);
                if (!player) return;
                const matchPos = slot.posSelect.value;
                const mult = calc.getStrengthMultiplier(player.mainPos, player.secondPos, matchPos);
                const rs = player.realStr * (mult / 100);
                homeStrength += rs;
            });

            awayLineupBlock.lineup.forEach(slot => {
                const playerId = slot.playerSelect.value;
                if (!playerId) return;
                const player = awayPlayers.find(p => String(p.id) === playerId);
                if (!player) return;
                const matchPos = slot.posSelect.value;
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
                <div>Стиль хозяев: <b>${GAME_STYLES.find(s => s.value === homeStyle.value).label}</b></div>
                <div>Стиль гостей: <b>${GAME_STYLES.find(s => s.value === awayStyle.value).label}</b></div>
            `;
            container.appendChild(resultDiv);
        };
        container.appendChild(btn);

        return container;
    }

    // --- Инициализация ---
    async function init() {
        removeInfoBlocks();
        replaceTeamIcons();

        // Названия команд
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
            alert(e.message);
            return;
        }

        const [homePlayers, awayPlayers] = await Promise.all([
            loadTeamRoster(homeTeamId, tournamentType),
            loadTeamRoster(awayTeamId, tournamentType)
        ]);

        const oldUI = document.getElementById('vsol-calculator-ui');
        if (oldUI) oldUI.remove();

        const ui = createUI(
            homeTeam,
            awayTeam,
            homePlayers,
            awayPlayers
        );

        // Вставляем после основной таблицы сравнения
        const comparisonTable = document.querySelector('table.tobl');
        if (comparisonTable && comparisonTable.parentNode) {
            comparisonTable.parentNode.insertBefore(ui, comparisonTable.nextSibling);
        }
    }

    // --- Запуск ---
    init();
})();