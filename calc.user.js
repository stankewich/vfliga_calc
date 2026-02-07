// ==UserScript==
// @name         Virtual Soccer Strength Analyzer
// @namespace    http://tampermonkey.net/
// @license MIT
// @version      0.946
// @description  Калькулятор силы команд для Virtual Soccer с динамической визуализацией и аналитикой
// @author       Arne
// @match        *://*.virtualsoccer.ru/previewmatch.php*
// @match        *://*.vfleague.com/previewmatch.php*
// @match        *://*.vfliga.ru/previewmatch.php*
// @match        *://*.vfliga.com/previewmatch.php*
// @connect      virtualsoccer.ru
// @connect      vfleague.com
// @connect      vfliga.ru
// @connect      vfliga.com
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @downloadURL https://update.greasyfork.org/scripts/555251/Virtual%20Soccer%20Strength%20Analyzer.user.js
// @updateURL https://update.greasyfork.org/scripts/555251/Virtual%20Soccer%20Strength%20Analyzer.meta.js
// ==/UserScript==

const SITE_CONFIG = (() => {
    const hostname = window.location.hostname;
    let baseUrl = 'https://www.virtualsoccer.ru'; // default

    if (hostname.includes('vfleague.com')) {
        baseUrl = 'https://www.vfleague.com';
    } else if (hostname.includes('vfliga.com')) {
        baseUrl = 'https://www.vfliga.com';
    } else if (hostname.includes('vfliga.ru')) {
        baseUrl = 'https://www.vfliga.ru';
    }

    return { BASE_URL: baseUrl };
})();

// Константы для позиционирования футболок на поле
const FIELD_LAYOUT = {
    // Размеры внешнего контейнера (фон поля)
    FIELD_WIDTH: 400,
    FIELD_HEIGHT: 566,
    
    // Отступы контейнера футболок от краёв фона
    // Установлено 0 для максимального прижатия игроков к краям поля
    CONTAINER_PADDING: 0,
    
    // Размеры рабочей области (вычисляются автоматически)
    get WORKING_WIDTH() { return this.FIELD_WIDTH - this.CONTAINER_PADDING * 2; },   // 400px
    get WORKING_HEIGHT() { return this.FIELD_HEIGHT - this.CONTAINER_PADDING * 2; }, // 566px
    
    // Размеры футболок
    SHIRT_WIDTH: 40,
    SHIRT_HEIGHT: 34,
    
    // Половинные размеры (для центрирования)
    get SHIRT_HALF_WIDTH() { return this.SHIRT_WIDTH / 2; },   // 20px
    get SHIRT_HALF_HEIGHT() { return this.SHIRT_HEIGHT / 2; }  // 17px
};

const CONFIG = {
    COLLISION: {
        NONE: 'none',
        WIN: 'win',
        LOSE: 'lose'
    },
    STYLES: {
        VALUES: {
            'sp': 1,
            'brazil': 3,
            'tiki': 4,
            'bb': 2,
            'kat': 5,
            'brit': 6,
            'norm': 0
        },
        LABELS: {
            norm: 'нормальный',
            sp: 'спартаковский',
            tiki: 'тики-така',
            brazil: 'бразильский',
            brit: 'британский',
            bb: 'бей-беги',
            kat: 'катеначчо'
        },
        ORDER: ['norm', 'sp', 'tiki', 'brazil', 'brit', 'bb', 'kat'],
        // Обратное соответствие: числовой стиль → строковый
        NUMERIC_TO_STRING: {
            0: 'norm',
            1: 'sp', 
            2: 'bb',
            3: 'brazil',
            4: 'tiki',
            5: 'kat',
            6: 'brit'
        }
    },
    WEATHER: {
        OPTIONS: ["очень жарко", "жарко", "солнечно", "облачно", "пасмурно", "дождь", "снег"],
        TEMP_MAP: {
            "очень жарко": [30, 26],
            "жарко": [29, 15],
            "солнечно": [29, 10],
            "облачно": [25, 5],
            "пасмурно": [20, 1],
            "дождь": [15, 1],
            "снег": [4, 0]
        }
    },
    BONUSES: {
        MORALE: {
            SUPER_DEFAULT: 0.27,
            REST_DEFAULT: -0.1
        },
        HOME: {
            100: 0.15,
            90: 0.10,
            80: 0.05,
            DEFAULT: 0.025
        },
        POSITION_BONUS_TABLE: {
            bb: { ST: 0.11, CF: 0.06, LF: 0.00, RF: 0.00, AM: -0.05, CM: -0.05, DM: 0.00, LW: -0.05, LM: -0.05, LB: 0.11, LD: 0.00, RW: -0.05, RM: -0.05, RB: 0.11, RD: 0.00, CD: 0.06, SW: 0.00, FR: 0.00, GK: 0.00 },
            tiki: { ST: -0.05, CF: 0.00, LF: 0.00, RF: 0.00, AM: 0.04, CM: 0.08, DM: 0.00, LW: 0.04, LM: 0.04, LB: 0.00, LD: -0.05, RW: 0.04, RM: 0.04, RB: 0.00, RD: -0.00, CD: 0.00, SW: 0.05, FR: 0.00, GK: 0.00 },
            brit: { ST: 0.00, CF: -0.05, LF: 0.05, RF: 0.05, AM: -0.09, CM: -0.05, DM: -0.09, LW: 0.09, LM: 0.05, LB: 0.05, LD: 0.05, RW: 0.09, RM: 0.05, RB: 0.05, RD: 0.05, CD: 0.00, SW: -0.05, FR: 0.00, GK: 0.00 },
            sp: { ST: 0.00, CF: 0.07, LF: -0.06, RF: -0.06, AM: 0.09, CM: 0.00, DM: 0.09, LW: -0.11, LM: -0.05, LB: -0.11, LD: 0.00, RW: -0.11, RM: -0.05, RB: -0.11, RD: 0.00, CD: 0.00, SW: 0.05, FR: 0.00, GK: 0.00 },
            kat: { ST: -0.04, CF: -0.04, LF: -0.04, RF: -0.04, AM: -0.04, CM: 0.00, DM: 0.07, LW: -0.04, LM: 0.00, LB: 0.07, LD: 0.07, RW: -0.04, RM: 0.00, RB: 0.07, RD: 0.07, CD: 0.00, SW: 0.13, FR: 0.00, GK: 0.00 },
            brazil: { ST: 0.08, CF: 0.04, LF: 0.04, RF: 0.04, AM: 0.04, CM: 0.00, DM: -0.05, LW: 0.04, LM: 0.00, LB: 0.00, LD: -0.05, RW: 0.04, RM: 0.00, RB: 0.00, RD: -0.05, CD: -0.05, SW: -0.09, FR: 0.00, GK: 0.00 },
            norm: {}
        }
    },
    STORAGE_KEYS: {
        HOME: 'vs_calc_home',
        AWAY: 'vs_calc_away'
    },
    POSITION_MODIFIERS: {
        'GK': {
            'GK': 1.0,
        },
        'CD': {
            'SW': 1.0,
            'CD': 1.0,
            'LD': 0.9, 'RD': 0.9, 'LB': 0.85, 'RB': 0.85,
            'DM': 0.95,
            'CM': 0.8, 'LM': 0.7, 'RM': 0.7, 'FR': 1.0,
            'AM': 0.75,
            'CF': 0.7, 'ST': 0.7, 'LF': 0.7, 'RF': 0.7, 'LW': 0.7, 'RW': 0.7
        },
        'LD': {
            'SW': 0.9,
            'CD': 0.9,
            'LD': 1.0,
            'RD': 0.8, 'LB': 0.95, 'RB': 0.75,
            'DM': 0.85,
            'LM': 0.9, 'RM': 0.8,
            'CM': 0.7, 'FR': 1.0,
            'AM': 0.65,
            'LW': 0.85, 'RW': 0.65,
            'CF': 0.7, 'ST': 0.7, 'LF': 0.7, 'RF': 0.7
        },
        'RD': {
            'SW': 0.9,
            'CD': 0.9,
            'RD': 1.0,
            'LD': 0.8, 'LB': 0.75, 'RB': 0.95,
            'DM': 0.85,
            'LM': 0.8, 'RM': 0.9,
            'CM': 0.7, 'FR': 1.0,
            'AM': 0.65,
            'LW': 0.65, 'RW': 0.85,
            'CF': 0.7, 'ST': 0.7, 'LF': 0.7, 'RF': 0.7
        },
        'CM': {
            'SW': 0.8,
            'CD': 0.8,
            'LD': 0.7, 'RD': 0.7, 'LB': 0.7, 'RB': 0.7,
            'DM': 0.95,
            'CM': 1.0,
            'LM': 0.9, 'RM': 0.9, 'FR': 1.0,
            'AM': 0.95,
            'CF': 0.8, 'ST': 0.8, 'LF': 0.7, 'RF': 0.7, 'LW': 0.7, 'RW': 0.7
        },
        'LM': {
            'SW': 0.7, 'CD': 0.7, 'DM': 0.85, 'CM': 0.9, 'AM': 0.7, 'CF': 0.7, 'ST': 0.7,
            'LD': 0.9, 'LB': 0.95, 'LM': 1.0, 'LW': 0.95, 'LF': 0.9,
            'RD': 0.7, 'RB': 0.7, 'RM': 0.8, 'RW': 0.7, 'RF': 0.7,
            'FR': 1.0,
        },
        'RM': {
            'SW': 0.7, 'CD': 0.7, 'DM': 0.85, 'CM': 0.9, 'AM': 0.7, 'CF': 0.7, 'ST': 0.7,
            'LD': 0.7, 'LB': 0.7, 'LM': 0.8, 'LW': 0.7, 'LF': 0.7,
            'RD': 0.9, 'RB': 0.95, 'RM': 1.0, 'RW': 0.95, 'RF': 0.9,
            'FR': 1.0
        },
        'CF': {
            'SW': 0.7, 'CD': 0.7, 'DM': 0.75, 'CM': 0.8, 'AM': 0.9, 'CF': 1.0, 'ST': 1.0,
            'LD': 0.7, 'LB': 0.7, 'LM': 0.7, 'LW': 0.7, 'LF': 0.9,
            'RD': 0.7, 'RB': 0.7, 'RM': 0.7, 'RW': 0.7, 'RF': 0.9,
            'FR': 1.0,
        },
        'LF': {
            'SW': 0.7, 'CD': 0.7, 'DM': 0.7, 'CM': 0.7, 'AM': 0.7, 'CF': 0.9, 'ST': 0.9,
            'LD': 0.7, 'LB': 0.85, 'LM': 0.9, 'LW': 0.95, 'LF': 1.0,
            'RD': 0.7, 'RB': 0.7, 'RM': 0.7, 'RW': 0.7, 'RF': 0.9,
            'FR': 1.0,
        },
        'RF': {
            'SW': 0.7, 'CD': 0.7, 'DM': 0.7, 'CM': 0.7, 'AM': 0.7, 'CF': 0.9, 'ST': 0.9,
            'LD': 0.7, 'LB': 0.7, 'LM': 0.7, 'LW': 0.7, 'LF': 0.9,
            'RD': 0.7, 'RB': 0.85, 'RM': 0.9, 'RW': 0.95, 'RF': 1.0,
            'FR': 1.0,
        }
    },
    PHYSICAL_FORM: {
        FORMS: {
            'C_76_down': { percent: 76, trend: 'down', title: '76%, падает', bgPosition: '-18px -19px', modifier: 0.76, type: 'C' },
            'C_76_up': { percent: 76, trend: 'up', title: '76%, растёт', bgPosition: '0px -19px', modifier: 0.76, type: 'C' },
            'C_83_down': { percent: 83, trend: 'down', title: '83%, падает', bgPosition: '-18px -57px', modifier: 0.83, type: 'C' },
            'C_83_up': { percent: 83, trend: 'up', title: '83%, растёт', bgPosition: '0px -57px', modifier: 0.83, type: 'C' },
            'C_94_down': { percent: 94, trend: 'down', title: '94%, падает', bgPosition: '-18px -95px', modifier: 0.94, type: 'C' },
            'C_94_up': { percent: 94, trend: 'up', title: '94%, растёт', bgPosition: '0px -95px', modifier: 0.94, type: 'C' },
            'C_106_down': { percent: 106, trend: 'down', title: '106%, падает', bgPosition: '-18px -133px', modifier: 1.06, type: 'C' },
            'C_106_up': { percent: 106, trend: 'up', title: '106%, растёт', bgPosition: '0px -133px', modifier: 1.06, type: 'C' },
            'C_117_down': { percent: 117, trend: 'down', title: '117%, падает', bgPosition: '-18px -171px', modifier: 1.17, type: 'C' },
            'C_117_up': { percent: 117, trend: 'up', title: '117%, растёт', bgPosition: '0px -171px', modifier: 1.17, type: 'C' },
            'C_124_down': { percent: 124, trend: 'down', title: '124%, падает', bgPosition: '-18px -209px', modifier: 1.24, type: 'C' },
            'C_124_up': { percent: 124, trend: 'up', title: '124%, растёт', bgPosition: '0px -209px', modifier: 1.24, type: 'C' },
            'B_75_up': { percent: 75, trend: 'up', title: '75%, растёт', bgPosition: '0px 0px', modifier: 0.75, type: 'B' },
            'B_79_down': { percent: 79, trend: 'down', title: '79%, падает', bgPosition: '-18px -38px', modifier: 0.79, type: 'B' },
            'B_79_up': { percent: 79, trend: 'up', title: '79%, растёт', bgPosition: '0px -38px', modifier: 0.79, type: 'B' },
            'B_88_down': { percent: 88, trend: 'down', title: '88%, падает', bgPosition: '-18px -76px', modifier: 0.88, type: 'B' },
            'B_88_up': { percent: 88, trend: 'up', title: '88%, растёт', bgPosition: '0px -76px', modifier: 0.88, type: 'B' },
            'B_100_down': { percent: 100, trend: 'down', title: '100%, падает', bgPosition: '-18px -114px', modifier: 1.0, type: 'B' },
            'B_100_up': { percent: 100, trend: 'up', title: '100%, растёт', bgPosition: '0px -114px', modifier: 1.0, type: 'B' },
            'B_112_down': { percent: 112, trend: 'down', title: '112%, падает', bgPosition: '-18px -152px', modifier: 1.12, type: 'B' },
            'B_112_up': { percent: 112, trend: 'up', title: '112%, растёт', bgPosition: '0px -152px', modifier: 1.12, type: 'B' },
            'B_121_down': { percent: 121, trend: 'down', title: '121%, падает', bgPosition: '-18px -190px', modifier: 1.21, type: 'B' },
            'B_121_up': { percent: 121, trend: 'up', title: '121%, растёт', bgPosition: '0px -190px', modifier: 1.21, type: 'B' },
            'B_125_down': { percent: 125, trend: 'down', title: '125%, падает', bgPosition: '-18px -228px', modifier: 1.25, type: 'B' },
            'FRIENDLY_100': { percent: 100, trend: 'stable', title: '100% (товарищеский)', bgPosition: '0px -114px', modifier: 1.0, type: 'FRIENDLY' },
            'UNKNOWN': { percent: 100, trend: 'unknown', title: 'Неизвестно', bgPosition: '0px -247px', modifier: 1.0, type: 'UNKNOWN' }
        },
        TOURNAMENT_TYPES: {
            'typeC': ['C_76_down', 'C_76_up', 'C_83_down', 'C_83_up', 'C_94_down', 'C_94_up', 'C_106_down', 'C_106_up', 'C_117_down', 'C_117_up', 'C_124_down', 'C_124_up', 'UNKNOWN'],
            'typeC_international': ['C_76_down', 'C_76_up', 'C_83_down', 'C_83_up', 'C_94_down', 'C_94_up', 'C_106_down', 'C_106_up', 'C_117_down', 'C_117_up', 'C_124_down', 'C_124_up', 'UNKNOWN'],
            'typeB': ['B_79_up', 'B_75_up', 'B_79_down', 'B_88_down', 'B_88_up', 'B_100_down', 'B_100_up', 'B_112_down', 'B_112_up', 'B_121_down', 'B_121_up', 'B_125_down', 'UNKNOWN'],
            'typeB_amateur': ['B_79_up', 'B_75_up', 'B_79_down', 'B_88_down', 'B_88_up', 'B_100_down', 'B_100_up', 'B_112_down', 'B_112_up', 'B_121_down', 'B_121_up', 'B_125_down', 'UNKNOWN'],
            'friendly': ['FRIENDLY_100', 'UNKNOWN'],
            'all': ['C_76_down', 'C_76_up', 'C_83_down', 'C_83_up', 'C_94_down', 'C_94_up', 'C_106_down', 'C_106_up', 'C_117_down', 'C_117_up', 'C_124_down', 'C_124_up', 'B_75_up', 'B_79_down', 'B_79_up', 'B_88_down', 'B_88_up', 'B_100_down', 'B_100_up', 'B_112_down', 'B_112_up', 'B_121_down', 'B_121_up', 'B_125_down', 'FRIENDLY_100', 'UNKNOWN']
        }
    }
};

// Определение фланговой принадлежности позиций
const POSITION_FLANKS = {
    // Левый фланг
    'LD': 'left',
    'LB': 'left',
    'LM': 'left',
    'LW': 'left',
    'LF': 'left',

    // Правый фланг
    'RD': 'right',
    'RB': 'right',
    'RM': 'right',
    'RW': 'right',
    'RF': 'right',

    // Центр
    'GK': 'center',
    'SW': 'center',
    'CD': 'center',
    'DM': 'center',
    'CM': 'center',
    'AM': 'center',
    'FR': 'center',
    'CF': 'center',
    'ST': 'center'
};

// Получение фланга позиции
function getPositionFlank(position) {
    return POSITION_FLANKS[position] || 'center';
}

// Определение линии для позиции
function getPositionLine(position) {
    if (position === 'GK') return 'gk';
    if (['LD', 'CD', 'RD', 'SW'].includes(position)) return 'def';
    if (['DM', 'LB', 'RB'].includes(position)) return 'semidef';
    if (['LM', 'CM', 'RM'].includes(position)) return 'mid';
    if (['AM', 'FR', 'RW', 'LW'].includes(position)) return 'semiatt';
    if (['LF', 'CF', 'RF', 'ST'].includes(position)) return 'att';
    return 'unknown';
}

// Улучшенная функция генерации позиций с сохранением стабильности
function generateFieldPositionsWithFlankPreservation(formation, side, previousFormation = null) {
    console.log(`[FlankPositioning] Генерация позиций для ${side}:`, formation);
    if (previousFormation) {
        console.log(`[FlankPositioning] Предыдущие позиции:`, previousFormation);
    }

    const fieldWidth = FIELD_LAYOUT.WORKING_WIDTH;   // 332px
    const fieldHeight = FIELD_LAYOUT.WORKING_HEIGHT; // 498px
    const isHome = side === 'home';

    const zones = isHome ? {
        gk: 549,      // 566 - 17 (максимально прижат к низу)
        def: 499,     // Скорректировано для новой рабочей области
        semidef: 475, // Скорректировано
        mid: 449,     // Скорректировано
        semiatt: 424, // Скорректировано
        att: 339      // Скорректировано
    } : {
        gk: 67,       // 0 + 17 (максимально прижат к верху)
        def: 127,      // Скорректировано для новой рабочей области
        semidef: 157, // Скорректировано
        mid: 202,     // Скорректировано, расстояние по 75 px до def и att
        semiatt: 232, // Скорректировано, +50 px от mid
        att: 277      // Скорректировано
    };

    const positions = [];

    // Анализ изменений между предыдущей и текущей формацией
    // TODO: Реализовать полную логику стабильности позиций
    // Пока используем улучшенное фланговое позиционирование

    // Группировка по линиям с сохранением фланговой информации
    const lines = {
        gk: [],
        def: [],
        semidef: [],
        mid: [],
        semiatt: [],
        att: []
    };

    formation.forEach((pos, idx) => {
        const flank = getPositionFlank(pos);
        const playerInfo = { pos, idx, flank };

        console.log(`[FlankPositioning] Игрок ${idx}: ${pos} -> фланг: ${flank}`);

        if (pos === 'GK') {
            lines.gk.push(playerInfo);
        } else if (['LD', 'CD', 'RD', 'SW'].includes(pos)) {
            lines.def.push(playerInfo);
        } else if (['DM', 'LB', 'RB'].includes(pos)) {
            lines.semidef.push(playerInfo);
        } else if (['LM', 'CM', 'RM'].includes(pos)) {
            lines.mid.push(playerInfo);
        } else if (['AM', 'FR', 'RW', 'LW'].includes(pos)) {
            lines.semiatt.push(playerInfo);
        } else if (['LF', 'CF', 'RF', 'ST'].includes(pos)) {
            lines.att.push(playerInfo);
        }
    });

    // Улучшенная функция распределения с учетом фланга
    function distributeHorizontallyWithStability(playersInfo, lineType) {
        return distributeByFlanks(playersInfo);
    }

    // Улучшенное распределение по флангам с учетом смешанных линий
    function distributeByFlanks(playersInfo) {
        const count = playersInfo.length;
        const margin = 10;
        const usableWidth = fieldWidth - 2 * margin;

        console.log(`[FlankDistribution] Распределение ${count} игроков:`, playersInfo.map(p => `${p.pos}(${p.flank})`));

        // Группируем игроков по флангам
        const leftPlayers = playersInfo.filter(p => p.flank === 'left');
        const centerPlayers = playersInfo.filter(p => p.flank === 'center');
        const rightPlayers = playersInfo.filter(p => p.flank === 'right');

        console.log(`[FlankDistribution] Группировка: левые=${leftPlayers.length}, центр=${centerPlayers.length}, правые=${rightPlayers.length}`);

        const result = [];

        // Определяем координаты для каждой группы
        const coords = calculateFlankCoordinates(leftPlayers.length, centerPlayers.length, rightPlayers.length, margin, usableWidth);

        // Размещаем левых игроков
        leftPlayers.forEach((player, index) => {
            const x = coords.left[index] || coords.left[0];
            result.push({ player, x });
            console.log(`[FlankDistribution] ${player.pos}(left) -> x=${x.toFixed(0)}`);
        });

        // Размещаем центральных игроков
        centerPlayers.forEach((player, index) => {
            const x = coords.center[index] || fieldWidth / 2;
            result.push({ player, x });
            console.log(`[FlankDistribution] ${player.pos}(center) -> x=${x.toFixed(0)}`);
        });

        // Размещаем правых игроков
        rightPlayers.forEach((player, index) => {
            const x = coords.right[index] || coords.right[0];
            result.push({ player, x });
            console.log(`[FlankDistribution] ${player.pos}(right) -> x=${x.toFixed(0)}`);
        });

        // Сортируем результат по x координате для корректного отображения
        return result.sort((a, b) => a.x - b.x);
    }

    // Функция расчета координат для каждого фланга
    function calculateFlankCoordinates(leftCount, centerCount, rightCount, margin, usableWidth) {
        const coords = { left: [], center: [], right: [] };

        // Левый фланг
        if (leftCount === 1) {
            coords.left = [margin + usableWidth * 0.1]; // 10% от ширины
        } else if (leftCount > 1) {
            // Несколько левых игроков - распределяем в левой зоне (5-20%)
            for (let i = 0; i < leftCount; i++) {
                const x = margin + usableWidth * (0.05 + (0.15 / Math.max(1, leftCount - 1)) * i);
                coords.left.push(x);
            }
        }

        // Правый фланг
        if (rightCount === 1) {
            coords.right = [margin + usableWidth * 0.9]; // 90% от ширины
        } else if (rightCount > 1) {
            // Несколько правых игроков - распределяем в правой зоне (80-95%)
            for (let i = 0; i < rightCount; i++) {
                const x = margin + usableWidth * (0.8 + (0.15 / Math.max(1, rightCount - 1)) * i);
                coords.right.push(x);
            }
        }

        // Центральные игроки
        if (centerCount === 1) {
            coords.center = [fieldWidth / 2]; // Точный центр
        } else if (centerCount === 2) {
            // Два центральных - слева и справа от центра
            coords.center = [
                margin + usableWidth * 0.35, // 35%
                margin + usableWidth * 0.65  // 65%
            ];
        } else if (centerCount === 3) {
            // Три центральных - левый центр, центр, правый центр
            coords.center = [
                margin + usableWidth * 0.3,  // 30%
                fieldWidth / 2,              // 50%
                margin + usableWidth * 0.7   // 70%
            ];
        } else if (centerCount > 3) {
            // Много центральных - равномерно в центральной зоне (25-75%)
            const centerZoneStart = margin + usableWidth * 0.25;
            const centerZoneWidth = usableWidth * 0.5;
            for (let i = 0; i < centerCount; i++) {
                const x = centerZoneStart + (centerZoneWidth / Math.max(1, centerCount - 1)) * i;
                coords.center.push(x);
            }
        }

        console.log(`[FlankDistribution] Координаты:`, {
            left: coords.left.map(x => x.toFixed(0)),
            center: coords.center.map(x => x.toFixed(0)),
            right: coords.right.map(x => x.toFixed(0))
        });

        return coords;
    }

    // Размещение игроков по линиям
    Object.entries(lines).forEach(([lineType, playersInfo]) => {
        if (playersInfo.length === 0) return;

        const zone = zones[lineType];
        const positionsWithPlayers = distributeHorizontallyWithStability(playersInfo, lineType);

        console.log(`[FlankPositioning] Линия ${lineType}:`, positionsWithPlayers.map(p => {
            const finalX = isHome ? p.x : (fieldWidth - p.x);
            return `${p.player.pos}(${p.player.flank}) -> x:${p.x.toFixed(0)} -> final:${finalX.toFixed(0)}`;
        }));

        positionsWithPlayers.forEach(({ player, x }) => {
            // Зеркалируем координаты для гостевой команды
            const finalX = isHome ? x : (fieldWidth - x);

            positions[player.idx] = {
                position: player.pos,
                top: zone,
                left: finalX
            };
        });
    });

    console.log(`[FlankPositioning] Итоговые позиции для ${side}:`, positions);
    
    // Применяем ограничения координат чтобы футболки не выходили за границы
    const SHIRT_HALF_WIDTH = FIELD_LAYOUT.SHIRT_HALF_WIDTH;   // 20px
    const SHIRT_HALF_HEIGHT = FIELD_LAYOUT.SHIRT_HALF_HEIGHT; // 17px
    
    const MIN_X = SHIRT_HALF_WIDTH;
    const MAX_X = fieldWidth - SHIRT_HALF_WIDTH;
    const MIN_Y = SHIRT_HALF_HEIGHT;
    const MAX_Y = fieldHeight - SHIRT_HALF_HEIGHT;
    
    positions.forEach(pos => {
        if (pos) {
            // Ограничиваем координаты
            pos.left = Math.max(MIN_X, Math.min(MAX_X, pos.left));
            pos.top = Math.max(MIN_Y, Math.min(MAX_Y, pos.top));
        }
    });
    
    console.log(`[FlankPositioning] Позиции после ограничений для ${side}:`, positions);
    
    return positions;
}

function generateFieldPositions(formation, side) {
    const fieldWidth = FIELD_LAYOUT.WORKING_WIDTH;   // 332px
    const fieldHeight = FIELD_LAYOUT.WORKING_HEIGHT; // 498px
    const isHome = side === 'home';

    const zones = isHome ? {
        gk: 549,      // 566 - 17 (максимально прижат к низу)
        def: 498,     // Скорректировано для новой рабочей области
        semidef: 447, // Скорректировано
        mid: 396,     // Скорректировано
        semiatt: 345, // Скорректировано
        att: 294      // Скорректировано
    } : {
        gk: 17,       // 0 + 17 (максимально прижат к верху)
        def: 68,      // Скорректировано для новой рабочей области
        semidef: 119, // Скорректировано
        mid: 170,     // Скорректировано
        semiatt: 221, // Скорректировано
        att: 272      // Скорректировано
    };

    const positions = [];

    const lines = {
        gk: [],
        def: [],
        semidef: [],
        mid: [],
        semiatt: [],
        att: []
    };

    formation.forEach((pos, idx) => {
        if (pos === 'GK') {
            lines.gk.push({ pos, idx });
        } else if (['LD', 'CD', 'RD', 'SW'].includes(pos)) {
            lines.def.push({ pos, idx });
        } else if (['DM', 'LB', 'RB'].includes(pos)) {
            lines.semidef.push({ pos, idx });
        } else if (['LM', 'CM', 'RM'].includes(pos)) {
            lines.mid.push({ pos, idx });
        } else if (['AM', 'FR', 'RW', 'LW'].includes(pos)) {
            lines.semiatt.push({ pos, idx });
        } else if (['LF', 'CF', 'RF', 'ST'].includes(pos)) {
            lines.att.push({ pos, idx });
        }
    });

    function distributeHorizontally(count) {
        const margin = 10;
        const usableWidth = fieldWidth - 2 * margin;

        if (count === 1) {
            return [fieldWidth / 2];
        } else if (count === 2) {
            return [margin + usableWidth * 0.25, margin + usableWidth * 0.75];
        } else if (count === 3) {
            return [margin, fieldWidth / 2, fieldWidth - margin];
        } else if (count === 4) {
            return [margin, margin + usableWidth / 3, margin + 2 * usableWidth / 3, fieldWidth - margin];
        } else if (count === 5) {
            return [margin, margin + usableWidth / 4, fieldWidth / 2, margin + 3 * usableWidth / 4, fieldWidth - margin];
        } else if (count === 6) {
            return [margin, margin + usableWidth / 5, margin + 2 * usableWidth / 5, margin + 3 * usableWidth / 5, margin + 4 * usableWidth / 5, fieldWidth - margin];
        }

        const positions = [];
        for (let i = 0; i < count; i++) {
            positions.push(margin + (usableWidth / (count - 1)) * i);
        }
        return positions;
    }

    if (lines.gk.length > 0) {
        lines.gk.forEach(({ pos, idx }) => {
            positions[idx] = { position: pos, top: zones.gk, left: fieldWidth / 2 };
        });
    }

    if (lines.def.length > 0) {
        const xPositions = distributeHorizontally(lines.def.length);
        lines.def.forEach(({ pos, idx }, i) => {
            const xIdx = isHome ? i : (lines.def.length - 1 - i);
            positions[idx] = { position: pos, top: zones.def, left: xPositions[xIdx] };
        });
    }

    if (lines.semidef.length > 0) {
        const xPositions = distributeHorizontally(lines.semidef.length);
        lines.semidef.forEach(({ pos, idx }, i) => {
            const xIdx = isHome ? i : (lines.semidef.length - 1 - i);
            positions[idx] = { position: pos, top: zones.semidef, left: xPositions[xIdx] };
        });
    }

    if (lines.mid.length > 0) {
        const xPositions = distributeHorizontally(lines.mid.length);
        lines.mid.forEach(({ pos, idx }, i) => {
            const xIdx = isHome ? i : (lines.mid.length - 1 - i);
            positions[idx] = { position: pos, top: zones.mid, left: xPositions[xIdx] };
        });
    }

    if (lines.semiatt.length > 0) {
        const xPositions = distributeHorizontally(lines.semiatt.length);
        lines.semiatt.forEach(({ pos, idx }, i) => {
            const xIdx = isHome ? i : (lines.semiatt.length - 1 - i);
            positions[idx] = { position: pos, top: zones.semiatt, left: xPositions[xIdx] };
        });
    }

    if (lines.att.length > 0) {
        const xPositions = distributeHorizontally(lines.att.length);
        lines.att.forEach(({ pos, idx }, i) => {
            const xIdx = isHome ? i : (lines.att.length - 1 - i);
            positions[idx] = { position: pos, top: zones.att, left: xPositions[xIdx] };
        });
    }

    // Применяем ограничения координат чтобы футболки не выходили за границы
    const SHIRT_HALF_WIDTH = FIELD_LAYOUT.SHIRT_HALF_WIDTH;   // 20px
    const SHIRT_HALF_HEIGHT = FIELD_LAYOUT.SHIRT_HALF_HEIGHT; // 17px
    
    const MIN_X = SHIRT_HALF_WIDTH;
    const MAX_X = fieldWidth - SHIRT_HALF_WIDTH;
    const MIN_Y = SHIRT_HALF_HEIGHT;
    const MAX_Y = fieldHeight - SHIRT_HALF_HEIGHT;
    
    positions.forEach(pos => {
        if (pos) {
            // Ограничиваем координаты
            pos.left = Math.max(MIN_X, Math.min(MAX_X, pos.left));
            pos.top = Math.max(MIN_Y, Math.min(MAX_Y, pos.top));
        }
    });

    return positions;
}

const DEFAULT_SHIRT = 'pics/shirts/sh_4_sm.png';
const DEFAULT_GK_SHIRT = 'pics/shirts/sh_4_sm.png';

window.debugFieldGrid = function () {
    const fieldCol = document.querySelector('td[style*="field_01.webp"]');
    if (!fieldCol) {
        console.error('Field not found');
        return;
    }

    const oldGrid = fieldCol.querySelector('.debug-grid');
    if (oldGrid) {
        oldGrid.remove();
        console.log('Debug grid removed.');
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'debug-grid';
    const padding = FIELD_LAYOUT.CONTAINER_PADDING;
    grid.style.cssText = `
        position: absolute;
        top: ${padding}px;
        left: ${padding}px;
        right: ${padding}px;
        bottom: ${padding}px;
        pointer-events: none;
        z-index: 5;
        border: 2px solid rgba(255, 0, 0, 0.5);
    `;

    [1, 50, 100, 145, 190, 235, 265, 310, 355, 400, 450, 497].forEach(y => {
        const line = document.createElement('div');
        line.style.cssText = `
            position: absolute;
            top: ${y}px;
            left: 0;
            width: 100%;
            height: 1px;
            background: rgba(255, 0, 0, 0.3);
        `;
        grid.appendChild(line);
    });

    const centerX = 332 / 2;
    [10, centerX, 322].forEach(x => {
        const line = document.createElement('div');
        line.style.cssText = `
            position: absolute;
            top: 0;
            left: ${x}px;
            width: 1px;
            height: 100%;
            background: rgba(0, 0, 255, 0.3);
        `;
        grid.appendChild(line);
    });

    fieldCol.appendChild(grid);
    console.log('Debug grid added. Red lines = zones, Blue lines = horizontal distribution. Call window.debugFieldGrid() again to remove.');
};

const COLLISION_NONE = CONFIG.COLLISION.NONE;
const COLLISION_WIN = CONFIG.COLLISION.WIN;
const COLLISION_LOSE = CONFIG.COLLISION.LOSE;
const STYLE_VALUES = CONFIG.STYLES.VALUES;

function VSStorage() {
    const hasGMGet = typeof GM_getValue === 'function';
    const hasGMSet = typeof GM_setValue === 'function';
    return {
        get(key) {
            try {
                if (hasGMGet) return GM_getValue(key, null);
                const v = localStorage.getItem(key);
                return v === null ? null : v;
            } catch (e) {
                return null;
            }
        },
        set(key, value) {
            try {
                if (hasGMSet) return GM_setValue(key, value);
                localStorage.setItem(key, value);
            } catch (e) {
            }
        }
    };
}
const vsStorage = VSStorage();
const collision_bonuses = {
    norm: null,
    sp: {
        brit: 0.38
    },
    bb: {
        sp: 0.42
    },
    brazil: {
        bb: 0.34
    },
    tiki: {
        kat: 0.36
    },
    kat: {
        brazil: 0.44
    },
    brit: {
        tiki: 0.40
    }
};

// ===== CHEMISTRY SYSTEM (Система взаимопонимания игроков) =====

/**
 * Преобразует числовой стиль из hidden_style в строковое значение для селектора
 * @param {number} numericStyle - Числовой стиль (0-6)
 * @returns {string} - Строковое значение стиля
 */
function convertNumericStyleToString(numericStyle) {
    return CONFIG.STYLES.NUMERIC_TO_STRING[numericStyle] || 'norm';
}

/**
 * Проверяет есть ли коллизия между двумя стилями
 * @param {string} style1 - Стиль первого игрока
 * @param {string} style2 - Стиль второго игрока
 * @returns {boolean} - true если стили в коллизии
 */
function areStylesInCollision(style1, style2) {
    if (!style1 || !style2 || style1 === 'norm' || style2 === 'norm') {
        return false;
    }
    
    // Проверяем есть ли победа style1 над style2
    const style1Wins = collision_bonuses[style1];
    const style1BeatsStyle2 = !!(style1Wins && style1Wins[style2]);
    
    // Проверяем есть ли победа style2 над style1
    const style2Wins = collision_bonuses[style2];
    const style2BeatsStyle1 = !!(style2Wins && style2Wins[style1]);
    
    // Коллизия есть если один стиль побеждает другой
    return style1BeatsStyle2 || style2BeatsStyle1;
}

/**
 * Рассчитывает модификатор линии между двумя игроками
 * @param {Object} player1 - Первый игрок
 * @param {Object} player2 - Второй игрок
 * @returns {number} - Модификатор линии от -0.05 до +0.125
 */
function calculateLineModifier(player1, player2) {
    // 1. Проверка на игрока от Лиги (нет стиля)
    if (!player1.hidden_style || !player2.hidden_style) {
        return 0;
    }
    
    // 2. Проверка на коллизию стилей (приоритет!)
    if (areStylesInCollision(player1.hidden_style, player2.hidden_style)) {
        return -0.05; // -5%
    }
    
    // 3. Проверка на совпадение стилей
    if (player1.hidden_style === player2.hidden_style) {
        // TODO: Добавить логику изученности стиля когда будут доступны данные
        // Пока используем максимальный бонус для совпадающих стилей
        return 0.125; // 12.5%
    }
    
    // 4. Проверка на совпадение национальностей
    if (player1.nat_id && player2.nat_id && player1.nat_id === player2.nat_id) {
        return 0.05; // минимум 5%
    }
    
    // 5. Все остальные случаи (разные нац, разные стили без коллизии)
    return 0;
}

/**
 * Определяет является ли формация 4-2-4
 * @param {Array} positions - Массив позиций в составе
 * @returns {boolean} - true если формация 4-2-4
 */
function is424Formation(positions) {
    if (!positions) return false;
    
    const defenderCount = positions.filter(p => 
        ['LD', 'LB', 'CD', 'SW', 'RD', 'RB'].includes(p)
    ).length;
    
    const cmCount = positions.filter(p => p === 'CM').length;
    
    const forwardCount = positions.filter(p => 
        ['LF', 'CF', 'RF', 'ST', 'LW', 'RW'].includes(p)
    ).length;
    
    return defenderCount === 4 && cmCount === 2 && forwardCount === 4;
}

/**
 * Определяет тип CF по его индексу в составе
 * @param {Array} positions - Массив позиций в составе
 * @param {number} cfIndex - Индекс текущего CF
 * @returns {string} - Тип CF: 'single', 'middle', 'min', 'max', 'other'
 */
function getCFType(positions, cfIndex) {
    if (!positions || cfIndex < 0) return 'other';
    
    const cfIndices = [];
    positions.forEach((pos, idx) => {
        if (pos === 'CF') cfIndices.push(idx);
    });
    
    const cfCount = cfIndices.length;
    
    if (cfCount === 0) return 'other';
    if (cfCount === 1) return 'single';
    if (cfCount === 3 && cfIndex === cfIndices[1]) return 'middle';
    if (cfIndex === Math.min(...cfIndices)) return 'min';
    if (cfIndex === Math.max(...cfIndices)) return 'max';
    
    return 'other';
}

/**
 * Получает CM по "same index" с CF (соответствующий индекс)
 * @param {Array} positions - Массив позиций в составе
 * @param {string} cfType - Тип CF ('min', 'max')
 * @returns {number} - Индекс CM или -1
 */
function getCMBySameIndex(positions, cfType) {
    if (!positions) return -1;
    
    const cmIndices = [];
    positions.forEach((pos, idx) => {
        if (pos === 'CM') cmIndices.push(idx);
    });
    
    if (cmIndices.length === 0) return -1;
    
    if (cfType === 'min') {
        return Math.min(...cmIndices);
    } else if (cfType === 'max') {
        return Math.max(...cmIndices);
    }
    
    return -1;
}

/**
 * Подсчитывает количество позиций в составе
 * @param {Array} positions - Массив позиций
 * @param {string} position - Позиция для подсчета
 * @returns {number} - Количество
 */
function countPositionInLineup(positions, position) {
    if (!positions) return 0;
    return positions.filter(p => p === position).length;
}

/**
 * Получает связанные позиции для данной позиции
 * @param {string} position - Позиция игрока
 * @param {Array} lineup - Состав команды (массив позиций)
 * @param {number} playerIndex - Индекс игрока в составе (опционально, для динамических позиций)
 * @returns {Array} - Массив связанных позиций
 */
function getPositionConnections(position, lineup, playerIndex = -1) {
    // Специальная логика для GK - динамические связи
    if (position === 'GK') {
        return getGKConnections(lineup);
    }
    
    // Обновленная матрица связей согласно CHEMISTRY_CONNECTIONS_GRAPH.md v0.945
    const connections = {
        // Защитники
        'LD': {
            direct: ['GK', 'CD'],
            priorityAttack: ['LM', 'LW', 'LF'], // Приоритетная связь с атакой (первый найденный)
            conditions: {
                'GK': (lineup) => {
                    // GK связь только если CD count != 3
                    const cdCount = countPositionInLineup(lineup, 'CD');
                    return cdCount !== 3;
                }
            },
            cdSelector: 'min' // LD связан с CD с минимальным индексом (ближайший слева)
        },
        'LB': {
            // LB имеет динамические связи
            dynamic: true
        },
        'CD': {
            // CD имеет динамические связи в зависимости от типа (single, middle, min, max)
            // Обрабатывается специальной логикой в getPositionConnections
            dynamic: true
        },
        'SW': {
            // SW связан с GK и всеми CD
            direct: ['GK'],
            connectToAllCD: true // Специальный флаг для связи со всеми CD
        },
        'RD': {
            direct: ['GK', 'CD'],
            priorityAttack: ['RM', 'RW', 'RF'], // Приоритетная связь с атакой (первый найденный)
            conditions: {
                'GK': (lineup) => {
                    // GK связь только если CD count != 3
                    const cdCount = countPositionInLineup(lineup, 'CD');
                    return cdCount !== 3;
                }
            },
            cdSelector: 'max' // RD связан с CD с максимальным индексом (ближайший справа)
        },
        'RB': {
            // RB имеет динамические связи
            dynamic: true
        },
        
        // Полузащитники
        'LM': {
            // LM имеет динамические связи
            dynamic: true
        },
        'LW': {
            direct: ['LM', 'AM', 'LF', 'CF']
        },
        'CM': {
            // CM имеет динамические связи в зависимости от типа (middle, min, max)
            dynamic: true
        },
        'DM': {
            // DM имеет динамические связи
            dynamic: true
        },
        'AM': {
            // AM имеет динамические связи
            dynamic: true
        },
        'FR': {
            direct: ['CD', 'CM', 'DM', 'AM', 'CF']
        },
        'RM': {
            // RM имеет динамические связи
            dynamic: true
        },
        'RW': {
            direct: ['RM', 'AM', 'RF', 'CF']
        },
        
        // Нападающие
        'LF': {
            // LF имеет динамические связи
            dynamic: true
        },
        'CF': {
            // CF имеет динамические связи
            dynamic: true
        },
        'RF': {
            // RF имеет динамические связи
            dynamic: true
        },
        'ST': {
            // ST имеет динамические связи
            dynamic: true
        }
    };
    
    const positionData = connections[position];
    if (!positionData) {
        console.warn(`[CHEMISTRY] Unknown position: ${position}`);
        return [];
    }
    
    // Специальная обработка для SW - связь со всеми CD
    if (position === 'SW' && positionData.connectToAllCD && lineup) {
        const directConnections = [...positionData.direct];
        
        // Добавляем все CD из состава
        lineup.forEach(pos => {
            if (pos === 'CD') {
                directConnections.push('CD');
            }
        });
        
        console.log(`[CHEMISTRY] SW connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для LB - динамические связи
    if (position === 'LB' && positionData.dynamic && lineup) {
        const directConnections = [];
        
        console.log(`[CHEMISTRY] LB connections building`);
        
        // 1. GK (если есть SW)
        if (lineup.includes('SW')) {
            directConnections.push('GK');
        }
        
        // 2. CD (min index если CD > 1)
        const cdIndices = [];
        lineup.forEach((pos, idx) => {
            if (pos === 'CD') cdIndices.push(idx);
        });
        
        if (cdIndices.length > 1) {
            directConnections.push('CD'); // Левый CD (min index)
        } else if (cdIndices.length === 1) {
            directConnections.push('CD');
        }
        
        // 3. Атака: LM || LW || LF
        if (lineup.includes('LM')) {
            directConnections.push('LM');
        } else if (lineup.includes('LW')) {
            directConnections.push('LW');
        } else if (lineup.includes('LF')) {
            directConnections.push('LF');
        }
        
        console.log(`[CHEMISTRY] LB connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для RB - динамические связи
    if (position === 'RB' && positionData.dynamic && lineup) {
        const directConnections = [];
        
        console.log(`[CHEMISTRY] RB connections building`);
        
        // 1. GK (если есть SW)
        if (lineup.includes('SW')) {
            directConnections.push('GK');
        }
        
        // 2. CD (max index если CD > 1)
        const cdIndices = [];
        lineup.forEach((pos, idx) => {
            if (pos === 'CD') cdIndices.push(idx);
        });
        
        if (cdIndices.length > 1) {
            directConnections.push('CD'); // Правый CD (max index)
        } else if (cdIndices.length === 1) {
            directConnections.push('CD');
        }
        
        // 3. Атака: RM || RW || RF
        if (lineup.includes('RM')) {
            directConnections.push('RM');
        } else if (lineup.includes('RW')) {
            directConnections.push('RW');
        } else if (lineup.includes('RF')) {
            directConnections.push('RF');
        }
        
        console.log(`[CHEMISTRY] RB connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для LM - динамические связи
    if (position === 'LM' && positionData.dynamic && lineup) {
        const directConnections = [];
        
        // 1. Связь с защитой: LD || LB
        if (lineup.includes('LD')) {
            directConnections.push('LD');
        } else if (lineup.includes('LB')) {
            directConnections.push('LB');
        }
        
        // 2. Связь с полузащитой: CM (min index) || DM (min index)
        const cmIndices = [];
        const dmIndices = [];
        lineup.forEach((pos, idx) => {
            if (pos === 'CM') cmIndices.push(idx);
            if (pos === 'DM') dmIndices.push(idx);
        });
        
        if (cmIndices.length > 0) {
            // Приоритет CM
            directConnections.push('CM'); // Левый CM (min index)
        } else if (dmIndices.length > 0) {
            directConnections.push('DM'); // Левый DM (min index)
        }
        
        // 3. Связь с атакой: LF || CF (min index) || ST
        if (lineup.includes('LF')) {
            directConnections.push('LF');
        } else {
            const cfIndices = [];
            lineup.forEach((pos, idx) => {
                if (pos === 'CF') cfIndices.push(idx);
            });
            
            if (cfIndices.length > 0) {
                directConnections.push('CF'); // Левый CF (min index)
            } else if (lineup.includes('ST')) {
                directConnections.push('ST');
            }
        }
        
        console.log(`[CHEMISTRY] LM connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для RM - динамические связи
    if (position === 'RM' && positionData.dynamic && lineup) {
        const directConnections = [];
        
        // 1. Связь с защитой: RD || RB
        if (lineup.includes('RD')) {
            directConnections.push('RD');
        } else if (lineup.includes('RB')) {
            directConnections.push('RB');
        }
        
        // 2. Связь с полузащитой: CM (max index) || DM (max index)
        const cmIndices = [];
        const dmIndices = [];
        lineup.forEach((pos, idx) => {
            if (pos === 'CM') cmIndices.push(idx);
            if (pos === 'DM') dmIndices.push(idx);
        });
        
        if (cmIndices.length > 0) {
            // Приоритет CM
            directConnections.push('CM'); // Правый CM (max index)
        } else if (dmIndices.length > 0) {
            directConnections.push('DM'); // Правый DM (max index)
        }
        
        // 3. Связь с атакой: RF || CF (max index) || ST
        if (lineup.includes('RF')) {
            directConnections.push('RF');
        } else {
            const cfIndices = [];
            lineup.forEach((pos, idx) => {
                if (pos === 'CF') cfIndices.push(idx);
            });
            
            if (cfIndices.length > 0) {
                directConnections.push('CF'); // Правый CF (max index)
            } else if (lineup.includes('ST')) {
                directConnections.push('ST');
            }
        }
        
        console.log(`[CHEMISTRY] RM connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для CD - динамические связи
    if (position === 'CD' && positionData.dynamic && lineup) {
        // Используем переданный playerIndex или находим первое вхождение
        const cdPlayerIndex = playerIndex >= 0 ? playerIndex : lineup.indexOf('CD');
        if (cdPlayerIndex === -1) return [];
        
        const cdType = getCDType(lineup, cdPlayerIndex);
        const directConnections = [];
        
        console.log(`[CHEMISTRY] CD type: ${cdType} at index ${cdPlayerIndex}`);
        
        // 1. Связь вверх: GK || SW (приоритет SW)
        if (lineup.includes('SW')) {
            directConnections.push('SW');
        } else {
            directConnections.push('GK');
        }
        
        // 2. Горизонтальные связи с другими CD
        switch(cdType) {
            case 'single':
                // Единственный CD не связан с другими CD
                break;
            case 'middle':
                // Средний CD связан со всеми остальными CD
                lineup.forEach((pos, idx) => {
                    if (pos === 'CD' && idx !== cdPlayerIndex) {
                        directConnections.push('CD');
                    }
                });
                break;
            case 'min':
                // Левый CD связан со следующим CD (index+1)
                directConnections.push('CD'); // Следующий CD
                break;
            case 'max':
                // Правый CD связан с предыдущим CD (index-1)
                directConnections.push('CD'); // Предыдущий CD
                break;
        }
        
        // 3. Связи с фланговыми защитниками
        if (cdType === 'min') {
            // Левый CD связан с LD || LB
            if (lineup.includes('LD')) {
                directConnections.push('LD');
            } else if (lineup.includes('LB')) {
                directConnections.push('LB');
            }
        } else if (cdType === 'max') {
            // Правый CD связан с RD || RB
            if (lineup.includes('RD')) {
                directConnections.push('RD');
            } else if (lineup.includes('RB')) {
                directConnections.push('RB');
            }
        } else if (cdType === 'single') {
            // Единственный CD связан с обоими флангами
            if (lineup.includes('LD')) {
                directConnections.push('LD');
            } else if (lineup.includes('LB')) {
                directConnections.push('LB');
            }
            if (lineup.includes('RD')) {
                directConnections.push('RD');
            } else if (lineup.includes('RB')) {
                directConnections.push('RB');
            }
        }
        
        // 4. Связи с полузащитой (приоритет: DM > CM > FR > AM)
        const midfieldIndices = getMidfieldConnectionsForCD(lineup, cdType);
        midfieldIndices.forEach(idx => {
            const pos = lineup[idx];
            if (pos) {
                directConnections.push(pos);
            }
        });
        
        console.log(`[CHEMISTRY] CD connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для CM - динамические связи
    if (position === 'CM' && positionData.dynamic && lineup) {
        const cmPlayerIndex = playerIndex >= 0 ? playerIndex : lineup.indexOf('CM');
        if (cmPlayerIndex === -1) return [];
        
        const cmType = getCMType(lineup, cmPlayerIndex);
        const directConnections = [];
        
        console.log(`[CHEMISTRY] CM type: ${cmType} at index ${cmPlayerIndex}`);
        
        // Средний CM (CM = 3)
        if (cmType === 'middle') {
            // 1. Связь со всеми CD
            lineup.forEach(pos => {
                if (pos === 'CD') {
                    directConnections.push('CD');
                }
            });
            
            // 2. Связь со всеми остальными CM
            lineup.forEach((pos, idx) => {
                if (pos === 'CM' && idx !== cmPlayerIndex) {
                    directConnections.push('CM');
                }
            });
            
            // 3. Связь с атакой: CF (all) || ST
            const cfIndices = [];
            lineup.forEach((pos, idx) => {
                if (pos === 'CF') cfIndices.push(idx);
            });
            
            if (cfIndices.length > 0) {
                // Связь со всеми CF
                cfIndices.forEach(() => directConnections.push('CF'));
            } else if (lineup.includes('ST')) {
                // Если нет CF, связь с ST
                directConnections.push('ST');
            }
        }
        // Левый CM (min index)
        else if (cmType === 'min') {
            // 1. Защита/опора: DM (all) || CD (min index)
            const dmIndices = [];
            lineup.forEach((pos, idx) => {
                if (pos === 'DM') dmIndices.push(idx);
            });
            
            if (dmIndices.length > 0) {
                // Связь со всеми DM
                dmIndices.forEach(() => directConnections.push('DM'));
            } else {
                // Связь с левым CD
                const cdIndices = [];
                lineup.forEach((pos, idx) => {
                    if (pos === 'CD') cdIndices.push(idx);
                });
                if (cdIndices.length > 0) {
                    directConnections.push('CD'); // Левый CD (min)
                }
            }
            
            // 2. Левый фланг: LM || LW
            if (lineup.includes('LM')) {
                directConnections.push('LM');
            } else if (lineup.includes('LW')) {
                directConnections.push('LW');
            }
            
            // 3. Следующий CM
            const cmIndices = [];
            lineup.forEach((pos, idx) => {
                if (pos === 'CM') cmIndices.push(idx);
            });
            if (cmIndices.length > 1) {
                directConnections.push('CM'); // CM (index+1)
            }
            
            // 4. Атака: (FR, AM) || (is424? CF(min) : (LF || CF(min) || ST))
            if (lineup.includes('FR')) {
                directConnections.push('FR');
            } else if (lineup.includes('AM')) {
                directConnections.push('AM');
            } else {
                const is424 = is424Formation(lineup);
                
                if (is424) {
                    // Формация 4-2-4: связь с левым CF
                    const cfIndices = [];
                    lineup.forEach((pos, idx) => {
                        if (pos === 'CF') cfIndices.push(idx);
                    });
                    if (cfIndices.length > 0) {
                        directConnections.push('CF'); // Левый CF (min)
                    }
                } else {
                    // Обычная формация: LF || CF(min) || ST
                    if (lineup.includes('LF')) {
                        directConnections.push('LF');
                    } else {
                        const cfIndices = [];
                        lineup.forEach((pos, idx) => {
                            if (pos === 'CF') cfIndices.push(idx);
                        });
                        if (cfIndices.length > 0) {
                            directConnections.push('CF'); // Левый CF (min)
                        } else if (lineup.includes('ST')) {
                            directConnections.push('ST');
                        }
                    }
                }
            }
        }
        // Правый CM (max index)
        else if (cmType === 'max') {
            // 1. Защита/опора: DM (all) || CD (max index)
            const dmIndices = [];
            lineup.forEach((pos, idx) => {
                if (pos === 'DM') dmIndices.push(idx);
            });
            
            if (dmIndices.length > 0) {
                // Связь со всеми DM
                dmIndices.forEach(() => directConnections.push('DM'));
            } else {
                // Связь с правым CD
                const cdIndices = [];
                lineup.forEach((pos, idx) => {
                    if (pos === 'CD') cdIndices.push(idx);
                });
                if (cdIndices.length > 0) {
                    directConnections.push('CD'); // Правый CD (max)
                }
            }
            
            // 2. Правый фланг: RM || RW
            if (lineup.includes('RM')) {
                directConnections.push('RM');
            } else if (lineup.includes('RW')) {
                directConnections.push('RW');
            }
            
            // 3. Предыдущий CM
            const cmIndices = [];
            lineup.forEach((pos, idx) => {
                if (pos === 'CM') cmIndices.push(idx);
            });
            if (cmIndices.length > 1) {
                directConnections.push('CM'); // CM (index-1)
            }
            
            // 4. Атака: (FR, AM) || (is424? CF(max) : (RF || CF(max) || ST))
            if (lineup.includes('FR')) {
                directConnections.push('FR');
            } else if (lineup.includes('AM')) {
                directConnections.push('AM');
            } else {
                const is424 = is424Formation(lineup);
                
                if (is424) {
                    // Формация 4-2-4: связь с правым CF
                    const cfIndices = [];
                    lineup.forEach((pos, idx) => {
                        if (pos === 'CF') cfIndices.push(idx);
                    });
                    if (cfIndices.length > 0) {
                        directConnections.push('CF'); // Правый CF (max)
                    }
                } else {
                    // Обычная формация: RF || CF(max) || ST
                    if (lineup.includes('RF')) {
                        directConnections.push('RF');
                    } else {
                        const cfIndices = [];
                        lineup.forEach((pos, idx) => {
                            if (pos === 'CF') cfIndices.push(idx);
                        });
                        if (cfIndices.length > 0) {
                            directConnections.push('CF'); // Правый CF (max)
                        } else if (lineup.includes('ST')) {
                            directConnections.push('ST');
                        }
                    }
                }
            }
        }
        
        console.log(`[CHEMISTRY] CM connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для DM - динамические связи
    if (position === 'DM' && positionData.dynamic && lineup) {
        const dmPlayerIndex = playerIndex >= 0 ? playerIndex : lineup.indexOf('DM');
        if (dmPlayerIndex === -1) return [];
        
        const directConnections = [];
        
        console.log(`[CHEMISTRY] DM at index ${dmPlayerIndex}`);
        
        // 1. Связь со всеми CD
        lineup.forEach(pos => {
            if (pos === 'CD') {
                directConnections.push('CD');
            }
        });
        
        // 2. Связь с другими DM
        lineup.forEach((pos, idx) => {
            if (pos === 'DM' && idx !== dmPlayerIndex) {
                directConnections.push('DM');
            }
        });
        
        // 3. Приоритетная цепочка полузащиты/атаки
        const cmIndices = [];
        lineup.forEach((pos, idx) => {
            if (pos === 'CM') cmIndices.push(idx);
        });
        
        if (cmIndices.length > 0) {
            // Приоритет 1: все CM
            cmIndices.forEach(() => directConnections.push('CM'));
        } else {
            // Приоритет 2: FR, AM
            const hasFR = lineup.includes('FR');
            const hasAM = lineup.includes('AM');
            
            if (hasFR || hasAM) {
                if (hasFR) directConnections.push('FR');
                if (hasAM) directConnections.push('AM');
            } else {
                // Приоритет 3: все CF
                const cfIndices = [];
                lineup.forEach((pos, idx) => {
                    if (pos === 'CF') cfIndices.push(idx);
                });
                
                if (cfIndices.length > 0) {
                    cfIndices.forEach(() => directConnections.push('CF'));
                } else {
                    // Приоритет 4: LF, RF
                    const hasLF = lineup.includes('LF');
                    const hasRF = lineup.includes('RF');
                    
                    if (hasLF || hasRF) {
                        if (hasLF) directConnections.push('LF');
                        if (hasRF) directConnections.push('RF');
                    } else {
                        // Приоритет 5: LM, LW, RM, RW
                        ['LM', 'LW', 'RM', 'RW'].forEach(pos => {
                            if (lineup.includes(pos)) {
                                directConnections.push(pos);
                            }
                        });
                    }
                }
            }
        }
        
        console.log(`[CHEMISTRY] DM connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для AM - динамические связи
    if (position === 'AM' && positionData.dynamic && lineup) {
        const directConnections = [];
        
        console.log(`[CHEMISTRY] AM connections building`);
        
        // 1. Полузащита: CM (all) || DM (all)
        const cmIndices = [];
        lineup.forEach((pos, idx) => {
            if (pos === 'CM') cmIndices.push(idx);
        });
        
        if (cmIndices.length > 0) {
            // Приоритет 1: все CM
            cmIndices.forEach(() => directConnections.push('CM'));
        } else {
            // Приоритет 2: все DM
            const dmIndices = [];
            lineup.forEach((pos, idx) => {
                if (pos === 'DM') dmIndices.push(idx);
            });
            dmIndices.forEach(() => directConnections.push('DM'));
        }
        
        // 2. FR (если есть)
        if (lineup.includes('FR')) {
            directConnections.push('FR');
        }
        
        // 3. Атака: (CF (all), RF, LF) || (ST, LF, RF)
        const cfIndices = [];
        lineup.forEach((pos, idx) => {
            if (pos === 'CF') cfIndices.push(idx);
        });
        
        if (cfIndices.length > 0) {
            // Приоритет 1: все CF + RF + LF
            cfIndices.forEach(() => directConnections.push('CF'));
            
            if (lineup.includes('RF')) directConnections.push('RF');
            if (lineup.includes('LF')) directConnections.push('LF');
        } else {
            // Приоритет 2: ST + LF + RF
            if (lineup.includes('ST')) directConnections.push('ST');
            if (lineup.includes('LF')) directConnections.push('LF');
            if (lineup.includes('RF')) directConnections.push('RF');
        }
        
        console.log(`[CHEMISTRY] AM connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для LF - динамические связи
    if (position === 'LF' && positionData.dynamic && lineup) {
        const directConnections = [];
        
        console.log(`[CHEMISTRY] LF connections building`);
        
        // 1. Левый фланг: LW || LM || LB || LD
        if (lineup.includes('LW')) {
            directConnections.push('LW');
        } else if (lineup.includes('LM')) {
            directConnections.push('LM');
        } else if (lineup.includes('LB')) {
            directConnections.push('LB');
        } else if (lineup.includes('LD')) {
            directConnections.push('LD');
        }
        
        // 2. Атака и полузащита
        const is424 = is424Formation(lineup);
        const hasCF = lineup.includes('CF');
        const hasST = lineup.includes('ST');
        
        if (is424) {
            // Формация 4-2-4: (ST & CF) || CF(min)
            if (hasST && hasCF) {
                directConnections.push('ST');
                directConnections.push('CF'); // Левый CF (min)
            } else if (hasCF) {
                // Только CF - берем левый (min index)
                directConnections.push('CF');
            }
        } else {
            // Обычная формация: CF || ST || (RF + полузащита)
            if (hasCF) {
                // Приоритет 1: CF (без полузащиты)
                directConnections.push('CF');
            } else if (hasST) {
                // Приоритет 2: ST (без полузащиты)
                directConnections.push('ST');
            } else {
                // Приоритет 3: RF + полузащита (только если нет CF и ST)
                if (lineup.includes('RF')) {
                    directConnections.push('RF');
                    
                    // Добавляем полузащиту: (AM || FR) || (CM(min) || DM)
                    if (lineup.includes('AM')) {
                        directConnections.push('AM');
                    } else if (lineup.includes('FR')) {
                        directConnections.push('FR');
                    } else {
                        // CM (min index) || DM
                        const cmIndices = [];
                        lineup.forEach((pos, idx) => {
                            if (pos === 'CM') cmIndices.push(idx);
                        });
                        
                        if (cmIndices.length > 0) {
                            directConnections.push('CM'); // Левый CM (min)
                        } else if (lineup.includes('DM')) {
                            directConnections.push('DM');
                        }
                    }
                }
            }
        }
        
        console.log(`[CHEMISTRY] LF connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для RF - динамические связи
    if (position === 'RF' && positionData.dynamic && lineup) {
        const directConnections = [];
        
        console.log(`[CHEMISTRY] RF connections building`);
        
        // 1. Правый фланг: RW || RM || RB || RD
        if (lineup.includes('RW')) {
            directConnections.push('RW');
        } else if (lineup.includes('RM')) {
            directConnections.push('RM');
        } else if (lineup.includes('RB')) {
            directConnections.push('RB');
        } else if (lineup.includes('RD')) {
            directConnections.push('RD');
        }
        
        // 2. Атака и полузащита
        const is424 = is424Formation(lineup);
        const hasCF = lineup.includes('CF');
        const hasST = lineup.includes('ST');
        
        if (is424) {
            // Формация 4-2-4: (ST & CF) || CF(max)
            if (hasST && hasCF) {
                directConnections.push('ST');
                directConnections.push('CF'); // Правый CF (max)
            } else if (hasCF) {
                // Только CF - берем правый (max index)
                directConnections.push('CF');
            }
        } else {
            // Обычная формация: CF || ST || (LF + полузащита)
            if (hasCF) {
                // Приоритет 1: CF (без полузащиты)
                directConnections.push('CF');
            } else if (hasST) {
                // Приоритет 2: ST (без полузащиты)
                directConnections.push('ST');
            } else {
                // Приоритет 3: LF + полузащита (только если нет CF и ST)
                if (lineup.includes('LF')) {
                    directConnections.push('LF');
                    
                    // Добавляем полузащиту: (AM || FR) || (CM(max) || DM)
                    if (lineup.includes('AM')) {
                        directConnections.push('AM');
                    } else if (lineup.includes('FR')) {
                        directConnections.push('FR');
                    } else {
                        // CM (max index) || DM
                        const cmIndices = [];
                        lineup.forEach((pos, idx) => {
                            if (pos === 'CM') cmIndices.push(idx);
                        });
                        
                        if (cmIndices.length > 0) {
                            directConnections.push('CM'); // Правый CM (max)
                        } else if (lineup.includes('DM')) {
                            directConnections.push('DM');
                        }
                    }
                }
            }
        }
        
        console.log(`[CHEMISTRY] RF connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для CF - динамические связи
    if (position === 'CF' && positionData.dynamic && lineup) {
        const cfPlayerIndex = playerIndex >= 0 ? playerIndex : lineup.indexOf('CF');
        if (cfPlayerIndex === -1) return [];
        
        const directConnections = [];
        
        console.log(`[CHEMISTRY] CF connections building`);
        
        // Подсчет нападающих
        const cfCount = countPositionInLineup(lineup, 'CF');
        const stCount = countPositionInLineup(lineup, 'ST');
        const lfCount = countPositionInLineup(lineup, 'LF');
        const rfCount = countPositionInLineup(lineup, 'RF');
        const totalForwards = cfCount + stCount + lfCount + rfCount;
        const is424 = is424Formation(lineup);
        const cfType = getCFType(lineup, cfPlayerIndex);
        
        console.log(`[CHEMISTRY] CF type: ${cfType}, count: ${cfCount}, total forwards: ${totalForwards}, is424: ${is424}`);
        
        // Случай 1: Единственный нападающий (ST + CF + RF + LF) = 1
        if (totalForwards === 1) {
            // Левый фланг: LW || LM
            if (lineup.includes('LW')) {
                directConnections.push('LW');
            } else if (lineup.includes('LM')) {
                directConnections.push('LM');
            }
            
            // Правый фланг: RW || RM
            if (lineup.includes('RW')) {
                directConnections.push('RW');
            } else if (lineup.includes('RM')) {
                directConnections.push('RM');
            }
            
            // Полузащита: AM || FR || CM(all) || DM(all)
            if (lineup.includes('AM')) {
                directConnections.push('AM');
            } else if (lineup.includes('FR')) {
                directConnections.push('FR');
            } else {
                const cmIndices = [];
                lineup.forEach((pos, idx) => {
                    if (pos === 'CM') cmIndices.push(idx);
                });
                if (cmIndices.length > 0) {
                    cmIndices.forEach(() => directConnections.push('CM'));
                } else {
                    const dmIndices = [];
                    lineup.forEach((pos, idx) => {
                        if (pos === 'DM') dmIndices.push(idx);
                    });
                    dmIndices.forEach(() => directConnections.push('DM'));
                }
            }
        }
        // Случай 2: CF + LF + RF = 3 (нет ST)
        else if (cfCount === 1 && lfCount === 1 && rfCount === 1 && stCount === 0) {
            // Фланги: LF, RF
            directConnections.push('LF', 'RF');
            
            // Полузащита: (AM, FR) || (AM || FR || CM(all) || DM(all))
            const hasAM = lineup.includes('AM');
            const hasFR = lineup.includes('FR');
            
            if (hasAM && hasFR) {
                // Оба вместе
                directConnections.push('AM', 'FR');
            } else if (hasAM) {
                directConnections.push('AM');
            } else if (hasFR) {
                directConnections.push('FR');
            } else {
                const cmIndices = [];
                lineup.forEach((pos, idx) => {
                    if (pos === 'CM') cmIndices.push(idx);
                });
                if (cmIndices.length > 0) {
                    cmIndices.forEach(() => directConnections.push('CM'));
                } else {
                    const dmIndices = [];
                    lineup.forEach((pos, idx) => {
                        if (pos === 'DM') dmIndices.push(idx);
                    });
                    dmIndices.forEach(() => directConnections.push('DM'));
                }
            }
        }
        // Случай 3: CF = 2
        else if (cfCount === 2) {
            // Фланги: (LF || LW || LM), (RF || RW || RM)
            if (lineup.includes('LF')) {
                directConnections.push('LF');
            } else if (lineup.includes('LW')) {
                directConnections.push('LW');
            } else if (lineup.includes('LM')) {
                directConnections.push('LM');
            }
            
            if (lineup.includes('RF')) {
                directConnections.push('RF');
            } else if (lineup.includes('RW')) {
                directConnections.push('RW');
            } else if (lineup.includes('RM')) {
                directConnections.push('RM');
            }
            
            // Другой CF
            directConnections.push('CF');
            
            // ST (если есть)
            if (stCount > 0) {
                directConnections.push('ST');
            }
            
            // Полузащита
            if (is424) {
                // Формация 4-2-4
                if (stCount > 0) {
                    // Есть ST: (FR || CM(all)) || (CF min? LM : RM)
                    if (lineup.includes('FR')) {
                        directConnections.push('FR');
                    } else {
                        const cmIndices = [];
                        lineup.forEach((pos, idx) => {
                            if (pos === 'CM') cmIndices.push(idx);
                        });
                        if (cmIndices.length > 0) {
                            cmIndices.forEach(() => directConnections.push('CM'));
                        }
                    }
                    
                    // Дополнительно: LM/RM по индексу
                    if (cfType === 'min') {
                        if (lineup.includes('LM')) directConnections.push('LM');
                    } else if (cfType === 'max') {
                        if (lineup.includes('RM')) directConnections.push('RM');
                    }
                } else {
                    // Нет ST: CM(same index)
                    const cmSameIndex = getCMBySameIndex(lineup, cfType);
                    if (cmSameIndex !== -1) {
                        directConnections.push('CM');
                    }
                }
                
                // Дополнительная связь: FR || CM(same index)
                if (lineup.includes('FR')) {
                    directConnections.push('FR');
                } else {
                    const cmSameIndex = getCMBySameIndex(lineup, cfType);
                    if (cmSameIndex !== -1) {
                        directConnections.push('CM');
                    }
                }
            } else {
                // Обычная формация: AM || FR || CM(same index) || DM(all)
                if (lineup.includes('AM')) {
                    directConnections.push('AM');
                } else if (lineup.includes('FR')) {
                    directConnections.push('FR');
                } else {
                    const cmSameIndex = getCMBySameIndex(lineup, cfType);
                    if (cmSameIndex !== -1) {
                        directConnections.push('CM');
                    } else {
                        const dmIndices = [];
                        lineup.forEach((pos, idx) => {
                            if (pos === 'DM') dmIndices.push(idx);
                        });
                        dmIndices.forEach(() => directConnections.push('DM'));
                    }
                }
            }
        }
        // Случай 4: CF = 3
        else if (cfCount === 3) {
            if (cfType === 'min') {
                // Левый CF: (LW || LM), CF(index+1), (AM || FR || CM(min) || DM(all))
                if (lineup.includes('LW')) {
                    directConnections.push('LW');
                } else if (lineup.includes('LM')) {
                    directConnections.push('LM');
                }
                
                // Следующий CF
                directConnections.push('CF');
                
                // Полузащита
                if (lineup.includes('AM')) {
                    directConnections.push('AM');
                } else if (lineup.includes('FR')) {
                    directConnections.push('FR');
                } else {
                    const cmIndices = [];
                    lineup.forEach((pos, idx) => {
                        if (pos === 'CM') cmIndices.push(idx);
                    });
                    if (cmIndices.length > 0) {
                        const minCM = Math.min(...cmIndices);
                        directConnections.push('CM');
                    } else {
                        const dmIndices = [];
                        lineup.forEach((pos, idx) => {
                            if (pos === 'DM') dmIndices.push(idx);
                        });
                        dmIndices.forEach(() => directConnections.push('DM'));
                    }
                }
            } else if (cfType === 'max') {
                // Правый CF: (RW || RM), CF(index-1), (AM || FR || CM(max) || DM(all))
                if (lineup.includes('RW')) {
                    directConnections.push('RW');
                } else if (lineup.includes('RM')) {
                    directConnections.push('RM');
                }
                
                // Предыдущий CF
                directConnections.push('CF');
                
                // Полузащита
                if (lineup.includes('AM')) {
                    directConnections.push('AM');
                } else if (lineup.includes('FR')) {
                    directConnections.push('FR');
                } else {
                    const cmIndices = [];
                    lineup.forEach((pos, idx) => {
                        if (pos === 'CM') cmIndices.push(idx);
                    });
                    if (cmIndices.length > 0) {
                        const maxCM = Math.max(...cmIndices);
                        directConnections.push('CM');
                    } else {
                        const dmIndices = [];
                        lineup.forEach((pos, idx) => {
                            if (pos === 'DM') dmIndices.push(idx);
                        });
                        dmIndices.forEach(() => directConnections.push('DM'));
                    }
                }
            } else if (cfType === 'middle') {
                // Средний CF: CF(all), (AM || FR || CM(all) || DM(all))
                lineup.forEach((pos, idx) => {
                    if (pos === 'CF' && idx !== cfPlayerIndex) {
                        directConnections.push('CF');
                    }
                });
                
                // Полузащита
                if (lineup.includes('AM')) {
                    directConnections.push('AM');
                } else if (lineup.includes('FR')) {
                    directConnections.push('FR');
                } else {
                    const cmIndices = [];
                    lineup.forEach((pos, idx) => {
                        if (pos === 'CM') cmIndices.push(idx);
                    });
                    if (cmIndices.length > 0) {
                        cmIndices.forEach(() => directConnections.push('CM'));
                    } else {
                        const dmIndices = [];
                        lineup.forEach((pos, idx) => {
                            if (pos === 'DM') dmIndices.push(idx);
                        });
                        dmIndices.forEach(() => directConnections.push('DM'));
                    }
                }
            }
        }
        
        console.log(`[CHEMISTRY] CF connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Специальная обработка для ST - динамические связи
    if (position === 'ST' && positionData.dynamic && lineup) {
        const directConnections = [];
        
        console.log(`[CHEMISTRY] ST connections building`);
        
        // Подсчет нападающих
        const cfCount = countPositionInLineup(lineup, 'CF');
        const stCount = countPositionInLineup(lineup, 'ST');
        const lfCount = countPositionInLineup(lineup, 'LF');
        const rfCount = countPositionInLineup(lineup, 'RF');
        const totalForwards = cfCount + stCount + lfCount + rfCount;
        const is424 = is424Formation(lineup);
        
        console.log(`[CHEMISTRY] ST count: ${stCount}, CF: ${cfCount}, total forwards: ${totalForwards}, is424: ${is424}`);
        
        // Случай 1: Единственный нападающий (ST + CF + RF + LF) = 1
        if (totalForwards === 1) {
            // Левый фланг: LW || LM
            if (lineup.includes('LW')) {
                directConnections.push('LW');
            } else if (lineup.includes('LM')) {
                directConnections.push('LM');
            }
            
            // Правый фланг: RW || RM
            if (lineup.includes('RW')) {
                directConnections.push('RW');
            } else if (lineup.includes('RM')) {
                directConnections.push('RM');
            }
            
            // Полузащита: AM || FR || CM(all) || DM(all)
            if (lineup.includes('AM')) {
                directConnections.push('AM');
            } else if (lineup.includes('FR')) {
                directConnections.push('FR');
            } else {
                const cmIndices = [];
                lineup.forEach((pos, idx) => {
                    if (pos === 'CM') cmIndices.push(idx);
                });
                if (cmIndices.length > 0) {
                    cmIndices.forEach(() => directConnections.push('CM'));
                } else {
                    const dmIndices = [];
                    lineup.forEach((pos, idx) => {
                        if (pos === 'DM') dmIndices.push(idx);
                    });
                    dmIndices.forEach(() => directConnections.push('DM'));
                }
            }
        }
        // Случай 2: ST + LF + RF = 3 (нет CF)
        else if (stCount === 1 && lfCount === 1 && rfCount === 1 && cfCount === 0) {
            // Фланги: LF, RF
            directConnections.push('LF', 'RF');
            
            // Полузащита: (AM, FR) || (AM || FR || CM(all) || DM(all))
            const hasAM = lineup.includes('AM');
            const hasFR = lineup.includes('FR');
            
            if (hasAM && hasFR) {
                // Оба вместе
                directConnections.push('AM', 'FR');
            } else if (hasAM) {
                directConnections.push('AM');
            } else if (hasFR) {
                directConnections.push('FR');
            } else {
                const cmIndices = [];
                lineup.forEach((pos, idx) => {
                    if (pos === 'CM') cmIndices.push(idx);
                });
                if (cmIndices.length > 0) {
                    cmIndices.forEach(() => directConnections.push('CM'));
                } else {
                    const dmIndices = [];
                    lineup.forEach((pos, idx) => {
                        if (pos === 'DM') dmIndices.push(idx);
                    });
                    dmIndices.forEach(() => directConnections.push('DM'));
                }
            }
        }
        // Случай 3: is424
        else if (is424) {
            // CF(все), LF, RF
            const cfIndices = [];
            lineup.forEach((pos, idx) => {
                if (pos === 'CF') cfIndices.push(idx);
            });
            cfIndices.forEach(() => directConnections.push('CF'));
            
            if (lfCount > 0) directConnections.push('LF');
            if (rfCount > 0) directConnections.push('RF');
        }
        // Случай 4: CF + ST = 2 или CF + ST = 3
        else if (cfCount > 0) {
            // Связь со всеми CF
            const cfIndices = [];
            lineup.forEach((pos, idx) => {
                if (pos === 'CF') cfIndices.push(idx);
            });
            cfIndices.forEach(() => directConnections.push('CF'));
        }
        
        console.log(`[CHEMISTRY] ST connections: ${directConnections.join(', ')}`);
        return directConnections;
    }
    
    // Применяем условия если они есть
    let directConnections = [...positionData.direct];
    if (positionData.conditions && lineup) {
        directConnections = positionData.direct.filter(connectedPos => {
            const condition = positionData.conditions[connectedPos];
            return !condition || condition(lineup);
        });
    }
    
    // Обработка приоритетной связи с атакой (для LD и RD)
    if (positionData.priorityAttack && lineup) {
        // Ищем первую доступную позицию из приоритетного списка
        const attackConnection = positionData.priorityAttack.find(pos => lineup.includes(pos));
        if (attackConnection) {
            directConnections.push(attackConnection);
        }
    }
    
    // Обработка специального выбора CD (для LD и RD)
    if (positionData.cdSelector && lineup && directConnections.includes('CD')) {
        // Находим все индексы CD в составе
        const cdIndices = [];
        lineup.forEach((pos, idx) => {
            if (pos === 'CD') {
                cdIndices.push(idx);
            }
        });
        
        if (cdIndices.length > 0) {
            // Выбираем CD по правилу (min или max индекс)
            const selectedCdIndex = positionData.cdSelector === 'min' 
                ? Math.min(...cdIndices) 
                : Math.max(...cdIndices);
            
            console.log(`[CHEMISTRY] ${position} CD selector: ${positionData.cdSelector}, selected CD at index ${selectedCdIndex} (total CDs: ${cdIndices.length})`);
        }
    }
    
    // Возвращаем только прямые связи (пока не используем диагональные)
    console.log(`[CHEMISTRY] ${position} connections: ${directConnections.join(', ')}`);
    return directConnections;
}

/**
 * Получает связи для вратаря на основе состава защиты
 * Новая логика: GK связан со ВСЕМИ защитниками в составе
 * @param {Array} lineup - Состав команды (позиции)
 * @returns {Array} - Массив связанных позиций для GK
 */
function getGKConnections(lineup) {
    if (!lineup) {
        // Если состав не передан, возвращаем все возможные защитники
        console.log('[CHEMISTRY] GK: no lineup provided, returning all defenders');
        return ['LD', 'LB', 'CD', 'SW', 'RD', 'RB'];
    }
    
    // Находим всех защитников в составе
    const defenderPositions = ['LD', 'LB', 'CD', 'SW', 'RD', 'RB'];
    const defenders = [];
    
    // Проходим по составу и собираем всех защитников
    for (const position of lineup) {
        if (position && defenderPositions.includes(position)) {
            defenders.push(position);
        }
    }
    
    console.log(`[CHEMISTRY] GK connections: ${defenders.join(', ')} (${defenders.length} defenders total)`);
    
    return defenders;
}

/**
 * Подсчитывает количество игроков на определенной позиции в составе
 * @param {Array} lineup - Состав команды (позиции)
 * @param {string} position - Позиция для подсчета
 * @returns {number} - Количество игроков на позиции
 */
function countPositionInLineup(lineup, position) {
    if (!lineup) return 0;
    
    return lineup.filter(pos => pos === position).length;
}

/**
 * Получает индекс конкретного CD для фланговых защитников (LD/RD)
 * @param {Array} positions - Массив позиций в составе
 * @param {string} playerPosition - Позиция игрока (LD или RD)
 * @param {string} selector - Тип селектора ('min' или 'max')
 * @returns {number} - Индекс выбранного CD или -1 если не найден
 */
function getSpecificCDIndex(positions, playerPosition, selector) {
    if (!positions || (playerPosition !== 'LD' && playerPosition !== 'RD')) {
        return -1;
    }
    
    // Находим все индексы CD в составе
    const cdIndices = [];
    positions.forEach((pos, idx) => {
        if (pos === 'CD') {
            cdIndices.push(idx);
        }
    });
    
    if (cdIndices.length === 0) return -1;
    
    // Выбираем CD по правилу
    const selectedIndex = selector === 'min' 
        ? Math.min(...cdIndices) 
        : Math.max(...cdIndices);
    
    return selectedIndex;
}

/**
 * Определяет тип CD по его индексу в составе
 * @param {Array} positions - Массив позиций в составе
 * @param {number} cdIndex - Индекс текущего CD
 * @returns {string} - Тип CD: 'single', 'middle', 'min', 'max', 'other'
 */
function getCDType(positions, cdIndex) {
    if (!positions || cdIndex < 0) return 'other';
    
    // Находим все индексы CD
    const cdIndices = [];
    positions.forEach((pos, idx) => {
        if (pos === 'CD') {
            cdIndices.push(idx);
        }
    });
    
    const cdCount = cdIndices.length;
    
    if (cdCount === 0) return 'other';
    if (cdCount === 1) return 'single';
    
    // Для 3 CD - проверяем средний
    if (cdCount === 3 && cdIndex === cdIndices[1]) return 'middle';
    
    // Проверяем минимальный и максимальный
    if (cdIndex === Math.min(...cdIndices)) return 'min';
    if (cdIndex === Math.max(...cdIndices)) return 'max';
    
    return 'other';
}

/**
 * Получает индексы CM для связи с CD
 * @param {Array} positions - Массив позиций в составе
 * @param {string} cdType - Тип CD ('single', 'middle', 'min', 'max')
 * @returns {Array} - Массив индексов CM
 */
function getCMIndicesForCD(positions, cdType) {
    if (!positions) return [];
    
    const cmIndices = [];
    positions.forEach((pos, idx) => {
        if (pos === 'CM') {
            cmIndices.push(idx);
        }
    });
    
    if (cmIndices.length === 0) return [];
    
    switch(cdType) {
        case 'min':
            // Левый CD связан с левым CM (минимальный индекс)
            return [Math.min(...cmIndices)];
        case 'max':
            // Правый CD связан с правым CM (максимальный индекс)
            return [Math.max(...cmIndices)];
        case 'middle':
        case 'single':
            // Средний или единственный CD связан со всеми CM
            return cmIndices;
        default:
            return cmIndices;
    }
}

/**
 * Получает приоритетную связь с полузащитой для CD
 * @param {Array} positions - Массив позиций в составе
 * @param {string} cdType - Тип CD
 * @returns {Array} - Массив индексов связанных полузащитников
 */
function getMidfieldConnectionsForCD(positions, cdType) {
    if (!positions) return [];
    
    const connections = [];
    
    // Приоритет: DM > CM > FR > AM
    
    // 1. Проверяем DM
    const dmIndices = [];
    positions.forEach((pos, idx) => {
        if (pos === 'DM') dmIndices.push(idx);
    });
    
    if (dmIndices.length > 0) {
        // Единственный CD связан со всеми DM
        if (cdType === 'single') {
            return dmIndices;
        }
        // Остальные CD связаны с первым DM
        return [dmIndices[0]];
    }
    
    // 2. Проверяем CM
    const cmIndices = getCMIndicesForCD(positions, cdType);
    if (cmIndices.length > 0) {
        return cmIndices;
    }
    
    // 3. Проверяем FR
    const frIndex = positions.findIndex(pos => pos === 'FR');
    if (frIndex !== -1) {
        return [frIndex];
    }
    
    // 4. Проверяем AM
    const amIndex = positions.findIndex(pos => pos === 'AM');
    if (amIndex !== -1) {
        return [amIndex];
    }
    
    return [];
}

/**
 * Определяет тип CM по его индексу в составе
 * @param {Array} positions - Массив позиций в составе
 * @param {number} cmIndex - Индекс текущего CM
 * @returns {string} - Тип CM: 'middle', 'min', 'max', 'other'
 */
function getCMType(positions, cmIndex) {
    if (!positions || cmIndex < 0) return 'other';
    
    const cmIndices = [];
    positions.forEach((pos, idx) => {
        if (pos === 'CM') {
            cmIndices.push(idx);
        }
    });
    
    const cmCount = cmIndices.length;
    
    if (cmCount === 0) return 'other';
    if (cmCount === 3 && cmIndex === cmIndices[1]) return 'middle';
    if (cmIndex === Math.min(...cmIndices)) return 'min';
    if (cmIndex === Math.max(...cmIndices)) return 'max';
    
    return 'other';
}

/**
 * Определяет является ли формация 4-2-4
 * @param {Array} positions - Массив позиций в составе
 * @returns {boolean} - true если формация 4-2-4
 */
function is424Formation(positions) {
    if (!positions) return false;
    
    // Считаем защитников
    const defenderCount = positions.filter(p => 
        ['LD', 'LB', 'CD', 'SW', 'RD', 'RB'].includes(p)
    ).length;
    
    // Считаем CM
    const cmCount = positions.filter(p => p === 'CM').length;
    
    // Считаем нападающих
    const forwardCount = positions.filter(p => 
        ['LF', 'CF', 'RF', 'ST', 'LW', 'RW'].includes(p)
    ).length;
    
    // 4-2-4: 4 защитника, 2 CM, 4 нападающих
    return defenderCount === 4 && cmCount === 2 && forwardCount === 4;
}

/**
 * Определяет тип CF по его индексу в составе
 * @param {Array} positions - Массив позиций в составе
 * @param {number} cfIndex - Индекс текущего CF
 * @returns {string} - Тип CF: 'single', 'middle', 'min', 'max', 'other'
 */
function getCFType(positions, cfIndex) {
    if (!positions || cfIndex < 0) return 'other';
    
    const cfIndices = [];
    positions.forEach((pos, idx) => {
        if (pos === 'CF') {
            cfIndices.push(idx);
        }
    });
    
    const cfCount = cfIndices.length;
    
    if (cfCount === 0) return 'other';
    if (cfCount === 1) return 'single';
    
    // Для 3 CF - проверяем средний
    if (cfCount === 3 && cfIndex === cfIndices[1]) return 'middle';
    
    // Проверяем минимальный и максимальный
    if (cfIndex === Math.min(...cfIndices)) return 'min';
    if (cfIndex === Math.max(...cfIndices)) return 'max';
    
    return 'other';
}

/**
 * Получает CM по "same index" с CF (соответствующий индекс)
 * @param {Array} positions - Массив позиций в составе
 * @param {string} cfType - Тип CF ('min', 'max')
 * @returns {number} - Индекс CM или -1
 */
function getCMBySameIndex(positions, cfType) {
    if (!positions) return -1;
    
    const cmIndices = [];
    positions.forEach((pos, idx) => {
        if (pos === 'CM') cmIndices.push(idx);
    });
    
    if (cmIndices.length === 0) return -1;
    
    if (cfType === 'min') {
        return Math.min(...cmIndices);
    } else if (cfType === 'max') {
        return Math.max(...cmIndices);
    }
    
    return -1;
}

/**
 * Подсчитывает количество позиций в составе
 * @param {Array} positions - Массив позиций
 * @param {string} position - Позиция для подсчета
 * @returns {number} - Количество
 */
function countPositionInLineup(positions, position) {
    if (!positions) return 0;
    return positions.filter(p => p === position).length;
}

/**
 * Рассчитывает модификатор Chemistry для игрока
 * @param {Object} player - Игрок
 * @param {Array} lineup - Состав команды (объекты игроков)
 * @param {Array} positions - Позиции игроков в составе
 * @returns {number} - Модификатор Chemistry от -0.05 до +0.125
 */
function calculatePlayerChemistryModifier(player, lineup, positions) {
    const playerIndex = lineup.findIndex(p => p.id === player.id);
    if (playerIndex === -1) return 0;
    
    const playerPosition = positions[playerIndex];
    if (!playerPosition) return 0;
    
    // Получаем связанные позиции
    const connectedPositions = getPositionConnections(playerPosition, positions, playerIndex);
    if (connectedPositions.length === 0) return 0;
    
    let totalModifier = 0;
    let connectionCount = 0;
    
    // Для CD нужна специальная обработка связей
    const isCDPlayer = playerPosition === 'CD';
    const cdType = isCDPlayer ? getCDType(positions, playerIndex) : null;
    
    // Рассчитываем модификатор для каждой связи
    connectedPositions.forEach((connectedPos, idx) => {
        let connectedPlayerIndex = -1;
        
        // Специальная обработка для LD/RD с CD - выбираем конкретный CD по индексу
        if ((playerPosition === 'LD' || playerPosition === 'RD') && connectedPos === 'CD') {
            const selector = playerPosition === 'LD' ? 'min' : 'max';
            connectedPlayerIndex = getSpecificCDIndex(positions, playerPosition, selector);
            console.log(`[CHEMISTRY] ${playerPosition} connecting to CD at index ${connectedPlayerIndex} (${selector})`);
        }
        // Специальная обработка для LB с CD - левый CD (min index)
        else if (playerPosition === 'LB' && connectedPos === 'CD') {
            const cdIndices = [];
            positions.forEach((pos, i) => {
                if (pos === 'CD') cdIndices.push(i);
            });
            if (cdIndices.length > 0) {
                connectedPlayerIndex = Math.min(...cdIndices); // Левый CD
                console.log(`[CHEMISTRY] LB connecting to CD at index ${connectedPlayerIndex} (min)`);
            }
        }
        // Специальная обработка для RB с CD - правый CD (max index)
        else if (playerPosition === 'RB' && connectedPos === 'CD') {
            const cdIndices = [];
            positions.forEach((pos, i) => {
                if (pos === 'CD') cdIndices.push(i);
            });
            if (cdIndices.length > 0) {
                connectedPlayerIndex = Math.max(...cdIndices); // Правый CD
                console.log(`[CHEMISTRY] RB connecting to CD at index ${connectedPlayerIndex} (max)`);
            }
        }
        // Специальная обработка для CD с другими CD
        else if (isCDPlayer && connectedPos === 'CD') {
            // Находим все индексы CD кроме текущего
            const cdIndices = [];
            positions.forEach((pos, i) => {
                if (pos === 'CD' && i !== playerIndex) {
                    cdIndices.push(i);
                }
            });
            
            if (cdIndices.length > 0) {
                // Для среднего CD - берем CD по порядку из массива связей
                if (cdType === 'middle') {
                    // Средний CD связан со всеми остальными CD
                    const cdConnectionIndex = Math.floor(connectionCount / 2); // Простая логика распределения
                    connectedPlayerIndex = cdIndices[cdConnectionIndex % cdIndices.length];
                } else if (cdType === 'min') {
                    // Левый CD связан со следующим (index+1)
                    connectedPlayerIndex = cdIndices[0]; // Следующий CD
                } else if (cdType === 'max') {
                    // Правый CD связан с предыдущим (index-1)
                    connectedPlayerIndex = cdIndices[cdIndices.length - 1]; // Предыдущий CD
                }
            }
        }
        // Специальная обработка для CD с CM - может быть несколько CM
        else if (isCDPlayer && connectedPos === 'CM') {
            const cmIndices = getCMIndicesForCD(positions, cdType);
            // Берем CM по порядку из списка связей
            const cmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CM').length;
            connectedPlayerIndex = cmIndices[cmConnectionIndex] || cmIndices[0];
        }
        // Специальная обработка для CD с DM - может быть несколько DM
        else if (isCDPlayer && connectedPos === 'DM' && cdType === 'single') {
            // Единственный CD может быть связан со всеми DM
            const dmIndices = [];
            positions.forEach((pos, i) => {
                if (pos === 'DM') dmIndices.push(i);
            });
            const dmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'DM').length;
            connectedPlayerIndex = dmIndices[dmConnectionIndex] || dmIndices[0];
        }
        // Специальная обработка для SW с CD - связан со всеми CD
        else if (playerPosition === 'SW' && connectedPos === 'CD') {
            const cdIndices = [];
            positions.forEach((pos, i) => {
                if (pos === 'CD') cdIndices.push(i);
            });
            // Берем CD по порядку из списка связей
            const cdConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CD').length;
            connectedPlayerIndex = cdIndices[cdConnectionIndex];
        }
        // Специальная обработка для CM
        else if (playerPosition === 'CM') {
            const cmType = getCMType(positions, playerIndex);
            
            // CM с другими CM
            if (connectedPos === 'CM') {
                const cmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CM' && i !== playerIndex) cmIndices.push(i);
                });
                
                if (cmType === 'middle') {
                    // Средний CM связан со всеми остальными CM
                    const cmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CM').length;
                    connectedPlayerIndex = cmIndices[cmConnectionIndex];
                } else if (cmType === 'min' && cmIndices.length > 0) {
                    // Левый CM связан со следующим CM (index+1)
                    connectedPlayerIndex = cmIndices[0];
                } else if (cmType === 'max' && cmIndices.length > 0) {
                    // Правый CM связан с предыдущим CM (index-1)
                    connectedPlayerIndex = cmIndices[cmIndices.length - 1];
                }
            }
            // CM с CD
            else if (connectedPos === 'CD') {
                const cdIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CD') cdIndices.push(i);
                });
                
                if (cmType === 'middle') {
                    // Средний CM связан со всеми CD
                    const cdConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CD').length;
                    connectedPlayerIndex = cdIndices[cdConnectionIndex];
                } else if (cmType === 'min' && cdIndices.length > 0) {
                    // Левый CM связан с левым CD
                    connectedPlayerIndex = Math.min(...cdIndices);
                } else if (cmType === 'max' && cdIndices.length > 0) {
                    // Правый CM связан с правым CD
                    connectedPlayerIndex = Math.max(...cdIndices);
                }
            }
            // CM с DM
            else if (connectedPos === 'DM') {
                const dmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'DM') dmIndices.push(i);
                });
                // CM связан со всеми DM (берем по порядку)
                const dmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'DM').length;
                connectedPlayerIndex = dmIndices[dmConnectionIndex];
            }
            // CM с CF
            else if (connectedPos === 'CF') {
                const cfIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CF') cfIndices.push(i);
                });
                
                if (cmType === 'middle') {
                    // Средний CM связан со всеми CF
                    const cfConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CF').length;
                    connectedPlayerIndex = cfIndices[cfConnectionIndex];
                } else if (cmType === 'min' && cfIndices.length > 0) {
                    // Левый CM связан с левым CF
                    connectedPlayerIndex = Math.min(...cfIndices);
                } else if (cmType === 'max' && cfIndices.length > 0) {
                    // Правый CM связан с правым CF
                    connectedPlayerIndex = Math.max(...cfIndices);
                }
            }
            // Для остальных связей CM - первое вхождение
            else {
                connectedPlayerIndex = positions.findIndex(pos => pos === connectedPos);
            }
        }
        // Специальная обработка для LM с CM - левый CM (min index)
        else if (playerPosition === 'LM' && connectedPos === 'CM') {
            const cmIndices = [];
            positions.forEach((pos, i) => {
                if (pos === 'CM') cmIndices.push(i);
            });
            if (cmIndices.length > 0) {
                connectedPlayerIndex = Math.min(...cmIndices); // Левый CM
                console.log(`[CHEMISTRY] LM connecting to CM at index ${connectedPlayerIndex} (min)`);
            }
        }
        // Специальная обработка для LM с DM - левый DM (min index)
        else if (playerPosition === 'LM' && connectedPos === 'DM') {
            const dmIndices = [];
            positions.forEach((pos, i) => {
                if (pos === 'DM') dmIndices.push(i);
            });
            if (dmIndices.length > 0) {
                connectedPlayerIndex = Math.min(...dmIndices); // Левый DM
                console.log(`[CHEMISTRY] LM connecting to DM at index ${connectedPlayerIndex} (min)`);
            }
        }
        // Специальная обработка для LM с CF - левый CF (min index)
        else if (playerPosition === 'LM' && connectedPos === 'CF') {
            const cfIndices = [];
            positions.forEach((pos, i) => {
                if (pos === 'CF') cfIndices.push(i);
            });
            if (cfIndices.length > 0) {
                connectedPlayerIndex = Math.min(...cfIndices); // Левый CF
                console.log(`[CHEMISTRY] LM connecting to CF at index ${connectedPlayerIndex} (min)`);
            }
        }
        // Специальная обработка для RM с CM - правый CM (max index)
        else if (playerPosition === 'RM' && connectedPos === 'CM') {
            const cmIndices = [];
            positions.forEach((pos, i) => {
                if (pos === 'CM') cmIndices.push(i);
            });
            if (cmIndices.length > 0) {
                connectedPlayerIndex = Math.max(...cmIndices); // Правый CM
                console.log(`[CHEMISTRY] RM connecting to CM at index ${connectedPlayerIndex} (max)`);
            }
        }
        // Специальная обработка для RM с DM - правый DM (max index)
        else if (playerPosition === 'RM' && connectedPos === 'DM') {
            const dmIndices = [];
            positions.forEach((pos, i) => {
                if (pos === 'DM') dmIndices.push(i);
            });
            if (dmIndices.length > 0) {
                connectedPlayerIndex = Math.max(...dmIndices); // Правый DM
                console.log(`[CHEMISTRY] RM connecting to DM at index ${connectedPlayerIndex} (max)`);
            }
        }
        // Специальная обработка для RM с CF - правый CF (max index)
        else if (playerPosition === 'RM' && connectedPos === 'CF') {
            const cfIndices = [];
            positions.forEach((pos, i) => {
                if (pos === 'CF') cfIndices.push(i);
            });
            if (cfIndices.length > 0) {
                connectedPlayerIndex = Math.max(...cfIndices); // Правый CF
                console.log(`[CHEMISTRY] RM connecting to CF at index ${connectedPlayerIndex} (max)`);
            }
        }
        // Специальная обработка для DM
        else if (playerPosition === 'DM') {
            // DM с CD - все CD
            if (connectedPos === 'CD') {
                const cdIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CD') cdIndices.push(i);
                });
                const cdConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CD').length;
                connectedPlayerIndex = cdIndices[cdConnectionIndex];
            }
            // DM с другими DM
            else if (connectedPos === 'DM') {
                const dmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'DM' && i !== playerIndex) dmIndices.push(i);
                });
                const dmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'DM').length;
                connectedPlayerIndex = dmIndices[dmConnectionIndex];
            }
            // DM с CM - все CM
            else if (connectedPos === 'CM') {
                const cmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CM') cmIndices.push(i);
                });
                const cmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CM').length;
                connectedPlayerIndex = cmIndices[cmConnectionIndex];
            }
            // DM с CF - все CF
            else if (connectedPos === 'CF') {
                const cfIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CF') cfIndices.push(i);
                });
                const cfConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CF').length;
                connectedPlayerIndex = cfIndices[cfConnectionIndex];
            }
            // Для остальных связей DM - первое вхождение
            else {
                connectedPlayerIndex = positions.findIndex(pos => pos === connectedPos);
            }
        }
        // Специальная обработка для AM
        else if (playerPosition === 'AM') {
            // AM с CM - все CM
            if (connectedPos === 'CM') {
                const cmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CM') cmIndices.push(i);
                });
                const cmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CM').length;
                connectedPlayerIndex = cmIndices[cmConnectionIndex];
            }
            // AM с DM - все DM
            else if (connectedPos === 'DM') {
                const dmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'DM') dmIndices.push(i);
                });
                const dmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'DM').length;
                connectedPlayerIndex = dmIndices[dmConnectionIndex];
            }
            // AM с CF - все CF
            else if (connectedPos === 'CF') {
                const cfIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CF') cfIndices.push(i);
                });
                const cfConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CF').length;
                connectedPlayerIndex = cfIndices[cfConnectionIndex];
            }
            // Для остальных связей AM - первое вхождение
            else {
                connectedPlayerIndex = positions.findIndex(pos => pos === connectedPos);
            }
        }
        // Специальная обработка для LF
        else if (playerPosition === 'LF') {
            // LF с CF - левый CF (min index) для 424 или первый CF для обычной формации
            if (connectedPos === 'CF') {
                const cfIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CF') cfIndices.push(i);
                });
                if (cfIndices.length > 0) {
                    connectedPlayerIndex = Math.min(...cfIndices); // Левый CF
                    console.log(`[CHEMISTRY] LF connecting to CF at index ${connectedPlayerIndex} (min)`);
                }
            }
            // LF с CM - левый CM (min index)
            else if (connectedPos === 'CM') {
                const cmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CM') cmIndices.push(i);
                });
                if (cmIndices.length > 0) {
                    connectedPlayerIndex = Math.min(...cmIndices); // Левый CM
                    console.log(`[CHEMISTRY] LF connecting to CM at index ${connectedPlayerIndex} (min)`);
                }
            }
            // Для остальных связей LF - первое вхождение
            else {
                connectedPlayerIndex = positions.findIndex(pos => pos === connectedPos);
            }
        }
        // Специальная обработка для RF
        else if (playerPosition === 'RF') {
            // RF с CF - правый CF (max index) для 424 или первый CF для обычной формации
            if (connectedPos === 'CF') {
                const cfIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CF') cfIndices.push(i);
                });
                if (cfIndices.length > 0) {
                    connectedPlayerIndex = Math.max(...cfIndices); // Правый CF
                    console.log(`[CHEMISTRY] RF connecting to CF at index ${connectedPlayerIndex} (max)`);
                }
            }
            // RF с CM - правый CM (max index)
            else if (connectedPos === 'CM') {
                const cmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CM') cmIndices.push(i);
                });
                if (cmIndices.length > 0) {
                    connectedPlayerIndex = Math.max(...cmIndices); // Правый CM
                    console.log(`[CHEMISTRY] RF connecting to CM at index ${connectedPlayerIndex} (max)`);
                }
            }
            // Для остальных связей RF - первое вхождение
            else {
                connectedPlayerIndex = positions.findIndex(pos => pos === connectedPos);
            }
        }
        // Специальная обработка для CF
        else if (playerPosition === 'CF') {
            const cfType = getCFType(positions, playerIndex);
            
            // CF с другими CF
            if (connectedPos === 'CF') {
                const cfIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CF' && i !== playerIndex) cfIndices.push(i);
                });
                
                if (cfType === 'min' && cfIndices.length > 0) {
                    // Левый CF связан со следующим (index+1)
                    connectedPlayerIndex = cfIndices[0];
                } else if (cfType === 'max' && cfIndices.length > 0) {
                    // Правый CF связан с предыдущим (index-1)
                    connectedPlayerIndex = cfIndices[cfIndices.length - 1];
                } else if (cfType === 'middle') {
                    // Средний CF связан со всеми остальными CF
                    const cfConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CF').length;
                    connectedPlayerIndex = cfIndices[cfConnectionIndex];
                } else {
                    // Для двух CF - берем другой CF
                    connectedPlayerIndex = cfIndices[0];
                }
            }
            // CF с CM
            else if (connectedPos === 'CM') {
                const cmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CM') cmIndices.push(i);
                });
                
                if (cfType === 'min' && cmIndices.length > 0) {
                    // Левый CF связан с левым CM
                    connectedPlayerIndex = Math.min(...cmIndices);
                } else if (cfType === 'max' && cmIndices.length > 0) {
                    // Правый CF связан с правым CM
                    connectedPlayerIndex = Math.max(...cmIndices);
                } else if (cfType === 'middle' && cmIndices.length > 0) {
                    // Средний CF связан со всеми CM
                    const cmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CM').length;
                    connectedPlayerIndex = cmIndices[cmConnectionIndex];
                } else if (cmIndices.length > 0) {
                    // Для единственного CF - связан со всеми CM
                    const cmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CM').length;
                    connectedPlayerIndex = cmIndices[cmConnectionIndex];
                }
            }
            // CF с DM
            else if (connectedPos === 'DM') {
                const dmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'DM') dmIndices.push(i);
                });
                // CF связан со всеми DM (берем по порядку)
                const dmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'DM').length;
                connectedPlayerIndex = dmIndices[dmConnectionIndex];
            }
            // Для остальных связей CF - первое вхождение
            else {
                connectedPlayerIndex = positions.findIndex(pos => pos === connectedPos);
            }
        }
        // Специальная обработка для ST
        else if (playerPosition === 'ST') {
            // ST с CF - все CF
            if (connectedPos === 'CF') {
                const cfIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CF') cfIndices.push(i);
                });
                const cfConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CF').length;
                connectedPlayerIndex = cfIndices[cfConnectionIndex];
            }
            // ST с CM - все CM
            else if (connectedPos === 'CM') {
                const cmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'CM') cmIndices.push(i);
                });
                const cmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'CM').length;
                connectedPlayerIndex = cmIndices[cmConnectionIndex];
            }
            // ST с DM - все DM
            else if (connectedPos === 'DM') {
                const dmIndices = [];
                positions.forEach((pos, i) => {
                    if (pos === 'DM') dmIndices.push(i);
                });
                const dmConnectionIndex = connectedPositions.slice(0, idx).filter(p => p === 'DM').length;
                connectedPlayerIndex = dmIndices[dmConnectionIndex];
            }
            // Для остальных связей ST - первое вхождение
            else {
                connectedPlayerIndex = positions.findIndex(pos => pos === connectedPos);
            }
        }
        else {
            // Для остальных позиций - находим первое вхождение
            connectedPlayerIndex = positions.findIndex(pos => pos === connectedPos);
        }
        
        if (connectedPlayerIndex !== -1 && connectedPlayerIndex < lineup.length) {
            const connectedPlayer = lineup[connectedPlayerIndex];
            if (connectedPlayer) {
                const lineModifier = calculateLineModifier(player, connectedPlayer);
                totalModifier += lineModifier;
                connectionCount++;
            }
        }
    });
    
    // Рассчитываем базовый Chemistry (среднее арифметическое модификаторов всех линий)
    // ВАЖНО: Больше связей = стабильнее результат, но максимальный бонус всегда 12.5%
    const baseChemistry = connectionCount > 0 ? totalModifier / connectionCount : 0;
    
    // Применяем модификатор изученности стиля игрока
    const styleKnowledge = player.styleKnowledge || 1.0; // По умолчанию 100%
    const finalChemistry = baseChemistry * styleKnowledge;
    
    return finalChemistry;
}

/**
 * Получает бонус Chemistry для игрока (интеграция с существующей системой)
 * @param {Object} player - Игрок
 * @param {Array} inLineupPlayers - Массив игроков в составе
 * @param {string} teamStyleId - Стиль команды (не используется в Chemistry)
 * @returns {number} - Бонус Chemistry в процентах
 */
function getChemistryBonus(player, inLineupPlayers, teamStyleId) {
    // Проверяем наличие данных игрока
    if (!player) {
        console.warn('[CHEMISTRY] Игрок не найден');
        return 0;
    }
    
    // Получаем позиции из slotEntries (если доступны)
    const slotEntries = window.currentSlotEntries || [];
    
    if (slotEntries.length === 0) {
        console.log('[CHEMISTRY] slotEntries не доступны, Chemistry отключен');
        return 0;
    }
    
    // Находим entry для текущего игрока чтобы получить customStyleValue
    const playerEntry = slotEntries.find(entry => 
        entry.player && String(entry.player.id) === String(player.id)
    );
    
    // Определяем стиль для Chemistry: customStyleValue (если есть) или hidden_style
    const effectiveStyle = (playerEntry && playerEntry.customStyleValue) || player.hidden_style || 'norm';
    
    // Создаем модифицированный объект игрока с эффективным стилем
    const modifiedPlayer = {
        ...player,
        hidden_style: effectiveStyle
    };
    
    // Проверяем наличие необходимых данных для Chemistry
    if (!modifiedPlayer.nat_id && !modifiedPlayer.hidden_style) {
        console.log(`[CHEMISTRY] ${player.name}: нет данных для Chemistry (nat_id: ${modifiedPlayer.nat_id}, style: ${modifiedPlayer.hidden_style})`);
        return 0;
    }
    
    // Находим позиции всех игроков
    const positions = slotEntries.map(entry => entry.matchPos);
    
    // Создаем модифицированный lineup с эффективными стилями
    const modifiedLineup = inLineupPlayers.map(p => {
        const pEntry = slotEntries.find(entry => 
            entry.player && String(entry.player.id) === String(p.id)
        );
        const pEffectiveStyle = (pEntry && pEntry.customStyleValue) || p.hidden_style || 'norm';
        
        return {
            ...p,
            hidden_style: pEffectiveStyle
        };
    });
    
    // Рассчитываем модификатор Chemistry
    const modifier = calculatePlayerChemistryModifier(modifiedPlayer, modifiedLineup, positions);
    
    // Логирование для отладки (только если есть модификатор)
    if (modifier !== 0) {
        const isCustomStyle = playerEntry && playerEntry.customStyleValue && 
                             playerEntry.customStyleValue !== player.hidden_style;
        
        console.log(`[CHEMISTRY] ${player.name}: ${(modifier * 100).toFixed(1)}%`, {
            nat_id: player.nat_id,
            nat: player.nat,
            original_style: player.hidden_style,
            effective_style: effectiveStyle,
            custom_style: isCustomStyle ? playerEntry.customStyleValue : null,
            styleKnowledge: player.styleKnowledge,
            modifier: modifier
        });
    }
    
    return modifier; // Возвращаем как есть (уже в долях от 1)
}

// ===== КОНЕЦ CHEMISTRY SYSTEM =====

function pickClosest(target, nums) {
    if (!nums || !nums.length) {
        return null;
    }
    let best = nums[0],
        bestDiff = Math.abs(nums[0] - target);
    for (let i = 1; i < nums.length; i++) {
        const d = Math.abs(nums[i] - target);
        if (d < bestDiff || (d === bestDiff && nums[i] > best)) {
            best = nums[i];
            bestDiff = d;
        }
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

// Линейная интерполяция между двумя точками
function linearInterpolate(x, x0, y0, x1, y1) {
    if (x1 === x0) return y0; // Избегаем деления на ноль
    return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
}

// Новая функция с интерполяцией
function getWeatherStrengthWithInterpolation(result, temperature, weather, strength, callback) {
    if (!result) return callback({ found: false });

    const weatherMap = {
        "очень жарко": [0, 2],
        "жарко": [3, 6],
        "солнечно": [7, 11],
        "облачно": [12, 16],
        "пасмурно": [17, 21],
        "дождь": [22, 25],
        "снег": [26, 28]
    };

    const colRange = weatherMap[weather.toLowerCase()];
    if (!colRange) return callback({ found: false, error: "Погода не найдена" });

    // Находим строку с нужной силой
    const row = result.strengthTable.find(r => parseInt(r.strength, 10) === strength);
    if (!row) return callback({ found: false, error: "Сила не найдена" });

    // Собираем все доступные температуры и значения силы для данной погоды
    const dataPoints = [];
    for (let i = colRange[0]; i <= colRange[1]; i++) {
        const temp = parseInt(result.temperatures[i], 10);
        const value = parseInt(row.values[i], 10);
        if (!Number.isNaN(temp) && !Number.isNaN(value)) {
            dataPoints.push({ temp, value });
        }
    }

    if (dataPoints.length === 0) {
        return callback({ found: false, error: "Нет данных для интерполяции" });
    }

    // Сортируем по температуре
    dataPoints.sort((a, b) => a.temp - b.temp);

    const minTemp = dataPoints[0].temp;
    const maxTemp = dataPoints[dataPoints.length - 1].temp;

    // Если температура точно совпадает с одной из точек
    const exactMatch = dataPoints.find(p => p.temp === temperature);
    if (exactMatch) {
        return callback({
            found: true,
            weatherStr: exactMatch.value,
            interpolated: false,
            details: {
                temperature,
                requestedTemperature: temperature,
                weather,
                strength,
                method: 'exact'
            }
        });
    }

    // Если температура в диапазоне - делаем интерполяцию
    if (temperature >= minTemp && temperature <= maxTemp) {
        // Находим две ближайшие точки
        let lowerPoint = dataPoints[0];
        let upperPoint = dataPoints[dataPoints.length - 1];

        for (let i = 0; i < dataPoints.length - 1; i++) {
            if (dataPoints[i].temp <= temperature && dataPoints[i + 1].temp >= temperature) {
                lowerPoint = dataPoints[i];
                upperPoint = dataPoints[i + 1];
                break;
            }
        }

        const interpolatedValue = linearInterpolate(
            temperature,
            lowerPoint.temp,
            lowerPoint.value,
            upperPoint.temp,
            upperPoint.value
        );

        return callback({
            found: true,
            weatherStr: Math.round(interpolatedValue),
            interpolated: true,
            details: {
                temperature,
                requestedTemperature: temperature,
                weather,
                strength,
                method: 'interpolation',
                lowerPoint,
                upperPoint,
                interpolatedValue
            }
        });
    }

    // Если температура вне диапазона - используем ближайшую точку
    if (temperature < minTemp) {
        return callback({
            found: true,
            weatherStr: dataPoints[0].value,
            interpolated: false,
            details: {
                temperature: minTemp,
                requestedTemperature: temperature,
                weather,
                strength,
                method: 'extrapolation_min'
            }
        });
    } else {
        return callback({
            found: true,
            weatherStr: dataPoints[dataPoints.length - 1].value,
            interpolated: false,
            details: {
                temperature: maxTemp,
                requestedTemperature: temperature,
                weather,
                strength,
                method: 'extrapolation_max'
            }
        });
    }
}

// Старая функция удалена - используем только интерполяцию

function getCollisionInfo(teamStyleId, oppStyleId) {
    if (!teamStyleId || !oppStyleId) {
        return {
            teamStatus: COLLISION_NONE,
            oppStatus: COLLISION_NONE,
            teamBonus: 0,
            oppBonus: 0
        };
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
        teamStatus = COLLISION_WIN;
        oppStatus = COLLISION_LOSE;
        teamBonus = winBonus;
        oppBonus = 0;
    } else if (!winBonus && oppWinBonus) {
        teamStatus = COLLISION_LOSE;
        oppStatus = COLLISION_WIN;
        teamBonus = 0;
        oppBonus = oppWinBonus;
    }
    return {
        teamStatus,
        oppStatus,
        teamBonus,
        oppBonus
    };
}
const SUPPORTED_ABILITY_TYPES = new Set(['Ск', 'Г', 'Пд', 'Пк', 'Д', 'Км', 'В', 'Р']);
const KNOWN_STYLE_IDS = new Set(['sp', 'brazil', 'tiki', 'bb', 'kat', 'brit', 'norm']);

function parseAbilities(abilitiesStr) {
    if (!abilitiesStr) {
        return [];
    }
    const res = [];
    const singleFlags = abilitiesStr.match(/\b[А-ЯЁA-Z]\b/gi) || [];
    singleFlags.forEach(f => {
        const up = f.replace('ё', 'е').replace('Ё', 'Е').toUpperCase();
        if (up === 'Л') {
            res.push({
                type: 'Л',
                level: 1
            });
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
                res.push({
                    type,
                    level
                });
            }
        }
    }
    return res;
}

function defenceTypeBonus({
    team,
    opponent,
    withResult = false
}) {
    const DEF = new Set(['GK', 'LD', 'LB', 'SW', 'CD', 'RD', 'RB']);
    const ATT = new Set(['LW', 'LF', 'AM', 'CF', 'ST', 'RW', 'RF']);
    const defenceType = team.defenceType || 'zonal';
    const oppAttCount = opponent.positions.filter(pos => ATT.has(pos)).length;
    const bonusActive =
        (defenceType === 'zonal' && oppAttCount > 3) ||
        (defenceType === 'man' && oppAttCount <= 3);
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
        bonusActive ?
            `DefenceTypeBonus: +${totalBonus.toFixed(2)} (${defenceType === 'zonal' ? 'зональный' : 'персональный'}; атакующих у соперника: ${oppAttCount})` :
            `DefenceTypeBonus: 0 (условия не выполнены; атакующих у соперника: ${oppAttCount})`
    );
    if (withResult) {
        return {
            applied: bonusActive,
            totalBonus,
            perIndex,
            defenceType,
            oppAttCount
        };
    }
}

function getMorale(team) {
    return (team && team.morale) || 'normal';
}

function getMoraleBonusBounds({
    homeRating,
    awayRating,
    sideLabel
}) {
    const h = Math.round(homeRating);
    const a = Math.round(awayRating);

    console.log('[MoraleBonus] Calculating bounds', {
        sideLabel,
        homeRating: h,
        awayRating: a
    });

    if (!h || !a) {
        return {
            superBonus: CONFIG.BONUSES.MORALE.SUPER_DEFAULT,
            restBonus: CONFIG.BONUSES.MORALE.REST_DEFAULT
        };
    }
    let ratio = h > a ? h / a : a / h;
    ratio = Math.max(1, ratio);
    let superBonus = CONFIG.BONUSES.MORALE.SUPER_DEFAULT;
    let restBonus = CONFIG.BONUSES.MORALE.REST_DEFAULT;
    if (sideLabel === 'home') {
        if (h < a) {
            console.log('[MoraleBonus] Home is weaker');
            superBonus = Math.min(0.54, (ratio - 1) / 2 + CONFIG.BONUSES.MORALE.SUPER_DEFAULT);
            restBonus = CONFIG.BONUSES.MORALE.REST_DEFAULT;
        } else {
            console.log('[MoraleBonus] Home is stronger or equal');
            superBonus = CONFIG.BONUSES.MORALE.SUPER_DEFAULT;
            restBonus = Math.max(-0.25, Math.min(CONFIG.BONUSES.MORALE.REST_DEFAULT, -((ratio - 1) / 4) + CONFIG.BONUSES.MORALE.REST_DEFAULT));
        }
    } else {
        if (a < h) {
            console.log('[MoraleBonus] Away is weaker');
            superBonus = Math.min(0.54, (ratio - 1) / 2 + CONFIG.BONUSES.MORALE.SUPER_DEFAULT);
            restBonus = CONFIG.BONUSES.MORALE.REST_DEFAULT;
        } else {
            console.log('[MoraleBonus] Away is stronger or equal');
            superBonus = CONFIG.BONUSES.MORALE.SUPER_DEFAULT;
            restBonus = Math.max(-0.25, Math.min(CONFIG.BONUSES.MORALE.REST_DEFAULT, -((ratio - 1) / 4) + CONFIG.BONUSES.MORALE.REST_DEFAULT));
        }
    }

    console.log('[MoraleBonus] Result', {
        ratio: ratio.toFixed(2),
        superBonus: superBonus.toFixed(3),
        restBonus: restBonus.toFixed(3)
    });

    return {
        superBonus,
        restBonus
    };
}

function getMoraleBonusForPlayer({
    moraleMode,
    contribBase,
    bounds
}) {
    if (moraleMode === 'super') {
        return contribBase * bounds.superBonus;
    }
    if (moraleMode === 'rest') {
        return contribBase * bounds.restBonus;
    }
    return 0;
}

function getAtmosphereBonus(contribBase, atmosphereValue) {
    return contribBase * atmosphereValue;
}

function getRough(team) {
    return (team && team.rough) || 'clean';
}

function getRoughBonusForPlayer(realStr, roughMode) {
    if (roughMode !== 'rough') {
        return 0;
    }
    const base = (Number(realStr) || 0) * 0.08;
    return Math.max(base, 5.0);
}

function roughBonus({
    team,
    slotEntries
}) {
    const mode = getRough(team);
    team.roughContribution = new Array(slotEntries.length).fill(0);
    if (mode !== 'rough') {
        return 0;
    }
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
    if (!abilitiesStr) {
        return 0;
    }
    const m = abilitiesStr.match(/Ка(\d)?/);
    if (!m) {
        return 0;
    }
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
    if (!kaLevel) {
        return null;
    }
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
    if (!captainPlayer) {
        return 0;
    }
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
    if (!valid.length) {
        return 0;
    }
    const sum = valid.reduce((acc, e) => acc + (Number(e.player.realStr) || 0), 0);
    return sum / valid.length;
}
const STYLE_ABILITIES_BONUS_MAP = {
    'Ск': {
        bb: [0.10, 0.20, 0.30, 0.40],
        brit: [0.06, 0.12, 0.18, 0.24],
        norm: [0.05, 0.10, 0.15, 0.20],
        kat: [0.04, 0.08, 0.12, 0.16],
        other: [0.02, 0.04, 0.06, 0.08]
    },
    'Г': {
        brit: [0.10, 0.20, 0.30, 0.40],
        kat: [0.06, 0.12, 0.18, 0.24],
        norm: [0.05, 0.10, 0.15, 0.20],
        bb: [0.04, 0.08, 0.12, 0.16],
        other: [0.02, 0.04, 0.06, 0.08]
    },
    'Пд': {
        kat: [0.10, 0.20, 0.30, 0.40],
        bb: [0.06, 0.12, 0.18, 0.24],
        norm: [0.05, 0.10, 0.15, 0.20],
        brit: [0.04, 0.08, 0.12, 0.16],
        other: [0.02, 0.04, 0.06, 0.08]
    },
    'Пк': {
        sp: [0.10, 0.20, 0.30, 0.40],
        tiki: [0.06, 0.12, 0.18, 0.24],
        norm: [0.05, 0.10, 0.15, 0.20],
        brazil: [0.04, 0.08, 0.12, 0.16],
        other: [0.02, 0.04, 0.06, 0.08]
    },
    'Д': {
        brazil: [0.10, 0.20, 0.30, 0.40],
        sp: [0.06, 0.12, 0.18, 0.24],
        norm: [0.05, 0.10, 0.15, 0.20],
        tiki: [0.04, 0.08, 0.12, 0.16],
        other: [0.02, 0.04, 0.06, 0.08]
    },
    'Км': {
        tiki: [0.10, 0.20, 0.30, 0.40],
        brazil: [0.06, 0.12, 0.18, 0.24],
        norm: [0.05, 0.10, 0.15, 0.20],
        sp: [0.04, 0.08, 0.12, 0.16],
        other: [0.02, 0.04, 0.06, 0.08]
    }
};

// Вратарские способности: зависят от наличия SW в защите
const GOALKEEPER_ABILITIES_BONUS = {
    'В': {
        withSW: [0.03, 0.06, 0.09, 0.12],
        withoutSW: [0.08, 0.16, 0.24, 0.32]
    },
    'Р': {
        withSW: [0.08, 0.16, 0.24, 0.32],
        withoutSW: [0.03, 0.06, 0.09, 0.12]
    }
};
const LEADERSHIP_LEVEL_COEFF = [0, 0.03, 0.06, 0.09, 0.12];

function getLineByMatchPos(matchPos) {
    const DEF = new Set(['GK', 'LD', 'LB', 'SW', 'CD', 'RD', 'RB']);
    const MID = new Set(['LM', 'DM', 'CM', 'FR', 'RM']);
    const ATT = new Set(['LW', 'LF', 'AM', 'CF', 'ST', 'RW', 'RF']);
    if (DEF.has(matchPos)) return 'DEF';
    if (MID.has(matchPos)) return 'MID';
    if (ATT.has(matchPos)) return 'ATT';
    return null;
}

function getAbilitiesBonusesDetailed(abilitiesStr, teamStyleId) {
    const arr = parseAbilities(abilitiesStr);
    if (!arr || !arr.length) {
        return [];
    }
    const result = [];
    for (const ab of arr) {
        const map = STYLE_ABILITIES_BONUS_MAP[ab.type];
        if (!map) continue;
        const table = map[teamStyleId] || map.other;
        if (!table || !Array.isArray(table)) continue;
        const idx = Math.min(Math.max(ab.level - 1, 0), 3);
        const bonus = Number(table[idx]) || 0;
        result.push({
            type: ab.type,
            level: ab.level,
            bonus
        });
    }
    return result;
}

function getAbilitiesBonusForStyleId(abilitiesStr, teamStyleId) {
    if (!abilitiesStr) {
        return 0;
    }
    const arr = parseAbilities(abilitiesStr);
    if (!arr || !arr.length) {
        return 0;
    }
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

// Расчет вратарских способностей (зависит от наличия SW в защите)
function getGoalkeeperAbilitiesBonus(abilitiesStr, hasSW) {
    if (!abilitiesStr) {
        return 0;
    }
    const arr = parseAbilities(abilitiesStr);
    if (!arr || !arr.length) {
        return 0;
    }

    let sum = 0;
    for (const ab of arr) {
        const map = GOALKEEPER_ABILITIES_BONUS[ab.type];
        if (!map) {
            continue;
        }

        const table = hasSW ? map.withSW : map.withoutSW;
        if (!Array.isArray(table) || table.length < 4) {
            continue;
        }

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
            // Используем интерполяцию
            return getWeatherStrengthWithInterpolation(cached, temperature, weather, strength, (interpolationResult) => {
                if (interpolationResult && interpolationResult.found) {
                    callback(interpolationResult);
                } else {
                    console.error('[Weather] Interpolation failed (cached)', {
                        temperature,
                        weather,
                        strength,
                        error: interpolationResult?.error
                    });
                    callback({ found: false, error: 'Interpolation failed' });
                }
            });
        } catch (e) {
        }
    }
    const url = `${SITE_CONFIG.BASE_URL}/weather.php?step=1&style=${encodeURIComponent(styleId)}`;
    GM_xmlhttpRequest({
        method: "GET",
        url: url,
        onload: function (response) {
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
                        return tds.length > 5 && tds.every(td => td.textContent.trim().endsWith(
                            '°'));
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
                            strengthTable.push({
                                strength,
                                values
                            });
                        }
                    }
                }
                const result = {
                    temperatures,
                    strengthTable
                };
                try {
                    vsStorage.set(cacheKey, JSON.stringify(result));
                } catch (e) {
                }

                // Используем интерполяцию
                getWeatherStrengthWithInterpolation(result, temperature, weather, strength, (interpolationResult) => {
                    if (interpolationResult && interpolationResult.found) {
                        callback(interpolationResult);
                    } else {
                        console.error('[Weather] Interpolation failed (fresh)', {
                            temperature,
                            weather,
                            strength,
                            error: interpolationResult?.error
                        });
                        callback({ found: false, error: 'Interpolation failed' });
                    }
                });
            } catch (e) {
                callback(null);
            }
        },
        onerror: function () {
            callback(null);
        }
    });
}

function getFavoriteStyleBonus(teamStyleId, playerStyleId) {
    if (!teamStyleId || !playerStyleId) return 0;
    if (teamStyleId === playerStyleId) return 0.025;
    const teamWins = collision_bonuses[teamStyleId] || null;
    const oppWins = collision_bonuses[playerStyleId] || null;
    const teamBeatsPlayer = !!(teamWins && teamWins[playerStyleId]);
    const playerBeatsTeam = !!(oppWins && oppWins[teamStyleId]);
    if (teamBeatsPlayer || playerBeatsTeam) return -0.01;
    return 0;
}

function getPositionBonus(teamStyleId, playerPosition) {
    if (!teamStyleId || !playerPosition) return 0;

    const styleTable = CONFIG.BONUSES.POSITION_BONUS_TABLE[teamStyleId];
    if (!styleTable) return 0;

    return styleTable[playerPosition] || 0;
}

function getRealityBonus(realStatus, realSign) {
    // Маппинг бонусов реальности на основе real_status (p[31]) и real_sign (p[32])
    const status = Number(realStatus) || 0;
    const sign = Number(realSign) || 0;

    if (status === 0) {
        // Обычная реальность
        const bonuses = [1.0, 1.03, 1.05, 1.0, 1.07];
        return bonuses[sign] || 1.0;
    } else if (status === 1) {
        // Повышенная реальность
        const bonuses = [1.0, 1.07, 1.10, 1.0, 1.15];
        return bonuses[sign] || 1.0;
    }

    return 1.0;
}

function getFatigueBonus(fatigue) {
    // Бонус усталости: 1 - (fatigue / 100)
    const f = Number(fatigue) || 0;
    return 1 - (f / 100);
}

function getPositionModifier(mainPos, secondPos, matchPosition) {
    if (!matchPosition) return 1.0;
    if (!mainPos && !secondPos) return 1.0;

    // Маппинг бонусов за универсальность (сочетание позиций дает +5% бонус)
    const versatilityBonuses = {
        // вингбеки
        'LB_LM': { 'LB': 1.05 },
        'LD_LM': { 'LB': 1.05 },
        'RB_RM': { 'RB': 1.05 },
        'RD_RM': { 'RB': 1.05 },

        // Опорники
        'CD_CM': { 'DM': 1.05 },
        'CM_CD': { 'DM': 1.05 },

        // AM + вингеры
        'CM_CF': { 'AM': 1.05 },
        'CF_CM': { 'AM': 1.05 },
        'LF_LM': { 'LW': 1.05 },
        'RM_RF': { 'RW': 1.05 },
        'LM_LF': { 'LW': 1.05 },
        'RF_RM': { 'RW': 1.05 },

    };

    // ШАГ 1: Проверяем бонус за универсальность (если есть обе позиции)
    if (mainPos && secondPos) {
        const positions = [mainPos, secondPos].sort();
        const posKey = positions.join('_');
        const bonuses = versatilityBonuses[posKey];

        if (bonuses && bonuses[matchPosition]) {
            return bonuses[matchPosition];
        }
    }

    // ШАГ 2: Получаем модификаторы из таблицы штрафов для обеих позиций
    let modifier1 = 1.0;
    let modifier2 = 1.0;

    if (mainPos) {
        const modifiers = CONFIG.POSITION_MODIFIERS[mainPos];
        if (modifiers) {
            modifier1 = modifiers[matchPosition] || 1.0;
        }
    }

    if (secondPos) {
        const modifiers = CONFIG.POSITION_MODIFIERS[secondPos];
        if (modifiers) {
            modifier2 = modifiers[matchPosition] || 1.0;
        }
    }

    // ШАГ 3: Выбираем лучший модификатор
    const finalModifier = Math.max(modifier1, modifier2);

    return finalModifier;
}

// Функции для работы с физической формой
function getPhysicalFormsByTournamentType(tournamentType) {
    const forms = CONFIG.PHYSICAL_FORM.TOURNAMENT_TYPES[tournamentType] || CONFIG.PHYSICAL_FORM.TOURNAMENT_TYPES.all;
    return forms.map(formId => ({
        id: formId,
        ...CONFIG.PHYSICAL_FORM.FORMS[formId]
    }));
}

// Алиас для обратной совместимости
function getPhysicalFormsByDayType(dayType) {
    return getPhysicalFormsByTournamentType(dayType);
}

function getPhysicalFormModifier(formId) {
    if (!formId) return 1.0;
    const form = CONFIG.PHYSICAL_FORM.FORMS[formId];
    return form ? form.modifier : 1.0;
}

function applyPhysicalFormToRealStr(baseRealStr, formId) {
    const modifier = getPhysicalFormModifier(formId);
    return Math.round(baseRealStr * modifier);
}

function getPhysicalFormIdFromData(formPercent, formDirection, tournamentType = 'typeC') {
    // Товарищеские матчи всегда 100% формы, независимо от реального значения
    if (tournamentType === 'friendly') {
        return 'FRIENDLY_100';
    }

    // Если форма неизвестна
    if (!formPercent || formPercent === '' || formPercent === '0' || formPercent === 0) {
        return 'UNKNOWN';
    }

    const percent = Number(formPercent);
    if (!Number.isFinite(percent)) {
        return 'UNKNOWN';
    }

    // Определяем направление: 1 = up, 2 = down, иначе unknown
    let trend = 'down';
    if (formDirection === 1 || formDirection === '1') {
        trend = 'up';
    } else if (formDirection === 2 || formDirection === '2') {
        trend = 'down';
    }

    // Определяем тип турнира (B или C)
    const isTypeB = tournamentType === 'typeB' || tournamentType === 'typeB_amateur';
    const isTypeC = tournamentType === 'typeC' || tournamentType === 'typeC_international';
    const prefix = isTypeB ? 'B' : (isTypeC ? 'C' : 'C');

    // Ищем точное совпадение
    const exactFormId = `${prefix}_${percent}_${trend}`;
    if (CONFIG.PHYSICAL_FORM.FORMS[exactFormId]) {
        return exactFormId;
    }

    // Если точного совпадения нет, ищем ближайшую форму с учетом направления
    const availableForms = Object.keys(CONFIG.PHYSICAL_FORM.FORMS)
        .filter(id => id.startsWith(prefix) && CONFIG.PHYSICAL_FORM.FORMS[id].trend === trend)
        .map(id => ({
            id,
            percent: CONFIG.PHYSICAL_FORM.FORMS[id].percent
        }))
        .sort((a, b) => a.percent - b.percent); // Сортируем по возрастанию процента

    if (availableForms.length > 0) {
        // Определяем тип формы для матрицы переходов
        const formType = prefix; // 'B' или 'C'

        // Используем матрицу переходов для интеллектуального выбора
        const selectedForm = selectFormByTransitionMatrix(availableForms, percent, trend, formType);
        return selectedForm ? selectedForm.id : availableForms[0].id;
    }

    // Если ничего не найдено, возвращаем UNKNOWN
    return 'UNKNOWN';
}

// Матрица-граф переходов между формами с учетом направления
const FORM_TRANSITION_MATRIX = {
    // Формы типа B
    'B': {
        // Растущие формы (up) - предпочитаем переход к большим значениям
        'up': {
            75: { preferred: [79, 88], fallback: [75] },
            79: { preferred: [88, 100], fallback: [75, 79] },
            88: { preferred: [100, 112], fallback: [79, 88] },
            100: { preferred: [112, 121], fallback: [88, 100] },
            112: { preferred: [121, 125], fallback: [100, 112] },
            121: { preferred: [125], fallback: [112, 121] },
            125: { preferred: [], fallback: [121, 125] }
        },
        // Падающие формы (down) - предпочитаем переход к меньшим значениям
        'down': {
            79: { preferred: [75], fallback: [79, 88] },
            88: { preferred: [79, 75], fallback: [88, 100] },
            100: { preferred: [88, 79], fallback: [100, 112] },
            112: { preferred: [100, 88], fallback: [112, 121] },
            121: { preferred: [112, 100], fallback: [121, 125] },
            125: { preferred: [121, 112], fallback: [125] }
        }
    },
    // Формы типа C
    'C': {
        'up': {
            76: { preferred: [83, 94], fallback: [76] },
            83: { preferred: [94, 106], fallback: [76, 83] },
            94: { preferred: [106, 117], fallback: [83, 94] },
            106: { preferred: [117, 124], fallback: [94, 106] },
            117: { preferred: [124], fallback: [106, 117] },
            124: { preferred: [], fallback: [117, 124] }
        },
        'down': {
            83: { preferred: [76], fallback: [83, 94] },
            94: { preferred: [83, 76], fallback: [94, 106] },
            106: { preferred: [94, 83], fallback: [106, 117] },
            117: { preferred: [106, 94], fallback: [117, 124] },
            124: { preferred: [117, 106], fallback: [124] }
        }
    }
};

// Функция выбора формы с использованием матрицы переходов
function selectFormByTransitionMatrix(availableForms, targetPercent, trend, formType) {
    console.log(`[FormMatrix] Выбор ${formType} формы для ${targetPercent}% (${trend}) из:`, availableForms.map(f => `${f.percent}%`));

    if (availableForms.length === 0) return null;
    if (availableForms.length === 1) return availableForms[0];

    // Получаем матрицу для данного типа и направления
    const typeMatrix = FORM_TRANSITION_MATRIX[formType];
    if (!typeMatrix || !typeMatrix[trend]) {
        console.log(`[FormMatrix] Матрица не найдена для ${formType}/${trend} - используем базовый алгоритм`);
        return selectFormByDirection(availableForms, targetPercent, trend);
    }

    const transitionRules = typeMatrix[trend][targetPercent];
    if (!transitionRules) {
        console.log(`[FormMatrix] Правила не найдены для ${targetPercent}% - используем базовый алгоритм`);
        return selectFormByDirection(availableForms, targetPercent, trend);
    }

    // Создаем карту доступных форм по процентам
    const availableByPercent = {};
    availableForms.forEach(form => {
        availableByPercent[form.percent] = form;
    });

    // Сначала ищем в предпочтительных вариантах
    for (const preferredPercent of transitionRules.preferred) {
        if (availableByPercent[preferredPercent]) {
            console.log(`[FormMatrix] Найден предпочтительный вариант: ${preferredPercent}%`);
            return availableByPercent[preferredPercent];
        }
    }

    // Если предпочтительных нет, ищем в fallback вариантах
    for (const fallbackPercent of transitionRules.fallback) {
        if (availableByPercent[fallbackPercent]) {
            console.log(`[FormMatrix] Найден fallback вариант: ${fallbackPercent}%`);
            return availableByPercent[fallbackPercent];
        }
    }

    // Если ничего не найдено в матрице, используем базовый алгоритм
    console.log(`[FormMatrix] Матрица не дала результата - используем базовый алгоритм`);
    return selectFormByDirection(availableForms, targetPercent, trend);
}

// Интеллектуальный выбор формы с учетом направления
function selectFormByDirection(availableForms, targetPercent, trend) {
    console.log(`[FormSelection] Выбор формы для ${targetPercent}% (${trend}):`, availableForms.map(f => `${f.percent}%`));

    if (availableForms.length === 0) return null;
    if (availableForms.length === 1) return availableForms[0];

    // Разделяем формы на меньшие и большие относительно целевого процента
    const lowerForms = availableForms.filter(f => f.percent <= targetPercent).sort((a, b) => b.percent - a.percent); // По убыванию
    const higherForms = availableForms.filter(f => f.percent > targetPercent).sort((a, b) => a.percent - b.percent); // По возрастанию

    console.log(`[FormSelection] Меньшие формы:`, lowerForms.map(f => `${f.percent}%`));
    console.log(`[FormSelection] Большие формы:`, higherForms.map(f => `${f.percent}%`));

    let selectedForm = null;

    if (trend === 'up') {
        // Форма растёт - предпочитаем ближайшую большую, затем ближайшую меньшую
        if (higherForms.length > 0) {
            selectedForm = higherForms[0]; // Ближайшая большая
            console.log(`[FormSelection] Форма растёт → выбираем ближайшую большую: ${selectedForm.percent}%`);
        } else if (lowerForms.length > 0) {
            selectedForm = lowerForms[0]; // Ближайшая меньшая (самая большая из меньших)
            console.log(`[FormSelection] Форма растёт, но больших нет → выбираем максимальную: ${selectedForm.percent}%`);
        }
    } else if (trend === 'down') {
        // Форма падает - предпочитаем ближайшую меньшую, затем ближайшую большую
        if (lowerForms.length > 0) {
            selectedForm = lowerForms[0]; // Ближайшая меньшая (самая большая из меньших)
            console.log(`[FormSelection] Форма падает → выбираем ближайшую меньшую: ${selectedForm.percent}%`);
        } else if (higherForms.length > 0) {
            selectedForm = higherForms[0]; // Ближайшая большая
            console.log(`[FormSelection] Форма падает, но меньших нет → выбираем минимальную: ${selectedForm.percent}%`);
        }
    } else {
        // Неизвестное направление - выбираем ближайшую по расстоянию
        const allSorted = availableForms.sort((a, b) =>
            Math.abs(a.percent - targetPercent) - Math.abs(b.percent - targetPercent)
        );
        selectedForm = allSorted[0];
        console.log(`[FormSelection] Неизвестное направление → выбираем ближайшую: ${selectedForm.percent}%`);
    }

    return selectedForm;
}
const TEAM_I_LEVEL_COEFF = [0, 0.005, 0.01, 0.02, 0.03];

function getTeamIBonusForLineup(inLineupPlayers, lineup) {
    const teamIBonusByPlayer = [];
    let teamIBonusTotal = 0;
    for (const p of inLineupPlayers) {
        const abilities = parseAbilities(p.abilities);
        const intuition = abilities.find(a => a.type === 'И');
        if (!intuition) {
            continue;
        }
        const lvl = Math.max(1, Math.min(4, Number(intuition.level) || 1));
        const coeff = TEAM_I_LEVEL_COEFF[lvl] || 0;

        // Используем calculatedRealStr вместо realStr
        let calculatedStr = 0;
        const playerSlot = lineup.find(s => {
            const pid = s.getValue && s.getValue();
            return pid && String(pid) === String(p.id);
        });

        if (playerSlot && playerSlot.posValue && playerSlot.physicalFormValue) {
            calculatedStr = calculatePlayerStrengthGlobal(p, playerSlot.posValue, playerSlot.physicalFormValue);
        } else {
            calculatedStr = Number(p.realStr) || 0;
        }

        const bonus = calculatedStr * coeff;
        teamIBonusByPlayer.push({
            playerId: p.id,
            name: p.name,
            level: lvl,
            calculatedStr,
            coeff,
            bonus
        });
        teamIBonusTotal += bonus;
    }
    return {
        teamIBonusByPlayer,
        teamIBonusTotal
    };
}

function parseTeamsRatingFromPage() {
    const table = Array.from(document.querySelectorAll('table.nol')).find(tbl =>
        tbl.textContent.includes('Рейтинг силы команд')
    );
    if (!table) {
        console.warn('[Rating] Table not found');
        return null;
    }
    const tds = table.querySelectorAll('td.rdl, td.gdl');
    if (tds.length < 2) {
        console.warn('[Rating] Not enough cells found');
        return null;
    }

    // Берем только первый текстовый узел, игнорируя span и div
    const getFirstTextNode = (element) => {
        for (const node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) return text;
            }
        }
        return '';
    };

    const homeText = getFirstTextNode(tds[0]);
    const awayText = getFirstTextNode(tds[1]);

    console.log('[Rating] Raw text', { homeText, awayText });

    const home = parseInt(homeText, 10);
    const away = parseInt(awayText, 10);

    console.log('[Rating] Parsed values', { home, away });

    if (!Number.isFinite(home) || !Number.isFinite(away)) {
        console.warn('[Rating] Invalid numbers');
        return null;
    }
    return {
        home,
        away
    };
}

function parseNumericWeatherStr(value) {
    if (value == null) return null;
    const s = String(value).replace(',', '.').replace(/[^\d.-]/g, '').trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}
class BonusCalculator {
    static getHomeBonus(percent) {
        if (percent === 100) return CONFIG.BONUSES.HOME[100];
        if (percent >= 90 && percent <= 99) return CONFIG.BONUSES.HOME[90];
        if (percent >= 80 && percent <= 89) return CONFIG.BONUSES.HOME[80];
        if (percent >= 0 && percent < 80) return CONFIG.BONUSES.HOME.DEFAULT;
        if (percent === -1) return 0;
        return 0;
    }

    static getMoraleBonusBounds({ homeRating, awayRating, sideLabel }) {
        const h = Math.round(homeRating);
        const a = Math.round(awayRating);
        if (!h || !a) {
            return {
                superBonus: CONFIG.BONUSES.MORALE.SUPER_DEFAULT,
                restBonus: CONFIG.BONUSES.MORALE.REST_DEFAULT
            };
        }

        let ratio = h > a ? h / a : a / h;
        ratio = Math.max(1, ratio);
        let superBonus = CONFIG.BONUSES.MORALE.SUPER_DEFAULT;
        let restBonus = CONFIG.BONUSES.MORALE.REST_DEFAULT;

        if (sideLabel === 'home') {
            if (h < a) {
                superBonus = Math.min(0.54, (ratio - 1) / 2 + CONFIG.BONUSES.MORALE.SUPER_DEFAULT);
                restBonus = CONFIG.BONUSES.MORALE.REST_DEFAULT;
            } else {
                superBonus = CONFIG.BONUSES.MORALE.SUPER_DEFAULT;
                restBonus = Math.max(-0.25, Math.min(CONFIG.BONUSES.MORALE.REST_DEFAULT, -((ratio - 1) / 4) + CONFIG.BONUSES.MORALE.REST_DEFAULT));
            }
        } else {
            if (a < h) {
                superBonus = Math.min(0.54, (ratio - 1) / 2 + CONFIG.BONUSES.MORALE.SUPER_DEFAULT);
                restBonus = CONFIG.BONUSES.MORALE.REST_DEFAULT;
            } else {
                superBonus = CONFIG.BONUSES.MORALE.SUPER_DEFAULT;
                restBonus = Math.max(-0.25, Math.min(CONFIG.BONUSES.MORALE.REST_DEFAULT, -((ratio - 1) / 4) + CONFIG.BONUSES.MORALE.REST_DEFAULT));
            }
        }

        return { superBonus, restBonus };
    }
}

// Legacy function for backward compatibility
function getHomeBonus(percent) {
    return BonusCalculator.getHomeBonus(percent);
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
        return pl ? {
            player: pl
        } : null;
    });
    return {
        captainPlayer,
        captainId,
        dummyEntries
    };
}
class GameState {
    constructor() {
        this.teams = {
            home: this.createTeamState(),
            away: this.createTeamState()
        };
        this.ui = {};
        this.players = {
            home: [],
            away: []
        };
        this.weather = null;
        this.stadium = null;
    }

    createTeamState() {
        return {
            defenceType: 'zonal',
            rough: 'clean',
            morale: 'normal',
            style: 'norm',
            formation: '4-4-2',
            captain: null,
            lineup: new Array(11).fill(null),
            miniPositions: new Array(11).fill(null),
            synergy: 0
        };
    }

    getTeam(side) {
        return this.teams[side];
    }

    updateTeam(side, updates) {
        Object.assign(this.teams[side], updates);
        this.saveState();
    }

    saveState() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.HOME, JSON.stringify(this.teams.home));
            localStorage.setItem(CONFIG.STORAGE_KEYS.AWAY, JSON.stringify(this.teams.away));
        } catch (e) {
            console.warn('Failed to save state:', e);
        }
    }

    loadState() {
        try {
            const homeState = localStorage.getItem(CONFIG.STORAGE_KEYS.HOME);
            const awayState = localStorage.getItem(CONFIG.STORAGE_KEYS.AWAY);

            if (homeState) {
                Object.assign(this.teams.home, JSON.parse(homeState));
            }
            if (awayState) {
                Object.assign(this.teams.away, JSON.parse(awayState));
            }
        } catch (e) {
            console.warn('Failed to load state:', e);
        }
    }

    clearState() {
        this.teams.home = this.createTeamState();
        this.teams.away = this.createTeamState();
        try {
            localStorage.removeItem(CONFIG.STORAGE_KEYS.HOME);
            localStorage.removeItem(CONFIG.STORAGE_KEYS.AWAY);
        } catch (e) {
            console.warn('Failed to clear state:', e);
        }
    }
}

// Global state instance
const gameState = new GameState();

// Backward compatibility
window.homeTeam = gameState.teams.home;
window.awayTeam = gameState.teams.away;
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
    if (!Number.isFinite(n)) {
        inputEl.value = '0.00';
        return;
    }
    const clamped = Math.min(100, Math.max(0, n));
    if (clamped !== n) inputEl.value = String(clamped);
}

/**
 * Расчет сыгранности из матрицы данных
 */
function calculateSynergyFromMatrix(synergyData, lineupPlayerIds = null) {
    if (!synergyData || !synergyData.d_sygran || !synergyData.plr_sygran || !synergyData.plr_id) {
        console.log('[SynergyCalc] Некорректные данные сыгранности');
        return null;
    }

    const currentLineup = lineupPlayerIds || synergyData.orders[0] || [];

    if (currentLineup.length === 0) {
        console.log('[SynergyCalc] Пустой состав');
        return null;
    }

    let totalSynergyBonus = 0;
    let consideredMatches = 0;

    console.log('[SynergyCalc] Начинаем расчет для', currentLineup.length, 'игроков');
    console.log('[SynergyCalc] Всего матчей в данных:', synergyData.d_sygran.length);

    // Проходим по каждому матчу (дню)
    for (let matchIndex = 0; matchIndex < synergyData.d_sygran.length; matchIndex++) {
        const matchDay = synergyData.d_sygran[matchIndex];

        // Считаем сколько игроков из текущего состава играло в этом матче
        let playersInMatch = 0;

        currentLineup.forEach(playerId => {
            const playerIndex = synergyData.plr_id.indexOf(parseInt(playerId));
            if (playerIndex !== -1 && synergyData.plr_sygran[playerIndex] && synergyData.plr_sygran[playerIndex][matchIndex] === 1) {
                playersInMatch++;
            }
        });

        console.log(`[SynergyCalc] День ${matchDay}: ${playersInMatch} игроков играло`);

        // Если менее минимума игроков играло, прерываем анализ
        if (playersInMatch < SYNERGY_MATRIX_CONFIG.MIN_PLAYERS_FOR_SYNERGY) {
            console.log(`[SynergyCalc] День ${matchDay}: прерываем анализ (менее ${SYNERGY_MATRIX_CONFIG.MIN_PLAYERS_FOR_SYNERGY} игроков)`);
            break;
        }

        // Рассчитываем бонус по конфигурации
        let matchBonus = 0;
        if (playersInMatch >= 11) {
            // Для 11+ игроков используем бонус для 11
            matchBonus = SYNERGY_MATRIX_CONFIG.SYNERGY_BONUSES[11];
        } else if (SYNERGY_MATRIX_CONFIG.SYNERGY_BONUSES[playersInMatch] !== undefined) {
            // Для остальных используем точное значение
            matchBonus = SYNERGY_MATRIX_CONFIG.SYNERGY_BONUSES[playersInMatch];
        }

        console.log(`[SynergyCalc] День ${matchDay}: бонус ${matchBonus}%`);

        totalSynergyBonus += matchBonus;
        consideredMatches++;
    }

    console.log('[SynergyCalc] Итого:', totalSynergyBonus, '% за', consideredMatches, 'матчей');

    return {
        value: Math.round(totalSynergyBonus * 100) / 100,
        method: 'расчет из матрицы данных',
        details: {
            consideredMatches: consideredMatches,
            totalMatches: synergyData.d_sygran.length
        }
    };
}

/**
 * Пересчет сыгранности (основная функция для кнопки)
 */
function recalculateSynergy() {
    console.log('[Recalculate] Пересчет сыгранности');

    // Извлекаем состав из слотов калькулятора
    let currentLineup = [];

    // Пробуем извлечь из слотов команды гостей
    if (window.awayLineupBlock && window.awayLineupBlock.slots) {
        window.awayLineupBlock.slots.forEach(slot => {
            if (slot && slot.player && slot.player.id) {
                currentLineup.push(parseInt(slot.player.id));
            }
        });
    }

    // Если не нашли в гостях, пробуем хозяев
    if (currentLineup.length === 0 && window.homeLineupBlock && window.homeLineupBlock.slots) {
        window.homeLineupBlock.slots.forEach(slot => {
            if (slot && slot.player && slot.player.id) {
                currentLineup.push(parseInt(slot.player.id));
            }
        });
    }

    if (currentLineup.length === 0) {
        console.warn('Не найден состав для пересчета');
        return;
    }

    console.log('Найден состав:', currentLineup.length, 'игроков');

    // Используем сохраненные данные сыгранности
    const homeData = window.synergyDataCache?.home;
    const awayData = window.synergyDataCache?.away;

    let synergyData = null;
    let targetTeam = null;

    // Определяем, какие данные использовать
    if (awayData && awayData.plr_id) {
        const awayPlayerIds = awayData.plr_id.map(id => parseInt(id));
        const hasAwayPlayers = currentLineup.some(id => awayPlayerIds.includes(id));
        if (hasAwayPlayers) {
            synergyData = awayData;
            targetTeam = 'away';
        }
    }

    if (!synergyData && homeData && homeData.plr_id) {
        const homePlayerIds = homeData.plr_id.map(id => parseInt(id));
        const hasHomePlayers = currentLineup.some(id => homePlayerIds.includes(id));
        if (hasHomePlayers) {
            synergyData = homeData;
            targetTeam = 'home';
        }
    }

    if (!synergyData) {
        console.warn('Не найдены данные сыгранности для пересчета');
        return;
    }

    console.log('Используем данные команды', targetTeam);

    // Рассчитываем сыгранность
    const result = calculateSynergyFromMatrix(synergyData, currentLineup);

    if (result && result.value > 0) {
        const synergyPercent = Math.round(result.value);

        console.log('Пересчитанная сыгранность:', synergyPercent + '%');

        // Применяем к правильной команде
        if (targetTeam === 'home' && typeof setSynergyPercentHome === 'function') {
            setSynergyPercentHome(synergyPercent);
            console.log('Обновлена сыгранность команды хозяев:', synergyPercent + '%');
        } else if (targetTeam === 'away' && typeof setSynergyPercentAway === 'function') {
            setSynergyPercentAway(synergyPercent);
            console.log('Обновлена сыгранность команды гостей:', synergyPercent + '%');
        }
    }
}

/**
 * Добавление кнопки пересчета сыгранности
 */
function addRecalculateSynergyButton() {
    const existingButton = document.getElementById('recalculate-synergy-btn');
    if (existingButton) {
        return;
    }

    const synergyInputs = document.querySelectorAll('input[placeholder*="сыгранность"], input[placeholder*="Сыгранность"]');

    if (synergyInputs.length === 0) {
        return;
    }

    const button = document.createElement('button');
    button.id = 'recalculate-synergy-btn';
    button.textContent = 'Пересчитать сыгранность';
    button.style.cssText = `
        margin-left: 10px;
        padding: 5px 10px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
    `;

    button.onclick = recalculateSynergy;

    const firstInput = synergyInputs[0];
    if (firstInput.parentNode) {
        firstInput.parentNode.appendChild(button);
    }

    console.log('[UI] Кнопка пересчета сыгранности добавлена');
}

// === ФУНКЦИИ НАВИГАЦИИ ===

/**
 * Создание улучшенной навигации в заголовке "Сравнение соперников"
 */
function createHeaderNavigation() {
    // Ищем таблицу с "Сравнение соперников"
    const tables = document.querySelectorAll('table.nol');
    let comparisonTable = null;

    for (const table of tables) {
        const cell = table.querySelector('td');
        if (cell && cell.textContent.includes('Сравнение соперников')) {
            comparisonTable = table;
            break;
        }
    }

    if (!comparisonTable) {
        console.warn('[Navigation] Таблица "Сравнение соперников" не найдена');
        return;
    }

    const row = comparisonTable.querySelector('tr');
    if (!row) return;

    // Проверяем, есть ли уже навигация
    if (row.children.length > 1) {
        console.log('[Navigation] Навигация уже существует');
        return;
    }

    // Добавляем вторую колонку с навигацией
    const navCell = document.createElement('td');
    navCell.className = 'lh18 txtr';
    navCell.style.paddingRight = '10px';

    // Проверяем настройку автоматического открытия калькулятора
    const autoOpenCalculator = localStorage.getItem('vs_auto_open_calculator') === 'true';
    const manualCalculatorMode = localStorage.getItem('vs_calculator_mode') === 'true' ||
                               window.location.hash === '#calculator';

    const isCalculatorMode = autoOpenCalculator || manualCalculatorMode;

    if (isCalculatorMode) {
        // В режиме калькулятора показываем ссылку на превью + чекбокс
        navCell.innerHTML = `
            <div style="gap: 8px; justify-content: flex-end; white-space: nowrap; text-align: right;">
                <label style="display: inline-flex; align-items: center; gap: 3px; font-size: 10px; cursor: pointer; color: #666; margin-right: 8px;">
                    <input type="checkbox" id="auto-calculator-checkbox" ${autoOpenCalculator ? 'checked' : ''}
                           style="margin: 0; cursor: pointer; transform: scale(0.9);">
                    <span>Всегда калькулятор</span>
                </label>
                <a href="#" class="mnu" id="nav-preview-link" style="font-weight: bold; color: #0066cc;">← Превью матча</a>
            </div>
        `;

        // Добавляем обработчик для возврата к превью
        setTimeout(() => {
            const previewLink = document.getElementById('nav-preview-link');
            const autoCheckbox = document.getElementById('auto-calculator-checkbox');

            if (previewLink) {
                previewLink.onclick = (e) => {
                    e.preventDefault();
                    console.log('Клик по ссылке "← Превью матча"');
                    console.log('Удаляем localStorage vs_calculator_mode');
                    localStorage.removeItem('vs_calculator_mode');
                    console.log('Очищаем hжash');
                    window.location.hash = '';
                    console.log('Перенаправляем на превью');
                    // Прямое перенаправление на превью без hash
                    window.location.href = window.location.href.split('#')[0];
                };
            }

            if (autoCheckbox) {
                autoCheckbox.onchange = (e) => {
                    const isChecked = e.target.checked;
                    console.log('Изменение чекбокса "Всегда калькулятор":', isChecked);
                    if (isChecked) {
                        localStorage.setItem('vs_auto_open_calculator', 'true');
                    } else {
                        localStorage.removeItem('vs_auto_open_calculator');
                    }
                };
            }
        }, 100);
    } else {
        // В режиме превью показываем ссылку на калькулятор + чекбокс
        navCell.innerHTML = `
            <div style="gap: 6px; justify-content: flex-end; text-align: right;">
                <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer; color: #666; margin-right: 6px;">
                    <input type="checkbox" id="auto-calculator-checkbox" ${autoOpenCalculator ? 'checked' : ''}
                           style="margin: 0; cursor: pointer; transform: scale(0.9);">
                    <span style="user-select: none;">Всегда калькулятор</span>
                </label>
                <a href="#" class="mnu" id="nav-calculator-link" style="font-weight: bold;">Калькулятор силы</a>
            </div>
        `;

        // Добавляем обработчик для перехода к калькулятору
        setTimeout(() => {
            const calculatorLink = document.getElementById('nav-calculator-link');
            const autoCheckbox = document.getElementById('auto-calculator-checkbox');

            if (calculatorLink) {
                calculatorLink.onclick = (e) => {
                    e.preventDefault();
                    console.log('Клик по ссылке "Калькулятор силы"');
                    console.log('Устанавливаем localStorage vs_calculator_mode = true');
                    localStorage.setItem('vs_calculator_mode', 'true');
                    console.log('Устеанавливаем hash = #calculator');
                    window.location.hash = '#calculator';
                    console.log('Перезагружаем страницу');
                    window.location.reload();
                };
            }

            if (autoCheckbox) {
                autoCheckbox.onchange = (e) => {
                    const isChecked = e.target.checked;
                    console.log('Изменение чекбокса "Всегда калькулятор":', isChecked);
                    if (isChecked) {
                        localStorage.setItem('vs_auto_open_calculator', 'true');
                        // Если включили автоматическое открытие, сразу переходим к калькулятору
                        localStorage.setItem('vs_calculator_mode', 'true');
                        window.location.hash = '#calculator';
                        window.location.reload();
                    } else {
                        localStorage.removeItem('vs_auto_open_calculator');
                    }
                };
            }
        }, 100);
    }

    row.appendChild(navCell);
    console.log('[Navigation] Навигация добавлена в заголовок');
}

// === КОНЕЦ ФУНКЦИЙ НАВИГАЦИИ ===

// === ФУНКЦИИ ОБНОВЛЕНИЯ БОНУСОВ ЛИДЕРОВ ===

/**
 * Обновление отображения бонусов лидеров в UI
 */
function updateLeadershipBonusesDisplay(sideLabel, leadershipBonusByPlayerId, slotEntries) {
    const ui = sideLabel === 'home' ? window.leadershipHomeUI : window.leadershipAwayUI;
    if (!ui) return;

    // Группируем игроков по линиям и считаем бонусы
    const bonusesByLine = {
        DEF: { totalBonus: 0, playerCount: 0 },
        MID: { totalBonus: 0, playerCount: 0 },
        ATT: { totalBonus: 0, playerCount: 0 }
    };

    slotEntries.forEach(entry => {
        if (!entry || !entry.player) return;

        const line = getLineByMatchPos(entry.matchPos);
        if (!line) return;

        const playerId = String(entry.player.id);
        const bonus = leadershipBonusByPlayerId.get(playerId) || 0;

        if (bonus > 0) {
            bonusesByLine[line].totalBonus += bonus;
            bonusesByLine[line].playerCount++;
        }
    });

    // Обновляем отображение для каждой линии
    updateLineDisplay(ui.defBonus, ui.defValue, bonusesByLine.DEF);
    updateLineDisplay(ui.midBonus, ui.midValue, bonusesByLine.MID);
    updateLineDisplay(ui.attBonus, ui.attValue, bonusesByLine.ATT);
}

function updateLineDisplay(bonusElement, valueElement, lineData) {
    if (lineData.totalBonus > 0) {
        bonusElement.textContent = '+';
        bonusElement.style.color = 'rgb(0, 102, 0)';
        valueElement.textContent = Math.round(lineData.totalBonus * 100) / 100;
    } else {
        bonusElement.textContent = '-';
        bonusElement.style.color = 'rgb(102, 102, 102)';
        valueElement.textContent = '0';
    }
}

/**
 * Обновление отображения командной игры в UI
 */
function updateTeamworkDisplay(sideLabel, totalTeamIBonus) {
    const elementId = sideLabel === 'home' ? 'vs_teamwork_home' : 'vs_teamwork_away';
    const element = document.getElementById(elementId);

    if (element) {
        const value = Math.round(totalTeamIBonus * 100) / 100;
        element.textContent = value.toFixed(2);

        if (value > 0) {
            element.style.color = 'rgb(0, 102, 0)';
        } else if (value < 0) {
            element.style.color = 'rgb(204, 0, 0)';
        } else {
            element.style.color = 'rgb(68, 68, 68)';
        }
    }
}

/**
 * Обновление отображения атмосферы в UI
 */
function updateAtmosphereDisplay(sideLabel, atmosphereValue, totalAtmosphereBonus) {
    const elementId = sideLabel === 'home' ? 'vs_atmosphere_home' : 'vs_atmosphere_away';
    const element = document.getElementById(elementId);

    if (element) {
        // Показываем значение атмосферы в процентах и общий бонус
        const atmospherePercent = Math.round(atmosphereValue * 100);
        const totalBonus = Math.round(totalAtmosphereBonus * 100) / 100;

        element.textContent = `${atmospherePercent}% (${totalBonus > 0 ? '+' : ''}${totalBonus.toFixed(2)})`;

        if (atmosphereValue > 0) {
            element.style.color = 'rgb(0, 102, 0)';
        } else if (atmosphereValue < 0) {
            element.style.color = 'rgb(204, 0, 0)';
        } else {
            element.style.color = 'rgb(68, 68, 68)';
        }
    }
}

// === КОНЕЦ ФУНКЦИЙ ЛИДЕРСТВА ===

// === ИНТЕГРАЦИЯ ГЕНЕРАТОРА МАТРИЦ СЫГРАННОСТИ ===

// Кэш для текущего игрового дня
let cachedGameDay = null;
let gameDayCacheTime = null;
const GAME_DAY_CACHE_DURATION = 5 * 60 * 1000; // 5 минут

// Конфигурация генератора матриц
const SYNERGY_MATRIX_CONFIG = {
    MAX_AGE_MINUTES: 30,
    MAX_MATCHES: 25,
    FORCE_REGENERATE_ON_DAY_CHANGE: true,
    EXCLUDE_FRIENDLY_MATCHES: true,

    // Бонусы сыгранности по количеству игроков (официальные правила)
    SYNERGY_BONUSES: {
        4: 0.00,  // 4 игрока = 0% (без бонуса)
        5: 0.00,  // 5 игроков = 0% (без бонуса)
        6: 0.10,  // 6 игроков = +0.10%
        7: 0.25,  // 7 игроков = +0.25%
        8: 0.50,  // 8 игроков = +0.50%
        9: 0.75,  // 9 игроков = +0.75%
        10: 1.00, // 10 игроков = +1.00%
        11: 1.25  // 11+ игроков = +1.25%
    },

    MIN_PLAYERS_FOR_SYNERGY: 4 // Минимум игроков для учета матча
};

/**
 * Получение текущего игрового дня из transferlist.php
 */
async function getCurrentGameDayForMatrix() {
    try {
        const now = Date.now();
        if (cachedGameDay && gameDayCacheTime && (now - gameDayCacheTime) < GAME_DAY_CACHE_DURATION) {
            return cachedGameDay;
        }

        const url = `${SITE_CONFIG.BASE_URL}/transferlist.php`;

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Cache-Control': 'no-cache'
                },
                onload: function(response) {
                    if (response.status !== 200) {
                        resolve(cachedGameDay);
                        return;
                    }

                    try {
                        const htmlText = response.responseText;
                        const dayLinkRegex = /transferlist\.php\?status=2&day=(\d+)/i;
                        const match = htmlText.match(dayLinkRegex);

                        if (match && match[1]) {
                            const gameDay = parseInt(match[1]);
                            if (!isNaN(gameDay)) {
                                cachedGameDay = gameDay;
                                gameDayCacheTime = Date.now();
                                resolve(gameDay);
                                return;
                            }
                        }

                        resolve(cachedGameDay);
                    } catch (parseError) {
                        resolve(cachedGameDay);
                    }
                },
                onerror: function() {
                    resolve(cachedGameDay);
                }
            });
        });
    } catch (error) {
        return cachedGameDay;
    }
}

/**
 * Генерация хэша для списка ID игроков
 */
function generatePlayerIdsHashForMatrix(playerIds) {
    try {
        if (!Array.isArray(playerIds) || playerIds.length === 0) {
            return '';
        }
        const sorted = [...playerIds].map(id => parseInt(id)).filter(id => !isNaN(id)).sort((a, b) => a - b);
        const hashString = sorted.join(',');
        return btoa(hashString).slice(0, 16);
    } catch (error) {
        return '';
    }
}

/**
 * Загрузка истории матчей игрока для матрицы
 */
async function loadPlayerMatchHistoryForMatrix(playerId) {
    try {
        const url = `${SITE_CONFIG.BASE_URL}/player.php?num=${playerId}`;

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Cache-Control': 'no-cache'
                },
                onload: function(response) {
                    if (response.status !== 200) {
                        resolve(null);
                        return;
                    }

                    try {
                        const htmlText = response.responseText;
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(htmlText, 'text/html');

                        const matches = [];
                        const tables = doc.querySelectorAll('table');
                        const excludeFriendly = SYNERGY_MATRIX_CONFIG.EXCLUDE_FRIENDLY_MATCHES;

                        tables.forEach(table => {
                            const rows = table.querySelectorAll('tr');
                            rows.forEach(row => {
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 16) { // Убеждаемся что есть все колонки включая минуты
                                    const tournamentCell = cells[4]?.textContent?.trim(); // Колонка с турниром
                                    const scoreCell = cells[3]; // Колонка со счетом и ссылкой
                                    const minutesCell = cells[cells.length - 1]?.textContent?.trim(); // Последняя колонка - минуты

                                    if (tournamentCell && scoreCell && minutesCell) {
                                        // Извлекаем день из ссылки на матч
                                        const matchLink = scoreCell.querySelector('a[href*="day="]');
                                        if (matchLink) {
                                            const href = matchLink.getAttribute('href');
                                            const dayMatch = href.match(/day=(\d+)/);
                                            if (dayMatch) {
                                                const day = parseInt(dayMatch[1]);
                                                if (day && !isNaN(day)) {
                                                    const isFriendly = tournamentCell.toLowerCase().includes('товарищеский') ||
                                                                     tournamentCell.toLowerCase().includes('friendly');

                                                    // Проверяем, играл ли игрок (минуты > 0)
                                                    const minutes = parseInt(minutesCell);
                                                    const played = !isNaN(minutes) && minutes > 0;

                                                    if (!excludeFriendly || !isFriendly) {
                                                        matches.push({
                                                            day: day,
                                                            tournament: tournamentCell,
                                                            played: played,
                                                            isFriendly: isFriendly,
                                                            minutes: played ? minutes : 0
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            });
                        });

                        const uniqueMatches = matches.filter((match, index, self) =>
                            index === self.findIndex(m => m.day === match.day && m.tournament === match.tournament)
                        ).sort((a, b) => b.day - a.day);

                        resolve(uniqueMatches);
                    } catch (parseError) {
                        resolve(null);
                    }
                },
                onerror: function() {
                    resolve(null);
                }
            });
        });
    } catch (error) {
        return null;
    }
}

/**
 * Построение матрицы сыгранности из данных игроков
 */
async function buildSynergyMatrixFromPlayersForCalc(playerIds, maxMatches = SYNERGY_MATRIX_CONFIG.MAX_MATCHES) {
    console.log('[SynergyMatrix] Построение матрицы для', playerIds.length, 'игроков');

    try {
        const startTime = Date.now();
        const currentGameDay = await getCurrentGameDayForMatrix();
        const playerIdsHash = generatePlayerIdsHashForMatrix(playerIds);

        // Загружаем историю матчей для всех игроков
        const playerHistories = {};
        const loadPromises = playerIds.map(async (playerId) => {
            const history = await loadPlayerMatchHistoryForMatrix(playerId);
            if (history && history.length > 0) {
                playerHistories[playerId] = history;
            }
        });

        await Promise.all(loadPromises);

        // Собираем все уникальные дни матчей
        const allMatchDays = new Set();
        Object.values(playerHistories).forEach(history => {
            history.forEach(match => {
                allMatchDays.add(match.day);
            });
        });

        // Сортируем дни по убыванию (от новых к старым)
        const sortedDays = Array.from(allMatchDays).sort((a, b) => b - a);
        const recentDays = sortedDays.slice(0, maxMatches);

        // Строим матрицу участия
        const participationMatrix = [];
        playerIds.forEach(playerId => {
            const playerRow = [];
            recentDays.forEach(day => {
                const playerHistory = playerHistories[playerId] || [];
                const matchOnDay = playerHistory.find(match => match.day === day);
                const playedInMatch = matchOnDay && matchOnDay.played; // Учитываем поле played
                playerRow.push(playedInMatch ? 1 : 0);
            });
            participationMatrix.push(playerRow);
        });

        const generationTime = Date.now();
        const synergyData = {
            d_sygran: recentDays,
            plr_sygran: participationMatrix,
            plr_id: playerIds.map(id => parseInt(id)),
            orders: [playerIds.slice(0, 11)],

            // Метаданные актуальности
            generatedAt: generationTime,
            currentGameDay: currentGameDay,
            playerIdsHash: playerIdsHash,
            isValid: true,
            ageMinutes: 0,
            source: 'построено из данных игроков',

            // Статистика генерации
            stats: {
                playersWithHistory: Object.keys(playerHistories).length,
                totalPlayers: playerIds.length,
                generationTimeMs: generationTime - startTime,
                actualMatches: recentDays.length
            }
        };

        console.log('[SynergyMatrix] Матрица построена:', synergyData.d_sygran.length, 'матчей,', synergyData.stats.playersWithHistory, 'игроков с историей');
        return synergyData;

    } catch (error) {
        console.error('[SynergyMatrix] Ошибка построения матрицы:', error);
        return null;
    }
}

/**
 * Извлечение ID игроков из состава
 */
function extractPlayerIdsFromLineup(lineup) {
    const playerIds = [];
    if (lineup && Array.isArray(lineup)) {
        lineup.forEach(slot => {
            if (slot && typeof slot.getValue === 'function') {
                const playerId = slot.getValue();
                if (playerId && playerId !== '') {
                    playerIds.push(parseInt(playerId));
                }
            }
        });
    }
    return playerIds.filter(id => !isNaN(id));
}

/**
 * Автоматический расчет и обновление сыгранности для команды
 */
async function updateTeamSynergy(teamType, lineup) {
    try {
        const playerIds = extractPlayerIdsFromLineup(lineup);

        if (playerIds.length < 4) {
            console.log(`[AutoSynergy] Недостаточно игроков для расчета сыгранности ${teamType}:`, playerIds.length);
            return;
        }

        console.log(`[AutoSynergy] Расчет сыгранности для ${teamType}, игроков:`, playerIds.length);
        console.log(`[AutoSynergy] ID игроков:`, playerIds);

        // Строим матрицу сыгранности
        const synergyMatrix = await buildSynergyMatrixFromPlayersForCalc(playerIds);

        if (!synergyMatrix) {
            console.warn(`[AutoSynergy] Не удалось построить матрицу для ${teamType}`);
            return;
        }

        console.log(`[AutoSynergy] Матрица построена для ${teamType}:`, synergyMatrix.d_sygran.length, 'матчей');

        // Рассчитываем сыгранность (используем существующую функцию)
        const synergyResult = calculateSynergyFromMatrix(synergyMatrix, playerIds);

        if (!synergyResult) {
            console.warn(`[AutoSynergy] Не удалось рассчитать сыгранность для ${teamType}`);
            return;
        }

        console.log(`[AutoSynergy] Результат расчета для ${teamType}:`, synergyResult);

        // Обновляем соответствующее поле
        const synergyValue = Math.min(100, Math.max(0, synergyResult.value));

        if (teamType === 'home') {
            setSynergyPercentHome(synergyValue);
            console.log(`[AutoSynergy] Сыгранность хозяев обновлена: ${synergyValue}%`);
        } else if (teamType === 'away') {
            setSynergyPercentAway(synergyValue);
            console.log(`[AutoSynergy] Сыгранность гостей обновлена: ${synergyValue}%`);
        }

        // Сохраняем состояние
        if (typeof saveAllStates === 'function') {
            saveAllStates();
        }

        // Пересчитываем силу команд
        if (typeof window.__vs_recalculateStrength === 'function') {
            window.__vs_recalculateStrength();
        }

    } catch (error) {
        console.error(`[AutoSynergy] Ошибка расчета сыгранности для ${teamType}:`, error);
    }
}

// === КОНЕЦ ИНТЕГРАЦИИ ГЕНЕРАТОРА МАТРИЦ ===


class StateManager {
    static saveAllStates() {
        // Use the centralized game state
        gameState.saveState();

        // Also update UI-specific values
        if (gameState.ui.homeLineupBlock && gameState.ui.awayLineupBlock) {
            StateManager.syncUIToState();
        }
    }

    static syncUIToState() {
        const homeTeam = gameState.getTeam('home');
        const awayTeam = gameState.getTeam('away');

        // Sync synergy values
        homeTeam.synergy = getSynergyPercentHome();
        awayTeam.synergy = getSynergyPercentAway();

        // Sync lineup data
        if (gameState.ui.homeLineupBlock) {
            homeTeam.lineup = gameState.ui.homeLineupBlock.lineup.map(slot => slot.getValue());
            homeTeam.miniPositions = gameState.ui.homeLineupBlock.lineup.map(slot =>
                slot.miniPositionSelect ? slot.miniPositionSelect.getValue() : null
            );
        }

        if (gameState.ui.awayLineupBlock) {
            awayTeam.lineup = gameState.ui.awayLineupBlock.lineup.map(slot => slot.getValue());
            awayTeam.miniPositions = gameState.ui.awayLineupBlock.lineup.map(slot =>
                slot.miniPositionSelect ? slot.miniPositionSelect.getValue() : null
            );
        }
    }

    static getCurrentTeamState(styleSel, formationSel, captainSel, lineupBlock) {
        return {
            style: styleSel.value,
            formation: formationSel.value,
            captain: captainSel.value,
            lineup: lineupBlock.lineup.map(slot => slot.getValue()),
            miniPositions: lineupBlock.lineup.map(slot =>
                slot.miniPositionSelect ? slot.miniPositionSelect.getValue() : null
            ),
            physicalForms: lineupBlock.lineup.map(slot => slot.physicalFormValue)
        };
    }
}

// Legacy function for backward compatibility
function saveAllStates() {
    StateManager.saveAllStates();
}

// Missing functions that are called in the code
function loadTeamState(storageKey) {
    try {
        const saved = localStorage.getItem(storageKey);
        return saved ? JSON.parse(saved) : null;
    } catch (e) {
        console.warn('Failed to load team state:', e);
        return null;
    }
}

function clearTeamState(storageKey) {
    try {
        localStorage.removeItem(storageKey);
    } catch (e) {
        console.warn('Failed to clear team state:', e);
    }
}


function getShirtsCacheKey(teamId) {
    return `vs_shirts_${teamId}`;
}

function getCachedShirts(teamId) {
    try {
        const cached = localStorage.getItem(getShirtsCacheKey(teamId));
        if (cached) {
            const data = JSON.parse(cached);
            // Кэш действителен 7 дней
            if (Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
                return data.shirts;
            }
        }
    } catch (e) {
        console.error('[Shirts] Cache read error', e);
    }
    return null;
}

function setCachedShirts(teamId, shirts) {
    try {
        localStorage.setItem(getShirtsCacheKey(teamId), JSON.stringify({
            shirts,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.error('[Shirts] Cache write error', e);
    }
}

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
    select.innerHTML =
        `<option value="normal">обычный</option><option value="super">супер</option><option value="rest">отдых</option>`;
    const initial = (team && team.morale) ? String(team.morale) : 'normal';
    select.value = initial;

    function setTeamMorale(val) {
        if (team === window.homeTeam) {
            window.homeTeam.morale = val;
        } else if (team === window.awayTeam) {
            window.awayTeam.morale = val;
        }
        team.morale = val;
    }
    select.addEventListener('change', () => {
        const val = select.value;
        setTeamMorale(val);
        try {
            if (typeof saveAllStates === 'function') saveAllStates();
        } catch (e) { }
        if (typeof onChange === 'function') onChange();
        if (typeof window.__vs_recalcAll === 'function') window.__vs_recalcAll();
    });
    return select;
}

// --- UI UTILS ---

// Кэш стилей игроков
const PLAYER_STYLE_CACHE_KEY = 'vs_player_styles_cache';
const CACHE_VERSION = '1.0';
const DEFAULT_CACHE_SETTINGS = {
    maxAge: 24 * 60 * 60 * 1000,    // 24 часа
    maxPlayersPerTeam: 50,          // Максимум игроков на команду
    maxTeams: 10,                   // Максимум команд в кэше
    autoCleanup: true               // Автоматическая очистка
};

function getPlayerStyleCache() {
    try {
        const cached = vsStorage.get(PLAYER_STYLE_CACHE_KEY);
        if (!cached) {
            return createEmptyCache();
        }
        
        const cache = JSON.parse(cached);
        
        // Проверяем версию и мигрируем если нужно
        if (!cache.version || cache.version !== CACHE_VERSION) {
            console.log('[CACHE] Migrating cache from version', cache.version || 'legacy', 'to', CACHE_VERSION);
            return migrateCache(cache);
        }
        
        // Автоматическая очистка при загрузке
        if (cache.settings?.autoCleanup) {
            return performAutoCleanup(cache);
        }
        
        return cache;
    } catch (e) {
        console.warn('[CACHE] Failed to load player styles cache, creating new', e);
        return createEmptyCache();
    }
}

function createEmptyCache() {
    return {
        version: CACHE_VERSION,
        lastCleanup: Date.now(),
        teams: {},
        settings: { ...DEFAULT_CACHE_SETTINGS }
    };
}

function migrateCache(oldCache) {
    console.log('[CACHE] Migrating legacy cache format');
    
    const newCache = createEmptyCache();
    
    // Если это старый формат (плоский объект с playerId: style)
    if (oldCache && typeof oldCache === 'object' && !oldCache.version) {
        // Помещаем все данные в команду "unknown"
        newCache.teams.unknown = {
            players: {},
            metadata: {
                created: Date.now(),
                migrated: true
            }
        };
        
        let migratedCount = 0;
        for (const [playerId, style] of Object.entries(oldCache)) {
            if (typeof style === 'string' && /^\d+$/.test(playerId)) {
                newCache.teams.unknown.players[playerId] = {
                    style: style,
                    timestamp: Date.now(),
                    lastUsed: Date.now()
                };
                migratedCount++;
            }
        }
        
        console.log(`[CACHE] Migrated ${migratedCount} player styles`);
    }
    
    savePlayerStyleCache(newCache);
    return newCache;
}

function performAutoCleanup(cache) {
    const now = Date.now();
    const maxAge = cache.settings?.maxAge || DEFAULT_CACHE_SETTINGS.maxAge;
    
    // Очистка только если прошло больше часа с последней очистки
    if (now - cache.lastCleanup < 60 * 60 * 1000) {
        return cache;
    }
    
    console.log('[CACHE_CLEANUP] Performing automatic cleanup');
    
    let totalCleaned = 0;
    let teamsToRemove = [];
    
    // Очищаем устаревшие записи в каждой команде
    for (const [teamId, teamData] of Object.entries(cache.teams)) {
        let cleanedInTeam = 0;
        const playersToRemove = [];
        
        for (const [playerId, playerData] of Object.entries(teamData.players)) {
            if (now - playerData.timestamp > maxAge) {
                playersToRemove.push(playerId);
                cleanedInTeam++;
            }
        }
        
        // Удаляем устаревших игроков
        playersToRemove.forEach(playerId => {
            delete teamData.players[playerId];
        });
        
        // Если команда пустая, помечаем для удаления
        if (Object.keys(teamData.players).length === 0) {
            teamsToRemove.push(teamId);
        }
        
        totalCleaned += cleanedInTeam;
    }
    
    // Удаляем пустые команды
    teamsToRemove.forEach(teamId => {
        delete cache.teams[teamId];
    });
    
    cache.lastCleanup = now;
    
    if (totalCleaned > 0 || teamsToRemove.length > 0) {
        console.log(`[CACHE_CLEANUP] Cleaned ${totalCleaned} expired players, ${teamsToRemove.length} empty teams`);
        savePlayerStyleCache(cache);
    }
    
    return cache;
}

function savePlayerStyleCache(cache) {
    try {
        vsStorage.set(PLAYER_STYLE_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('[CACHE] Failed to save player styles cache', e);
    }
}

function getCurrentTeamId() {
    // Пытаемся определить ID текущей команды из URL или других источников
    const urlMatch = window.location.href.match(/team[_=](\d+)/i);
    if (urlMatch) return urlMatch[1];
    
    // Пытаемся найти в данных команд
    if (window.homeTeamId) return String(window.homeTeamId);
    if (window.awayTeamId) return String(window.awayTeamId);
    
    // Fallback - используем "current"
    return 'current';
}

function getPlayerStyleFromCache(playerId) {
    const cache = getPlayerStyleCache();
    const teamId = getCurrentTeamId();
    
    // Ищем в текущей команде
    if (cache.teams[teamId]?.players[playerId]) {
        const playerData = cache.teams[teamId].players[playerId];
        
        // Обновляем время последнего использования
        playerData.lastUsed = Date.now();
        savePlayerStyleCache(cache);
        
        console.log(`[CACHE] Hit: игрок ${playerId} → ${playerData.style} (команда ${teamId})`);
        return playerData.style;
    }
    
    // Ищем в других командах (для совместимости)
    for (const [otherTeamId, teamData] of Object.entries(cache.teams)) {
        if (teamData.players[playerId]) {
            const playerData = teamData.players[playerId];
            console.log(`[CACHE] Cross-team hit: игрок ${playerId} → ${playerData.style} (команда ${otherTeamId})`);
            return playerData.style;
        }
    }
    
    console.log(`[CACHE] Miss: игрок ${playerId} не найден в кэше`);
    return null; // Возвращаем null вместо 'norm' чтобы использовать hidden_style
}

function setPlayerStyleToCache(playerId, styleValue) {
    if (!validateStyleValue(styleValue) || !validatePlayerId(playerId)) {
        console.warn(`[CACHE] Invalid data: playerId=${playerId}, style=${styleValue}`);
        return;
    }
    
    const cache = getPlayerStyleCache();
    const teamId = getCurrentTeamId();
    const now = Date.now();
    
    // Создаем команду если не существует
    if (!cache.teams[teamId]) {
        cache.teams[teamId] = {
            players: {},
            metadata: {
                created: now,
                teamId: teamId
            }
        };
        console.log(`[CACHE] Created team cache: ${teamId}`);
    }
    
    // Сохраняем данные игрока
    cache.teams[teamId].players[playerId] = {
        style: styleValue,
        timestamp: now,
        lastUsed: now
    };
    
    // Проверяем лимиты и очищаем если нужно
    enforceTeamLimits(cache, teamId);
    enforceGlobalLimits(cache);
    
    savePlayerStyleCache(cache);
    console.log(`[CACHE] Saved: игрок ${playerId} → ${styleValue} (команда ${teamId})`);
}

function validateStyleValue(style) {
    return style && (CONFIG.STYLES.VALUES.hasOwnProperty(style) || style === 'norm');
}

function validatePlayerId(playerId) {
    return playerId && /^\d+$/.test(String(playerId));
}

function enforceTeamLimits(cache, teamId) {
    const teamData = cache.teams[teamId];
    const maxPlayers = cache.settings?.maxPlayersPerTeam || DEFAULT_CACHE_SETTINGS.maxPlayersPerTeam;
    const players = Object.entries(teamData.players);
    
    if (players.length > maxPlayers) {
        // Сортируем по времени последнего использования (старые первыми)
        players.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
        
        const toRemove = players.length - maxPlayers;
        for (let i = 0; i < toRemove; i++) {
            const [playerId] = players[i];
            delete teamData.players[playerId];
        }
        
        console.log(`[CACHE_CLEANUP] Removed ${toRemove} old players from team ${teamId} (limit: ${maxPlayers})`);
    }
}

function enforceGlobalLimits(cache) {
    const maxTeams = cache.settings?.maxTeams || DEFAULT_CACHE_SETTINGS.maxTeams;
    const teams = Object.entries(cache.teams);
    
    if (teams.length > maxTeams) {
        // Сортируем команды по времени создания (старые первыми)
        teams.sort((a, b) => (a[1].metadata?.created || 0) - (b[1].metadata?.created || 0));
        
        const toRemove = teams.length - maxTeams;
        for (let i = 0; i < toRemove; i++) {
            const [teamId] = teams[i];
            delete cache.teams[teamId];
        }
        
        console.log(`[CACHE_CLEANUP] Removed ${toRemove} old teams (limit: ${maxTeams})`);
    }
}

// ===== ФУНКЦИИ УПРАВЛЕНИЯ КЭШЕМ СТИЛЕЙ =====

/**
 * Очищает кэш стилей для конкретной команды
 * @param {string} teamId - ID команды (опционально, по умолчанию текущая)
 */
function clearTeamStyleCache(teamId = null) {
    const cache = getPlayerStyleCache();
    const targetTeamId = teamId || getCurrentTeamId();
    
    if (cache.teams[targetTeamId]) {
        const playersCount = Object.keys(cache.teams[targetTeamId].players).length;
        delete cache.teams[targetTeamId];
        savePlayerStyleCache(cache);
        
        console.log(`[CACHE_CLEANUP] Cleared team ${targetTeamId}: ${playersCount} players`);
        return playersCount;
    }
    
    console.log(`[CACHE_CLEANUP] Team ${targetTeamId} not found in cache`);
    return 0;
}

/**
 * Полная очистка кэша стилей
 */
function clearAllStyleCache() {
    const cache = getPlayerStyleCache();
    const stats = getStyleCacheStats();
    
    const newCache = createEmptyCache();
    savePlayerStyleCache(newCache);
    
    console.log(`[CACHE_CLEANUP] Cleared all cache: ${stats.totalPlayers} players, ${stats.totalTeams} teams`);
    return stats;
}

/**
 * Очищает устаревшие записи из кэша
 * @param {number} maxAge - Максимальный возраст в миллисекундах
 */
function cleanExpiredStyles(maxAge = null) {
    const cache = getPlayerStyleCache();
    const ageLimit = maxAge || cache.settings?.maxAge || DEFAULT_CACHE_SETTINGS.maxAge;
    const now = Date.now();
    
    let totalCleaned = 0;
    let teamsToRemove = [];
    
    for (const [teamId, teamData] of Object.entries(cache.teams)) {
        let cleanedInTeam = 0;
        const playersToRemove = [];
        
        for (const [playerId, playerData] of Object.entries(teamData.players)) {
            if (now - playerData.timestamp > ageLimit) {
                playersToRemove.push(playerId);
                cleanedInTeam++;
            }
        }
        
        playersToRemove.forEach(playerId => {
            delete teamData.players[playerId];
        });
        
        if (Object.keys(teamData.players).length === 0) {
            teamsToRemove.push(teamId);
        }
        
        totalCleaned += cleanedInTeam;
    }
    
    teamsToRemove.forEach(teamId => {
        delete cache.teams[teamId];
    });
    
    cache.lastCleanup = now;
    savePlayerStyleCache(cache);
    
    console.log(`[CACHE_CLEANUP] Cleaned ${totalCleaned} expired players (>${Math.round(ageLimit/1000/60/60)}h), ${teamsToRemove.length} empty teams`);
    return { playersRemoved: totalCleaned, teamsRemoved: teamsToRemove.length };
}

/**
 * Умная очистка кэша (комбинация всех стратегий)
 */
function smartCleanupStyleCache() {
    console.log('[CACHE_CLEANUP] Starting smart cleanup');
    
    const beforeStats = getStyleCacheStats();
    
    // 1. Очищаем устаревшие записи
    const expiredResult = cleanExpiredStyles();
    
    // 2. Применяем лимиты
    const cache = getPlayerStyleCache();
    enforceGlobalLimits(cache);
    
    // 3. Очищаем команды без метаданных (возможно поврежденные)
    let corruptedTeams = 0;
    for (const [teamId, teamData] of Object.entries(cache.teams)) {
        if (!teamData.metadata || !teamData.players) {
            delete cache.teams[teamId];
            corruptedTeams++;
        }
    }
    
    if (corruptedTeams > 0) {
        console.log(`[CACHE_CLEANUP] Removed ${corruptedTeams} corrupted teams`);
        savePlayerStyleCache(cache);
    }
    
    const afterStats = getStyleCacheStats();
    
    console.log(`[CACHE_CLEANUP] Smart cleanup completed:`, {
        before: beforeStats,
        after: afterStats,
        removed: {
            players: beforeStats.totalPlayers - afterStats.totalPlayers,
            teams: beforeStats.totalTeams - afterStats.totalTeams
        }
    });
    
    return {
        before: beforeStats,
        after: afterStats,
        expiredResult,
        corruptedTeams
    };
}

/**
 * Возвращает статистику кэша стилей
 */
function getStyleCacheStats() {
    const cache = getPlayerStyleCache();
    const now = Date.now();
    
    let totalPlayers = 0;
    let totalTeams = Object.keys(cache.teams).length;
    let oldestEntry = now;
    let newestEntry = 0;
    let styleDistribution = {};
    let teamSizes = {};
    
    for (const [teamId, teamData] of Object.entries(cache.teams)) {
        const playersInTeam = Object.keys(teamData.players).length;
        teamSizes[teamId] = playersInTeam;
        totalPlayers += playersInTeam;
        
        for (const [playerId, playerData] of Object.entries(teamData.players)) {
            // Статистика по времени
            if (playerData.timestamp < oldestEntry) {
                oldestEntry = playerData.timestamp;
            }
            if (playerData.timestamp > newestEntry) {
                newestEntry = playerData.timestamp;
            }
            
            // Статистика по стилям
            const style = playerData.style;
            styleDistribution[style] = (styleDistribution[style] || 0) + 1;
        }
    }
    
    const cacheSize = JSON.stringify(cache).length;
    const maxAge = cache.settings?.maxAge || DEFAULT_CACHE_SETTINGS.maxAge;
    const expiredCount = Object.values(cache.teams).reduce((count, teamData) => {
        return count + Object.values(teamData.players).filter(p => now - p.timestamp > maxAge).length;
    }, 0);
    
    return {
        version: cache.version,
        totalPlayers,
        totalTeams,
        cacheSize,
        cacheSizeKB: Math.round(cacheSize / 1024 * 100) / 100,
        oldestEntry: oldestEntry === now ? null : new Date(oldestEntry),
        newestEntry: newestEntry === 0 ? null : new Date(newestEntry),
        lastCleanup: new Date(cache.lastCleanup),
        expiredCount,
        styleDistribution,
        teamSizes,
        settings: cache.settings
    };
}

// Глобальные функции для консоли
window.clearTeamStyleCache = clearTeamStyleCache;
window.clearAllStyleCache = clearAllStyleCache;
window.cleanExpiredStyles = cleanExpiredStyles;
window.smartCleanupStyleCache = smartCleanupStyleCache;
window.getStyleCacheStats = getStyleCacheStats;

// Альтернативное определение для отладки
(function() {
    'use strict';
    
    // Проверяем, что функции определены локально
    if (typeof clearAllStyleCache !== 'function') {
        console.error('❌ clearAllStyleCache не определена локально');
        return;
    }
    
    // Принудительно устанавливаем в window
    window.clearAllStyleCache = clearAllStyleCache;
    window.getStyleCacheStats = getStyleCacheStats;
    
    console.log('🔧 Функции кэша принудительно установлены в window');
})();

// Диагностическая функция для проверки загрузки
window.testCacheFunctions = function() {
    console.log('🔍 Проверка функций кэша:');
    console.log('clearTeamStyleCache:', typeof window.clearTeamStyleCache);
    console.log('clearAllStyleCache:', typeof window.clearAllStyleCache);
    console.log('cleanExpiredStyles:', typeof window.cleanExpiredStyles);
    console.log('smartCleanupStyleCache:', typeof window.smartCleanupStyleCache);
    console.log('getStyleCacheStats:', typeof window.getStyleCacheStats);
    
    try {
        const stats = getStyleCacheStats();
        console.log('✅ Функции кэша работают корректно');
        console.log('📊 Статистика кэша:', stats);
        return true;
    } catch (e) {
        console.error('❌ Ошибка при вызове функций кэша:', e);
        return false;
    }
};

// Простая функция для быстрой проверки
window.cacheTest = function() {
    console.log('🧪 Cache Test v0.941');
    console.log('Functions available:', {
        clearAllStyleCache: typeof clearAllStyleCache,
        getStyleCacheStats: typeof getStyleCacheStats
    });
    
    if (typeof clearAllStyleCache === 'function') {
        console.log('✅ clearAllStyleCache доступна');
        return true;
    } else {
        console.log('❌ clearAllStyleCache недоступна');
        return false;
    }
};

// Глобальная функция для расчета силы игрока с учетом всех модификаторов
function calculatePlayerStrengthGlobal(player, matchPosition, physicalFormId) {
    const baseStr = Number(player.baseStrength) || 0;

    // Определяем форму игрока
    let actualFormId = physicalFormId;
    if (!actualFormId || actualFormId === 'FRIENDLY_100') {
        const tournamentType = document.getElementById('vs_tournament_type')?.value || 'typeC';
        actualFormId = getPhysicalFormIdFromData(player.form, player.form_mod, tournamentType);
    }

    // Применяем все модификаторы
    const physicalFormModifier = getPhysicalFormModifier(actualFormId);
    const realityModifier = getRealityBonus(player.real_status, player.real_sign);
    const positionModifier = getPositionModifier(player.mainPos, player.secondPos, matchPosition);

    // Для товарищеских матчей усталость всегда 25%
    let fatigueModifier;
    const tournamentType = document.getElementById('vs_tournament_type')?.value || 'typeC';
    if (tournamentType === 'friendly') {
        fatigueModifier = 1 - (25 / 100); // 0.75
    } else {
        fatigueModifier = getFatigueBonus(player.fatigue);
    }

    const calculatedStr = baseStr * physicalFormModifier * fatigueModifier * realityModifier * positionModifier;

    return Math.round(calculatedStr);
}


class UIFactory {
    static createSelect(options, selectedValue = null) {
        const select = document.createElement('select');
        select.style.borderRadius = '0';
        select.style.color = 'rgb(68, 68, 68)';
        select.style.padding = '2px 4px';
        select.style.lineHeight = '16px';
        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            select.appendChild(opt);
        });
        if (selectedValue) {
            select.value = selectedValue;
        }
        return select;
    }

    static createStyleSelector(selectedValue = 'norm') {
        const options = CONFIG.STYLES.ORDER.map(id => ({
            value: id,
            label: CONFIG.STYLES.LABELS[id]
        }));
        return this.createSelect(options, selectedValue);
    }

    static createWeatherSelector(selectedValue = null) {
        const options = CONFIG.WEATHER.OPTIONS.map(weather => ({
            value: weather,
            label: weather
        }));
        return this.createSelect(options, selectedValue);
    }

    static createTemperatureSelector(weather, selectedValue = null) {
        const select = document.createElement('select');
        select.style.borderRadius = '0';
        select.style.color = 'rgb(68, 68, 68)';
        select.style.padding = '2px 4px';
        select.style.lineHeight = '16px';
        const [max, min] = CONFIG.WEATHER.TEMP_MAP[weather] || [25, 5];

        for (let t = max; t >= min; t--) {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t + '°';
            select.appendChild(opt);
        }

        if (selectedValue && selectedValue >= min && selectedValue <= max) {
            select.value = selectedValue;
        }

        return select;
    }
}

// Legacy function for backward compatibility
function createStyleSelector() {
    return UIFactory.createStyleSelector();
}

function createFormationSelector(formationManager) {
    const select = document.createElement('select');
    select.style.borderRadius = '0';
    select.style.color = 'rgb(68, 68, 68)';
    select.style.padding = '2px 4px';
    select.style.lineHeight = '16px';
    formationManager.getAllFormations().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    return select;
}

function createDummySelect() {
    const select = document.createElement('select');
    select.innerHTML = '<option value="">—</option>';
    select.style.borderRadius = '0';
    select.style.color = 'rgb(68, 68, 68)';
    select.style.padding = '2px 4px';
    select.style.lineHeight = '16px';
    return select;
}

// --- CSS ---
(function addCSS() {
    const css = `
    .morale-select, .rough-select, .defence-type-select {
      min-width: 110px; height: 20px; font-size: 11px; border: 1px solid rgb(170, 170, 170);
      border-radius: 0; padding: 2px 4px; margin-left: 4px; transition: background 0.2s;
      color: rgb(68, 68, 68); line-height: 16px;
    }
    #vsol-calculator-ui { width: 800px; margin: 20px auto; padding: 0; background: rgb(249, 249, 249); border: 1px solid rgb(204, 204, 204); border-radius: 6px; box-sizing: border-box; overflow: visible; }
    #vsol-calculator-ui > h3 { padding-top: 15px; padding-bottom: 10px; margin: 0; }
    #vsol-calculator-ui > div:first-child { padding-top: 15px; }
    #vsol-calculator-ui #vsol-synergy-ui {
      align-items: center; margin-top: 8px; padding-bottom: 15px;
    }
    #vsol-calculator-ui .vs-synergy-block { display: inline-flex; align-items: center; gap: 6px; }
    #vsol-calculator-ui .vs-synergy-input {
      width: 80px; height: 20px; line-height: 18px; font-size: 11px; padding: 1px 4px; box-sizing: border-box;
    }

    /* Стили для отображения бонусов лидеров */
    #vsol-calculator-ui .vs-leadership-block {
      display: inline-flex; align-items: center; gap: 6px; margin-left: 20px;
    }
    #vsol-calculator-ui .vs-leadership-label {
      font-size: 11px; color: rgb(51, 51, 51); font-weight: normal;
    }
    #vsol-calculator-ui .vs-leadership-bonuses {
      font-size: 11px; font-weight: bold; color: rgb(0, 102, 0);
    }
    #vsol-calculator-ui .vs-leadership-line {
      margin: 0 2px;
    }
    #vsol-calculator-ui .vs-leadership-value {
      color: rgb(0, 0, 128);
    }

    #vs-home-settings-table, #vs-away-settings-table {
        width: 100%;
        border-collapse: collapse;
        margin: 0 auto;
    }
    #vs-home-settings-table td, #vs-away-settings-table td {
        padding: 1px 4px;
        vertical-align: middle;
        text-align: center;
    }
    #vs-home-settings-table .lh22, #vs-away-settings-table .lh22 {
        line-height: 22px;
        min-height: 22px;
        font-size: 11px;
        font-weight: bold;
    }
    #vs-home-settings-table tr, #vs-away-settings-table tr {
        height: 22px;
    }
    /* Стили для селекторов в тактических настройках */
    #vs-home-settings-table select, #vs-away-settings-table select {
        width: 120px;
        height: 19px;
        font-size: 11px;
        border: 1px solid #aaa;
        border-radius: 0;
        padding: 1px 4px;
        box-sizing: border-box;
        background: transparent;
        color: #444;
        line-height: 16px;
        margin: 1px auto;
        display: block;
    }
    /* Стили для заголовка тактических настроек */
    .lh18 {
        line-height: 18px;
        min-height: 18px;
    }
    .txtw {
        color: white;
    }

    #vsol-calculator-ui .orders-table { width: 350px; border-collapse: separate; table-layout: fixed; margin: 0 auto; }
    #vsol-calculator-ui .orders-table tr { height: 22px; }
    #vsol-calculator-ui .orders-table td { vertical-align: middle; padding: 0; }

    #vsol-calculator-ui .order { width: 35px; text-align: center; font-weight: bold; }
    #vsol-calculator-ui .txt { text-align: center; }
    #vsol-calculator-ui .mini-pos-cell { width: 35px; }
    #vsol-calculator-ui td.player-cell { width: 215px; }
    #vsol-calculator-ui td.style-cell { width: 40px; }
    #vsol-calculator-ui td.form-cell { width: 60px; }

    #vsol-calculator-ui .select2 { display: inline-block; position: relative; vertical-align: top; }
    #vsol-calculator-ui .select2-container--orders { width: 215px; }

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
      z-index: 10000;
    }
    #vsol-calculator-ui .orders-option { padding: 2px 4px; height: 20px; line-height: 16px; font-size: 11px; text-align: left; cursor: pointer; color: rgb(68, 68, 68); }
    #vsol-calculator-ui .orders-option:hover { background: rgb(240, 240, 240); }
    #vsol-calculator-ui .orders-option.disabled { color: rgb(187, 187, 187); cursor: default; }
    #vsol-calculator-ui .orders-placeholder { color: rgb(163,163,163); }

    #vsol-calculator-ui .mini-pos-cell .select2-selection { height: 20px; min-height: 20px; line-height: 18px; }

    #vsol-calculator-ui .custom-style-select { position: relative; width: 100%; user-select: none; display: block; }
    #vsol-calculator-ui .custom-style-select .selected {
      border: 1px solid #aaa; padding: 2px 4px 2px 4px; background: #fff;
      display: flex; align-items: center; justify-content: center; gap: 2px; position: relative;
      height: 20px; min-height: 20px; line-height: 16px; font-size: 11px; box-sizing: border-box; cursor: pointer;
    }
    #vsol-calculator-ui .custom-style-select .selected::after {
      content: '';
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid #555;
    }
    #vsol-calculator-ui .custom-style-select .icon { width: 14px; height: 14px; }
    #vsol-calculator-ui .custom-style-select .options {
      display: none; position: absolute; left: 0; width: 100%; background: #fff; border: 1px solid #aaa; border-top: none;
      z-index: 9999; margin: 0; padding: 0; list-style: none;
    }
    #vsol-calculator-ui .custom-style-select.open .options { display: block; }
    #vsol-calculator-ui .custom-style-select .options li {
      height: 20px; line-height: 16px; font-size: 11px; display: flex; align-items: center; justify-content: center; gap: 2px; cursor: pointer; padding: 2px 4px;
    }
    #vsol-calculator-ui .custom-style-select .options li:hover { background: #f0f0f0; }

    #vsol-calculator-ui .physical-form-select { position: relative; width: 100%; user-select: none; display: block; }
    #vsol-calculator-ui .physical-form-select .selected {
      border: 1px solid #aaa; padding: 2px 20px 2px 4px; background: #fff;
      display: flex; align-items: center; justify-content: center; gap: 2px; position: relative;
      height: 20px; min-height: 20px; line-height: 16px; font-size: 11px; box-sizing: border-box; cursor: pointer;
    }
    #vsol-calculator-ui .physical-form-select .selected::after {
      content: '';
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid #555;
    }
    #vsol-calculator-ui .physical-form-select .options {
      display: none; position: absolute; left: 0; width: 100%; background: #fff; border: 1px solid #aaa; border-top: none;
      z-index: 9999; margin: 0; padding: 0; list-style: none;
    }
    #vsol-calculator-ui .physical-form-select.open .options { display: block; }
    #vsol-calculator-ui .physical-form-select .options li {
      height: 20px; line-height: 16px; font-size: 11px; display: flex; align-items: center; gap: 2px; cursor: pointer; padding: 2px 4px;
    }
    #vsol-calculator-ui .physical-form-select .options li:hover { background: #f0f0f0; }

    #vsol-calculator-ui .vs-captain-row { margin-top: 4px; }
    #vsol-calculator-ui .vs-captain-table { width: 350px; border-collapse: separate; table-layout: fixed; margin: 0 auto; }
    #vsol-calculator-ui .vs-captain-cell-icon { width: 35px; text-align: center; vertical-align: middle; padding: 0; }
    #vsol-calculator-ui .vs-captain-cell-select { vertical-align: middle; padding: 0; }
    #vsol-calculator-ui .vs-captain-select {
      width: 100%; height: 20px; min-height: 20px; line-height: 16px; font-size: 11px;
      border: 1px solid #aaa; padding: 2px 4px; box-sizing: border-box;
      background: #fff; cursor: pointer; border-radius: 0; text-align: left;
      color: #444;
    }
    #vsol-calculator-ui .vs-captain-select option.captain-placeholder {
      color: rgb(163,163,163);
    }

    .shirts-container {
      pointer-events: none;
    }

    .shirts-loading {
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    @keyframes fadeInScale {
      0% { 
        opacity: 0; 
        transform: scale(0.8); 
      }
      100% { 
        opacity: 1; 
        transform: scale(1); 
      }
    }
  `;
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
})();

// --- PLAYER SELECTORS ---
const PLAYER_STYLES = [{
    value: 'sp',
    icon: 'styles/o1.gif'
},
{
    value: 'brazil',
    icon: 'styles/o3.gif'
},
{
    value: 'tiki',
    icon: 'styles/o4.gif'
},
{
    value: 'bb',
    icon: 'styles/o2.gif'
},
{
    value: 'kat',
    icon: 'styles/o5.gif'
},
{
    value: 'brit',
    icon: 'styles/o6.gif'
},
{
    value: 'norm',
    icon: 'styles/o8.gif'
}
];

function createCustomStyleSelect(onChange) {
    console.log(`[SELECT] Создание селектора стилей`);
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-style-select';
    const selectedDiv = document.createElement('div');
    selectedDiv.className = 'selected';
    const selectedIcon = document.createElement('img');
    selectedIcon.className = 'icon';
    selectedIcon.style.display = 'none';
    selectedDiv.appendChild(selectedIcon);
    wrapper.appendChild(selectedDiv);
    const optionsUl = document.createElement('ul');
    optionsUl.className = 'options custom-style-options';
    optionsUl.id = `custom-style-options-${Math.random().toString(36).substr(2, 9)}`;
    let currentValue = 'norm';
    PLAYER_STYLES.forEach(style => {
        const li = document.createElement('li');
        li.dataset.value = style.value;
        if (style.icon) {
            const img = document.createElement('img');
            img.src = style.icon;
            img.className = 'icon';
            li.appendChild(img);
        } else {
            // Для norm без иконки - просто пустое место
            const placeholder = document.createElement('div');
            placeholder.style.width = '14px';
            placeholder.style.height = '14px';
            li.appendChild(placeholder);
        }
        li.addEventListener('click', () => {
            console.log(`[SELECT] Клик по стилю: ${currentValue} → ${li.dataset.value}`);
            currentValue = li.dataset.value;
            const styleObj = PLAYER_STYLES.find(s => s.value === currentValue) || PLAYER_STYLES[0];
            if (styleObj.icon) {
                selectedIcon.src = styleObj.icon;
                selectedIcon.style.display = '';
            } else {
                selectedIcon.style.display = 'none';
            }
            wrapper.classList.remove('open');
            optionsUl.style.display = 'none';
            console.log(`[SELECT] Вызываем onChange для стиля: ${currentValue}`);
            if (onChange) onChange(currentValue);
        });
        optionsUl.appendChild(li);
    });
    wrapper.appendChild(optionsUl);
    const styleObj = PLAYER_STYLES.find(s => s.value === currentValue) || PLAYER_STYLES[0];
    if (styleObj.icon) {
        selectedIcon.src = styleObj.icon;
        selectedIcon.style.display = '';
    }
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
        console.log(`[SELECT] setValue вызван: ${currentValue} → ${val}`);
        currentValue = val;
        const styleObj = PLAYER_STYLES.find(s => s.value === currentValue) || PLAYER_STYLES[0];
        if (styleObj.icon) {
            selectedIcon.src = styleObj.icon;
            selectedIcon.style.display = '';
            console.log(`[SELECT] Установлена иконка для стиля: ${currentValue}`);
        } else {
            selectedIcon.style.display = 'none';
            console.log(`[SELECT] Скрыта иконка для стиля: ${currentValue}`);
        }
    };
    return wrapper;
}

function createPhysicalFormSelect(onChange, dayType = 'all') {
    const wrapper = document.createElement('div');
    wrapper.className = 'physical-form-select';

    const selectedDiv = document.createElement('div');
    selectedDiv.className = 'selected';
    selectedDiv.title = 'Физическая форма';

    const selectedIcon = document.createElement('div');
    selectedIcon.className = 'form-icon';
    selectedIcon.style.cssText = 'width: 18px; height: 19px; background: url(form/sprite-1.4.gif) no-repeat; display: inline-block; vertical-align: middle;';

    const selectedLabel = document.createElement('span');
    selectedLabel.textContent = '100%';
    selectedLabel.style.marginLeft = '4px';

    selectedDiv.appendChild(selectedIcon);
    selectedDiv.appendChild(selectedLabel);
    wrapper.appendChild(selectedDiv);

    const optionsUl = document.createElement('ul');
    optionsUl.className = 'options physical-form-options';
    optionsUl.id = `physical-form-options-${Math.random().toString(36).substr(2, 9)}`;

    let currentValue = 'FRIENDLY_100'; // По умолчанию 100%
    let availableForms = getPhysicalFormsByDayType(dayType);

    function renderOptions() {
        optionsUl.innerHTML = '';
        availableForms.forEach(form => {
            const li = document.createElement('li');
            li.dataset.value = form.id;
            li.title = form.title; // Подсказка при наведении

            const icon = document.createElement('div');
            icon.className = 'form-icon';
            icon.style.cssText = `width: 18px; height: 19px; background: url(form/sprite-1.4.gif) no-repeat ${form.bgPosition}; display: inline-block; vertical-align: middle;`;

            const label = document.createElement('span');
            label.textContent = form.percent + '%';

            li.appendChild(icon);
            li.appendChild(label);

            li.addEventListener('click', () => {
                currentValue = form.id;
                selectedLabel.textContent = form.percent + '%';
                selectedIcon.style.backgroundPosition = form.bgPosition;
                selectedDiv.title = form.title;
                wrapper.classList.remove('open');
                optionsUl.style.display = 'none';
                if (onChange) onChange(currentValue);
            });

            optionsUl.appendChild(li);
        });
    }

    renderOptions();
    wrapper.appendChild(optionsUl);

    // Установка начального значения
    const initialForm = CONFIG.PHYSICAL_FORM.FORMS[currentValue];
    if (initialForm) {
        selectedLabel.textContent = initialForm.percent + '%';
        selectedIcon.style.backgroundPosition = initialForm.bgPosition;
        selectedDiv.title = initialForm.title;
    }

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
        currentValue = val || 'FRIENDLY_100';
        const form = CONFIG.PHYSICAL_FORM.FORMS[currentValue];
        if (form) {
            selectedLabel.textContent = form.percent + '%';
            selectedIcon.style.backgroundPosition = form.bgPosition;
            selectedDiv.title = form.title;
        }
    };

    wrapper.setDayType = (newDayType) => {
        dayType = newDayType;
        availableForms = getPhysicalFormsByDayType(dayType);
        renderOptions();
        // Проверяем, доступна ли текущая форма
        if (!availableForms.some(f => f.id === currentValue)) {
            currentValue = availableForms[0]?.id || 'FRIENDLY_100';
            wrapper.setValue(currentValue);
            if (onChange) onChange(currentValue);
        }
    };

    wrapper.setTournamentType = (tournamentType) => {
        return wrapper.setDayType(tournamentType);
    };

    return wrapper;
}

function createMiniPositionSelect({
    options,
    bg = '#FFFFBB',
    widthPx = 40,
    onChange
}) {
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
        toggle();
        e.stopPropagation();
    });
    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) {
            open = false;
            dropdownWrapper.style.display = 'none';
        }
    });
    let localOptions = Array.isArray(options) ? options.slice() : [];
    let current = localOptions[0] ? localOptions[0] : {
        value: '',
        label: ''
    };
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
        setValue: (v, {
            allowTemp = true
        } = {}) => {
            const f = localOptions.find(o => o.value === v);
            if (f) {
                current = f;
            } else if (allowTemp) {
                current = {
                    value: v,
                    label: String(v)
                };
            } else {
                return;
            }
            rendered.textContent = current.label || '';
        },
        setBg: (color) => {
            sel.style.backgroundColor = color;
        },
        setOptions: (opts) => {
            localOptions = Array.isArray(opts) ? opts.slice() : [];
            renderOptions(localOptions);
            const still = localOptions.find(o => o.value === current.value);
            if (!still) {
                if (localOptions[0]) {
                    current = localOptions[0];
                    rendered.textContent = current.label || '';
                } else {
                    current = {
                        value: '',
                        label: ''
                    };
                    rendered.textContent = '';
                }
            } else {
                current = still;
                rendered.textContent = still.label || '';
            }
        }
    };
}

function createOrdersSelect({
    placeholder,
    options,
    widthPx = 215,
    onChange
}) {
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
        if (dropdownWrapper.style.display === 'block') close();
        else open();
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
        setOptions(newOptions) {
            renderOptions(newOptions);
        },
        setPlaceholder(text) {
            rendered.textContent = text;
            rendered.classList.add('orders-placeholder');
        },
        getValue() {
            return currentValue;
        },
        setValue(value, label) {
            currentValue = String(value || '');
            rendered.textContent = label || '';
            if (!label) rendered.classList.add('orders-placeholder');
            else rendered.classList.remove('orders-placeholder');
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
    LD: 'выберите ЛЗ:',
    LB: 'выберите ЛАЗ:',
    CD: 'выберите ЦЗ:',
    SW: 'выберите ПЦЗ:',
    RD: 'выберите ПЗ:',
    RB: 'выберите ПАЗ:',
    LM: 'выберите ЛПЗ:',
    LW: 'выберите ЛВ:',
    CM: 'выберите ЦПЗ:',
    DM: 'выберите ОП:',
    AM: 'выберите АПЗ:',
    FR: 'выберите СХ:',
    RM: 'выберите ППЗ:',
    RW: 'выберите ПВ:',
    CF: 'выберите ЦН:',
    ST: 'выберите ВН:',
    LF: 'выберите ЛН:',
    RF: 'выберите ПН:'
};

function getAllowedMiniOptions({
    formationName,
    positions,
    rowIndex
}) {
    const pos = positions[rowIndex];
    if (!pos) return [];

    console.log(`[getAllowedMiniOptions] === НАЧАЛО ПРОВЕРКИ ===`);
    console.log(`[getAllowedMiniOptions] Позиция: ${pos} (индекс ${rowIndex})`);
    console.log(`[getAllowedMiniOptions] Формация: ${formationName}`);
    console.log(`[getAllowedMiniOptions] Все позиции:`, positions);

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

    console.log(`[getAllowedMiniOptions] hasLW: ${hasLW}, hasRW: ${hasRW}`);
    console.log(`[getAllowedMiniOptions] Подсчет позиций:`, counts);

    // КРИТИЧЕСКАЯ ПРОВЕРКА: Убеждаемся что LW/RW определяются правильно
    if (hasLW || hasRW) {
        console.log(`[getAllowedMiniOptions] ВНИМАНИЕ: Обнаружены крайние нападающие!`);
        console.log(`[getAllowedMiniOptions] LW позиции:`, positions.map((pos, idx) => pos === 'LW' ? idx : null).filter(x => x !== null));
        console.log(`[getAllowedMiniOptions] RW позиции:`, positions.map((pos, idx) => pos === 'RW' ? idx : null).filter(x => x !== null));
    }
    const add = (arr, v, extra = {}) => {
        if (!arr.some(o => o.value === v)) {
            arr.push({
                value: v,
                label: v,
                ...extra
            });
        }
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

    // === ОБЩИЕ ОПРЕДЕЛЕНИЯ ДЛЯ ВСЕХ CASE'ОВ ===
    
    // Количество позиций
    const amCount = counts['AM'] || 0;
    const frCount = counts['FR'] || 0;
    
    // Определение максимального индекса среди всех полузащитников (для CM/DM → AM)
    const midfielderIndices = [];
    positions.forEach((pos, idx) => {
        if (['CM', 'DM', 'AM', 'FR'].includes(pos)) {
            midfielderIndices.push(idx);
        }
    });
    const maxMidfielderIndex = midfielderIndices.length ? Math.max(...midfielderIndices) : null;
    const isMaxMidfielder = rowIndex === maxMidfielderIndex;
    
    // Определение центральных позиций (для FR логики)
    const centralIndices = [];
    positions.forEach((pos, idx) => {
        if (['CM', 'DM', 'AM', 'FR'].includes(pos)) {
            centralIndices.push(idx);
        }
    });
    const minCentralIndex = centralIndices.length ? Math.min(...centralIndices) : null;
    const maxCentralIndex = centralIndices.length ? Math.max(...centralIndices) : null;
    const totalCentralCount = centralIndices.length;
    
    // Общие условия для превращения в AM
    const amAbsent = amCount < 1;
    const noWingers = !hasLW && !hasRW;
    const canBecomeAM = !is424 && amAbsent && noWingers && isMaxMidfielder;
    
    // Общие условия для превращения в FR
    const centralFieldPlayers = cmCount + dmCount + amCount + frCount;
    const canBecomeFR = frCount < 1 && centralFieldPlayers < 4;
    
    console.log(`[getAllowedMiniOptions] === ОБЩИЕ ОПРЕДЕЛЕНИЯ ===`);
    console.log(`[getAllowedMiniOptions] Полузащитники:`, {
        midfielderIndices, maxMidfielderIndex, isMaxMidfielder,
        amCount, frCount, canBecomeAM, canBecomeFR
    });
    console.log(`[getAllowedMiniOptions] Центральные позиции:`, {
        centralIndices, minCentralIndex, maxCentralIndex, totalCentralCount
    });

    const options = [];
    add(options, pos);
    switch (pos) {
        case 'LD':
            add(options, 'LB');
            break;
        case 'LB':
            add(options, 'LD');
            break;
        case 'RD':
            add(options, 'RB');
            break;
        case 'RB':
            add(options, 'RD');
            break;
        case 'CD': {
            if (cdCount > 1 && rowIndex === cdMin) add(options, 'SW');
            break;
        }
        case 'SW': {
            add(options, 'CD');
            break;
        }
        case 'LM': {
            console.log(`[getAllowedMiniOptions] === LM ЛОГИКА ===`);
            if (is424) add(options, 'CM');
            
            // ИСПРАВЛЕНИЕ: Запрет LM → LW для схемы 4-2-4
            if (!is424) {
                const amAbsent = (counts['AM'] || 0) < 1;
                console.log(`[getAllowedMiniOptions] LM может стать LW? amAbsent: ${amAbsent}, hasLW: ${hasLW}, is424: ${is424}`);
                if (amAbsent && !hasLW) {
                    console.log(`[getAllowedMiniOptions] Добавляем LW для LM`);
                    add(options, 'LW');
                } else {
                    console.log(`[getAllowedMiniOptions] НЕ добавляем LW для LM`);
                }
            } else {
                console.log(`[getAllowedMiniOptions] LM → LW заблокировано для схемы 4-2-4`);
            }
            break;
        }
        case 'RM': {
            console.log(`[getAllowedMiniOptions] === RM ЛОГИКА ===`);
            if (is424) add(options, 'CM');
            
            // ИСПРАВЛЕНИЕ: Запрет RM → RW для схемы 4-2-4
            if (!is424) {
                const amAbsent = (counts['AM'] || 0) < 1;
                console.log(`[getAllowedMiniOptions] RM может стать RW? amAbsent: ${amAbsent}, hasRW: ${hasRW}, is424: ${is424}`);
                if (amAbsent && !hasRW) {
                    console.log(`[getAllowedMiniOptions] Добавляем RW для RM`);
                    add(options, 'RW');
                } else {
                    console.log(`[getAllowedMiniOptions] НЕ добавляем RW для RM`);
                }
            } else {
                console.log(`[getAllowedMiniOptions] RM → RW заблокировано для схемы 4-2-4`);
            }
            break;
        }
        case 'CM': {
            console.log(`[getAllowedMiniOptions] === CM ЛОГИКА ===`);
            console.log(`[getAllowedMiniOptions] is424: ${is424}`);

            if (!is424) {
                let cmToDMAllowed = false;
                if ((dmCount < 2) && cmCount > 2 && (rowIndex === cmMin1 || rowIndex === cmMin2)) cmToDMAllowed = true;
                // ОГРАНИЧЕНИЕ 1: Если CM = 2, то CM с максимальным индексом НЕ может быть DM
                if ((dmCount < 2) && cmCount === 2 && rowIndex !== cmMax) cmToDMAllowed = true;
                if ((dmCount < 2) && cmCount === 1) cmToDMAllowed = true;

                // ПРАВИЛО 3: Если DM есть на поле, а сумма всех ЦПЗ >= 2, то CM с минимальным индексом может быть DM

                if (dmCount > 0 && totalCentralCount >= 2 && rowIndex === cmMin1) {
                    cmToDMAllowed = true;
                    console.log(`[PositionLogic] CM с мин индексом разрешен: DM=${dmCount}, totalCentralCount=${totalCentralCount}`);
                }

                // ОГРАНИЧЕНИЕ 2: Если DM есть на поле, а сумма всех ЦПЗ < 2, то CM с макс индексом не может быть DM
                if (dmCount > 0 && totalCentralCount < 2 && rowIndex === cmMax) {
                    cmToDMAllowed = false;
                    console.log(`[PositionLogic] CM с макс индексом заблокирован: DM=${dmCount}, totalCentralCount=${totalCentralCount}`);
                }

                // ИСПРАВЛЕНИЕ 3: Универсальное ограничение для DM при 2 полузащитниках
                if (totalCentralCount === 2 && isMaxMidfielder) {
                    cmToDMAllowed = false;
                    console.log(`[PositionLogic] CM заблокирован: максимальный полузащитник при 2 полузащитниках не может стать DM`);
                }

                console.log(`[PositionLogic] CM→DM проверка для позиции ${rowIndex}:`, {
                    dmCount, cmCount, amCount, totalCentralCount, cmMin1, cmMax,
                    isMinCM: rowIndex === cmMin1, isMaxCM: rowIndex === cmMax,
                    canBecomeDM: cmToDMAllowed
                });

                if (cmToDMAllowed) add(options, 'DM');

                // НОВОЕ ПРАВИЛО: В схеме с 3 полузащитниками, если максимальный полузащитник - FR,
                // то CM с максимальным индексом среди CM может стать DM
                if (totalCentralCount === 3) {
                    const maxMidfielderPos = positions[maxMidfielderIndex];
                    if (maxMidfielderPos === 'FR' && rowIndex === cmMax) {
                        console.log(`[PositionLogic] Специальное правило: 3 полузащитника, максимальный FR, CM с макс индексом может стать DM`);
                        add(options, 'DM');
                    }
                }

                // ИСПРАВЛЕНИЕ 2: Унифицированная проверка максимального полузащитника
                // Используем общее определение isMaxMidfielder вместо локального
                console.log(`[PositionLogic] CM→AM проверка для позиции ${rowIndex}:`, {
                    hasLW, hasRW, amAbsent, isMaxMidfielder, maxMidfielderIndex, midfielderIndices,
                    canBecomeAM: !hasLW && !hasRW && amAbsent && isMaxMidfielder
                });

                // AM доступен только если НЕТ LW И НЕТ RW И это максимальный полузащитник
                if (!hasLW && !hasRW && amAbsent && isMaxMidfielder) {
                    console.log(`[PositionLogic] Добавляем AM для CM позиции ${rowIndex} (максимальный полузащитник)`);
                    add(options, 'AM');
                } else {
                    console.log(`[PositionLogic] НЕ добавляем AM для CM позиции ${rowIndex}`);
                }

                // НОВАЯ ЛОГИКА ДЛЯ FR: CM может стать FR
                const centralFieldPlayers = cmCount + dmCount + amCount + frCount;
                
                console.log(`[PositionLogic] CM→FR проверка для позиции ${rowIndex}:`, {
                    frCount, centralFieldPlayers,
                    canBecomeFR: frCount < 1 && centralFieldPlayers < 4
                });

                if (frCount < 1 && centralFieldPlayers < 4) {
                    console.log(`[PositionLogic] Добавляем FR для CM позиции ${rowIndex}`);
                    add(options, 'FR');
                }
            } else {
                if (rowIndex === cmMin1) add(options, 'LM');
                if (rowIndex === cmMax) add(options, 'RM');
                const frCount = counts['FR'] || 0;
                if (frCount < 1 && rowIndex === cmMax) add(options, 'FR');
            }
            break;
        }
        case 'DM': {
            console.log(`[getAllowedMiniOptions] === DM ЛОГИКА ===`);
            const locked = is361 && dmCount === 1;
            console.log(`[getAllowedMiniOptions] locked (is361 && dmCount === 1): ${locked}`);

            if (!locked) {
                add(options, 'CM');

                console.log(`[PositionLogic] DM→AM проверка для позиции ${rowIndex}:`, {
                    hasLW, hasRW, amCount, isMaxMidfielder, maxMidfielderIndex, midfielderIndices,
                    canBecomeAM
                });

                if (canBecomeAM) {
                    console.log(`[PositionLogic] Добавляем AM для DM позиции ${rowIndex} (максимальный полузащитник)`);
                    add(options, 'AM');
                } else {
                    console.log(`[PositionLogic] НЕ добавляем AM для DM позиции ${rowIndex}`);
                }

                console.log(`[PositionLogic] DM→FR проверка для позиции ${rowIndex}:`, {
                    frCount, centralFieldPlayers, canBecomeFR
                });

                if (canBecomeFR) {
                    console.log(`[PositionLogic] Добавляем FR для DM позиции ${rowIndex}`);
                    add(options, 'FR');
                }
            }
            break;
        }
        case 'AM':
            console.log(`[getAllowedMiniOptions] === AM ЛОГИКА ===`);
            add(options, 'CM');

            // ИСПРАВЛЕНИЕ 1: AM → DM для случая с 1 полузащитником
            console.log(`[PositionLogic] AM→DM проверка для позиции ${rowIndex}:`, {
                totalCentralCount,
                canBecomeDM: totalCentralCount === 1
            });

            if (totalCentralCount === 1) {
                console.log(`[PositionLogic] Добавляем DM для AM позиции ${rowIndex} (единственный полузащитник)`);
                add(options, 'DM');
            }

            console.log(`[PositionLogic] AM→FR проверка для позиции ${rowIndex}:`, {
                frCount, centralFieldPlayers, canBecomeFR
            });

            if (canBecomeFR) {
                console.log(`[PositionLogic] Добавляем FR для AM позиции ${rowIndex}`);
                add(options, 'FR');
            }
            break;
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

            // Добавляем ST как опцию с учетом позиции (кроме 4-2-4)
            if (!is424) {
                // Проверяем, является ли текущая CF средней среди всех нападающих
                const attackerPositions = [];
                positions.forEach((pos, idx) => {
                    if (['CF', 'LF', 'RF', 'ST'].includes(pos)) {
                        attackerPositions.push(idx);
                    }
                });

                // Всегда добавляем ST как опцию (ограничения для ST обрабатываются в case 'ST')
                add(options, 'ST');
            }

            break;
        }
        case 'ST':
            if (!is424) {
                // Подсчитываем количество нападающих
                const attackerPositions = [];
                positions.forEach((pos, idx) => {
                    if (['CF', 'LF', 'RF', 'ST'].includes(pos)) {
                        attackerPositions.push(idx);
                    }
                });

                // Если 3 нападающих, проверяем, является ли текущая позиция средней
                if (attackerPositions.length === 3) {
                    const sortedAttackers = [...attackerPositions].sort((a, b) => a - b);
                    const middleAttackerIndex = sortedAttackers[1]; // Средний слот

                    // Если это средний слот, доступен только CF
                    if (rowIndex === middleAttackerIndex) {
                        add(options, 'CF');
                    } else {
                        // Крайние слоты могут стать CF, LF, RF
                        add(options, 'CF');
                        add(options, 'LF');
                        add(options, 'RF');
                    }
                } else {
                    // Если не 3 нападающих, все опции доступны
                    add(options, 'CF');
                    add(options, 'LF');
                    add(options, 'RF');
                }
            } else {
                add(options, 'CF');
            }
            break;
        case 'LF': {
            if (!is424) {
                add(options, 'CF');
                add(options, 'ST');
            }
            break;
        }
        case 'RF': {
            if (!is424) {
                add(options, 'CF');
                add(options, 'ST');
            }
            break;
        }
        case 'RW':
            console.log(`[getAllowedMiniOptions] === RW ЛОГИКА ===`);
            console.log(`[getAllowedMiniOptions] RW может стать только RM`);
            add(options, 'RM');
            break;
        case 'LW':
            console.log(`[getAllowedMiniOptions] === LW ЛОГИКА ===`);
            console.log(`[getAllowedMiniOptions] LW может стать только LM`);
            add(options, 'LM');
            break;
        case 'FR': {
            console.log(`[getAllowedMiniOptions] === FR ЛОГИКА ===`);
            
            // 1. FR всегда может стать CM
            add(options, 'CM');
            
            console.log(`[PositionLogic] FR обратная логика для позиции ${rowIndex}:`, {
                centralIndices, minCentralIndex, maxCentralIndex, totalCentralCount,
                isMinCentral: rowIndex === minCentralIndex,
                isMaxCentral: rowIndex === maxCentralIndex
            });
            
            // 3. Специальный случай: 1 центральный игрок
            if (totalCentralCount === 1) {
                console.log(`[PositionLogic] FR: Единственный центральный игрок - может стать DM, AM, CM`);
                add(options, 'DM');
                
                // AM только если его нет в составе
                if (amCount < 1) {
                    console.log(`[PositionLogic] FR: Добавляем AM (единственный центральный и AM < 1)`);
                    add(options, 'AM');
                } else {
                    console.log(`[PositionLogic] FR: НЕ добавляем AM (уже есть AM в составе)`);
                }
                
                // CM уже добавлен выше
                break;
            }
            
            // 4. Специальный случай: формация 3-6-1
            if (is361) {
                console.log(`[PositionLogic] FR: Формация 3-6-1 - специальная логика для DM`);
                if (rowIndex === minCentralIndex || rowIndex === minCentralIndex + 1) {
                    console.log(`[PositionLogic] FR: Добавляем DM для минимального индекса или +1`);
                    add(options, 'DM');
                }
            } else {
                // 5. Обычная логика для других формаций
                // ИСПРАВЛЕНИЕ 3: Универсальное ограничение для DM
                const canBecomeDM = (totalCentralCount === 1) || 
                                   (totalCentralCount >= 3) || 
                                   (totalCentralCount === 2 && !isMaxMidfielder);
                
                console.log(`[PositionLogic] FR→DM проверка для позиции ${rowIndex}:`, {
                    totalCentralCount, isMaxMidfielder, canBecomeDM
                });

                if (canBecomeDM) {
                    console.log(`[PositionLogic] FR: Добавляем DM (универсальное правило)`);
                    add(options, 'DM');
                }
            }
            
            // 6. FR → AM (только на максимальном индексе И если AM < 1)
            if (rowIndex === maxCentralIndex && amCount < 1) {
                console.log(`[PositionLogic] FR: Добавляем AM (максимальный индекс и AM < 1)`);
                add(options, 'AM');
            } else if (rowIndex === maxCentralIndex && amCount >= 1) {
                console.log(`[PositionLogic] FR: НЕ добавляем AM (уже есть AM в составе)`);
            }
            
            break;
        }
        default:
            break;
    }
    if (is424) {
        if (pos === 'CM' && cmCount === 2) {
            const otherCMIndex = cmIdxs.find(idx => idx !== rowIndex);
            options.forEach(opt => {
                if (opt.value === 'LM' || opt.value === 'RM') {
                    const otherValue = (opt.value === 'LM') ? 'RM' : 'LM';
                    opt.syncChange = [{
                        index: otherCMIndex,
                        value: otherValue
                    }];
                }
            });
        }
        if (pos === 'LM' && rmIdxs.length >= 1) {
            const otherRM = rmIdxs[0];
            options.forEach(opt => {
                if (opt.value === 'CM') {
                    opt.syncChange = [{
                        index: otherRM,
                        value: 'CM'
                    }];
                }
            });
        }
        if (pos === 'RM' && lmIdxs.length >= 1) {
            const otherLM = lmIdxs[0];
            options.forEach(opt => {
                if (opt.value === 'CM') {
                    opt.syncChange = [{
                        index: otherLM,
                        value: 'CM'
                    }];
                }
            });
        }
    }

    console.log(`[getAllowedMiniOptions] === РЕЗУЛЬТАТ ===`);
    console.log(`[getAllowedMiniOptions] Итоговые опции для ${pos}:`, options.map(o => o.value));
    console.log(`[getAllowedMiniOptions] AM в опциях: ${options.some(o => o.value === 'AM')}`);
    console.log(`[getAllowedMiniOptions] === КОНЕЦ ПРОВЕРКИ ===\n`);

    return options;
}

function onMiniPositionChange({
    formationName,
    positions,
    rowIndex,
    selectedOpt,
    lineup,
    afterChange
}) {
    if (!selectedOpt) return positions;
    const is424 = formationName === '4-2-4';
    const newPositions = [...positions];
    newPositions[rowIndex] = selectedOpt.value;
    const syncArr = Array.isArray(selectedOpt.syncChange) ? selectedOpt.syncChange : (selectedOpt.syncChange ? [
        selectedOpt.syncChange
    ] : []);
    for (const sc of syncArr) {
        if (sc && typeof sc.index === 'number' && sc.value) {
            newPositions[sc.index] = sc.value;
            if (lineup && lineup[sc.index] && lineup[sc.index].miniPositionSelect) {
                const opts2 = getAllowedMiniOptions({
                    formationName,
                    positions: newPositions,
                    rowIndex: sc.index
                });
                lineup[sc.index].miniPositionSelect.setOptions(opts2);
                lineup[sc.index].miniPositionSelect.setValue(sc.value);
            }
        }
    }

    // Логика уникальности ST: если устанавливается ST, другие ST сбрасываются на CF
    if (selectedOpt.value === 'ST') {
        // Найти все другие ST позиции и заменить их на CF
        const otherSTIndices = [];
        newPositions.forEach((pos, idx) => {
            if (pos === 'ST' && idx !== rowIndex) {
                otherSTIndices.push(idx);
            }
        });

        // Сбросить все найденные ST на CF
        otherSTIndices.forEach(stIndex => {
            newPositions[stIndex] = 'CF';

            // Обновить мини-селектор для сброшенной позиции
            if (lineup && lineup[stIndex] && lineup[stIndex].miniPositionSelect) {
                const cfOpts = getAllowedMiniOptions({
                    formationName,
                    positions: newPositions,
                    rowIndex: stIndex
                });
                lineup[stIndex].miniPositionSelect.setOptions(cfOpts);
                lineup[stIndex].miniPositionSelect.setValue('CF');
            }
        });
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
                const optsW = getAllowedMiniOptions({
                    formationName,
                    positions: newPositions,
                    rowIndex: wingIndex
                });
                lineup[wingIndex].miniPositionSelect.setOptions(optsW);
                lineup[wingIndex].miniPositionSelect.setValue('CM');
            }
        }
    }

    // Автоматический выбор RF при выборе LF
    if (selectedOpt.value === 'LF') {
        const originalPosition = positions[rowIndex];

        // Подсчитываем количество нападающих в составе
        const attackerCount = newPositions.filter(pos =>
            ['CF', 'LF', 'RF', 'ST'].includes(pos)
        ).length;

        // Проверяем, есть ли ST в составе
        const hasSTInFormation = newPositions.includes('ST');

        // Логика зависит от количества нападающих:
        // - 2 нападающих: всегда базовая логика LF → RF
        // - 3+ нападающих с ST: приоритет ST логике (CF → LF при ST → ST становится RF)
        // - 3+ нападающих без ST: базовая логика LF → RF

        const shouldUseBasicLogic = attackerCount === 2 ||
                                   !hasSTInFormation ||
                                   originalPosition !== 'CF';

        if (shouldUseBasicLogic) {
            // Найти последний слот с CF для замены на RF
            const cfIndices = [];
            newPositions.forEach((pos, idx) => {
                if (pos === 'CF') cfIndices.push(idx);
            });

            // Если есть CF позиции, заменить последнюю на RF
            if (cfIndices.length > 0) {
                const lastCFIndex = cfIndices[cfIndices.length - 1];
                newPositions[lastCFIndex] = 'RF';

                // Обновить мини-селектор для RF позиции
                if (lineup && lineup[lastCFIndex] && lineup[lastCFIndex].miniPositionSelect) {
                    const rfOpts = getAllowedMiniOptions({
                        formationName,
                        positions: newPositions,
                        rowIndex: lastCFIndex
                    });
                    lineup[lastCFIndex].miniPositionSelect.setOptions(rfOpts);
                    lineup[lastCFIndex].miniPositionSelect.setValue('RF');
                }
            }
        }
    }

    // Автоматический выбор LF при выборе RF
    if (selectedOpt.value === 'RF') {
        const originalPosition = positions[rowIndex];

        // Подсчитываем количество нападающих в составе
        const attackerCount = newPositions.filter(pos =>
            ['CF', 'LF', 'RF', 'ST'].includes(pos)
        ).length;

        // Проверяем, есть ли ST в составе
        const hasSTInFormation = newPositions.includes('ST');

        // Логика зависит от количества нападающих:
        // - 2 нападающих: всегда базовая логика RF → LF
        // - 3+ нападающих с ST: приоритет ST логике (CF → RF при ST → другая CF становится LF)
        // - 3+ нападающих без ST: базовая логика RF → LF

        const shouldUseBasicLogic = attackerCount === 2 ||
                                   !hasSTInFormation ||
                                   originalPosition !== 'CF';

        if (shouldUseBasicLogic) {
            // Найти первый слот с CF для замены на LF
            const cfIndices = [];
            newPositions.forEach((pos, idx) => {
                if (pos === 'CF') cfIndices.push(idx);
            });

            // Если есть CF позиции, заменить первую на LF
            if (cfIndices.length > 0) {
                const firstCFIndex = cfIndices[0];
                newPositions[firstCFIndex] = 'LF';

                // Обновить мини-селектор для LF позиции
                if (lineup && lineup[firstCFIndex] && lineup[firstCFIndex].miniPositionSelect) {
                    const lfOpts = getAllowedMiniOptions({
                        formationName,
                        positions: newPositions,
                        rowIndex: firstCFIndex
                    });
                    lineup[firstCFIndex].miniPositionSelect.setOptions(lfOpts);
                    lineup[firstCFIndex].miniPositionSelect.setValue('LF');
                }
            }
        }
    }

    // Обратная логика: если LF или RF меняется на CF, то обе фланговые позиции становятся CF
    if (selectedOpt.value === 'CF') {
        // Проверяем, была ли изначальная позиция LF или RF
        const originalPosition = positions[rowIndex];
        if (originalPosition === 'LF' || originalPosition === 'RF') {
            // Найти все LF и RF позиции и заменить их на CF
            const flanksToConvert = [];
            newPositions.forEach((pos, idx) => {
                if ((pos === 'LF' || pos === 'RF') && idx !== rowIndex) {
                    flanksToConvert.push(idx);
                }
            });

            // Конвертировать все найденные фланговые позиции в CF
            flanksToConvert.forEach(flankIndex => {
                newPositions[flankIndex] = 'CF';

                // Обновить мини-селектор для конвертированной позиции
                if (lineup && lineup[flankIndex] && lineup[flankIndex].miniPositionSelect) {
                    const cfOpts = getAllowedMiniOptions({
                        formationName,
                        positions: newPositions,
                        rowIndex: flankIndex
                    });
                    lineup[flankIndex].miniPositionSelect.setOptions(cfOpts);
                    lineup[flankIndex].miniPositionSelect.setValue('CF');
                }
            });
        }
    }

    // Логика для ST (выдвинутый нападающий)

    // 1) LF/RF → ST: вторая фланговая позиция становится CF
    if (selectedOpt.value === 'ST') {
        const originalPosition = positions[rowIndex];
        if (originalPosition === 'LF' || originalPosition === 'RF') {
            // Найти противоположную фланговую позицию и заменить на CF
            const oppositeFlank = originalPosition === 'LF' ? 'RF' : 'LF';
            const oppositeFlankIndex = newPositions.findIndex((pos, idx) => pos === oppositeFlank && idx !== rowIndex);

            if (oppositeFlankIndex !== -1) {
                newPositions[oppositeFlankIndex] = 'CF';

                // Обновить мини-селектор
                if (lineup && lineup[oppositeFlankIndex] && lineup[oppositeFlankIndex].miniPositionSelect) {
                    const cfOpts = getAllowedMiniOptions({
                        formationName,
                        positions: newPositions,
                        rowIndex: oppositeFlankIndex
                    });
                    lineup[oppositeFlankIndex].miniPositionSelect.setOptions(cfOpts);
                    lineup[oppositeFlankIndex].miniPositionSelect.setValue('CF');
                }
            }
        }
    }

    // 2) ST → LF/RF: если есть CF, она становится противоположным флангом
    if (selectedOpt.value === 'LF' || selectedOpt.value === 'RF') {
        const originalPosition = positions[rowIndex];
        if (originalPosition === 'ST') {
            // Найти CF позицию и заменить на противоположный фланг
            const targetFlank = selectedOpt.value === 'LF' ? 'RF' : 'LF';
            const cfIndex = newPositions.findIndex((pos, idx) => pos === 'CF' && idx !== rowIndex);

            if (cfIndex !== -1) {
                newPositions[cfIndex] = targetFlank;

                // Обновить мини-селектор
                if (lineup && lineup[cfIndex] && lineup[cfIndex].miniPositionSelect) {
                    const flankOpts = getAllowedMiniOptions({
                        formationName,
                        positions: newPositions,
                        rowIndex: cfIndex
                    });
                    lineup[cfIndex].miniPositionSelect.setOptions(flankOpts);
                    lineup[cfIndex].miniPositionSelect.setValue(targetFlank);
                }
            }
        }
    }

    // 2.1) ST → LF/RF в крайних позициях: при 3 нападающих активируется базовая логика
    if (selectedOpt.value === 'LF' || selectedOpt.value === 'RF') {
        const originalPosition = positions[rowIndex];
        if (originalPosition === 'ST') {
            // Подсчитываем количество нападающих
            const attackerCount = newPositions.filter(pos =>
                ['CF', 'LF', 'RF', 'ST'].includes(pos)
            ).length;

            // Проверяем, находится ли ST в крайней позиции при 3 нападающих
            if (attackerCount === 3) {
                // Определяем позиции нападающих
                const attackerPositions = [];
                newPositions.forEach((pos, idx) => {
                    if (['CF', 'LF', 'RF', 'ST'].includes(pos)) {
                        attackerPositions.push(idx);
                    }
                });

                // Сортируем позиции по индексу
                attackerPositions.sort((a, b) => a - b);

                // Проверяем, находится ли текущая позиция в крайних слотах (первый или последний)
                const isFirstAttacker = rowIndex === attackerPositions[0];
                const isLastAttacker = rowIndex === attackerPositions[attackerPositions.length - 1];

                if (isFirstAttacker || isLastAttacker) {
                    // ST в крайней позиции → активируем базовую логику LF/RF
                    if (selectedOpt.value === 'LF') {
                        // Найти последний слот с CF для замены на RF
                        const cfIndices = [];
                        newPositions.forEach((pos, idx) => {
                            if (pos === 'CF') cfIndices.push(idx);
                        });

                        if (cfIndices.length > 0) {
                            const lastCFIndex = cfIndices[cfIndices.length - 1];
                            newPositions[lastCFIndex] = 'RF';

                            // Обновить мини-селектор
                            if (lineup && lineup[lastCFIndex] && lineup[lastCFIndex].miniPositionSelect) {
                                const rfOpts = getAllowedMiniOptions({
                                    formationName,
                                    positions: newPositions,
                                    rowIndex: lastCFIndex
                                });
                                lineup[lastCFIndex].miniPositionSelect.setOptions(rfOpts);
                                lineup[lastCFIndex].miniPositionSelect.setValue('RF');
                            }
                        }
                    } else if (selectedOpt.value === 'RF') {
                        // Найти первый слот с CF для замены на LF
                        const cfIndices = [];
                        newPositions.forEach((pos, idx) => {
                            if (pos === 'CF') cfIndices.push(idx);
                        });

                        if (cfIndices.length > 0) {
                            const firstCFIndex = cfIndices[0];
                            newPositions[firstCFIndex] = 'LF';

                            // Обновить мини-селектор
                            if (lineup && lineup[firstCFIndex] && lineup[firstCFIndex].miniPositionSelect) {
                                const lfOpts = getAllowedMiniOptions({
                                    formationName,
                                    positions: newPositions,
                                    rowIndex: firstCFIndex
                                });
                                lineup[firstCFIndex].miniPositionSelect.setOptions(lfOpts);
                                lineup[firstCFIndex].miniPositionSelect.setValue('LF');
                            }
                        }
                    }
                }
            }
        }
    }

    // 3) CF → LF/RF: если есть ST, другая CF становится противоположным флангом
    if (selectedOpt.value === 'LF' || selectedOpt.value === 'RF') {
        const originalPosition = positions[rowIndex];
        if (originalPosition === 'CF') {
            // Подсчитываем количество нападающих
            const attackerCount = newPositions.filter(pos =>
                ['CF', 'LF', 'RF', 'ST'].includes(pos)
            ).length;

            // Проверяем, есть ли ST в составе
            const hasSTInFormation = newPositions.includes('ST');

            // Если 3+ нападающих и есть ST, то ищем другую CF для противоположного фланга
            if (attackerCount >= 3 && hasSTInFormation) {
                const targetFlank = selectedOpt.value === 'LF' ? 'RF' : 'LF';
                const otherCFIndex = newPositions.findIndex((pos, idx) => pos === 'CF' && idx !== rowIndex);

                if (otherCFIndex !== -1) {
                    newPositions[otherCFIndex] = targetFlank;

                    // Обновить мини-селектор
                    if (lineup && lineup[otherCFIndex] && lineup[otherCFIndex].miniPositionSelect) {
                        const flankOpts = getAllowedMiniOptions({
                            formationName,
                            positions: newPositions,
                            rowIndex: otherCFIndex
                        });
                        lineup[otherCFIndex].miniPositionSelect.setOptions(flankOpts);
                        lineup[otherCFIndex].miniPositionSelect.setValue(targetFlank);
                    }
                }
            }
        }
    }

    if (lineup && lineup[rowIndex] && lineup[rowIndex].miniPositionSelect) {
        const opts1 = getAllowedMiniOptions({
            formationName,
            positions: newPositions,
            rowIndex
        });
        lineup[rowIndex].miniPositionSelect.setOptions(opts1);
        lineup[rowIndex].miniPositionSelect.setValue(selectedOpt.value);
    }

    // НОВАЯ ЛОГИКА ДЛЯ СХЕМЫ 4-2-4: Автоматическое превращение полузащитников
    if (is424) {
        // Когда один из центральных полузащитников (CM, FR) становится RM или LM,
        // второй должен тоже становиться фланговым игроком (противоположный фланг)
        if (selectedOpt.value === 'LM' || selectedOpt.value === 'RM') {
            const originalPosition = positions[rowIndex];
            
            // Проверяем, был ли это центральный полузащитник
            if (originalPosition === 'CM' || originalPosition === 'FR') {
                console.log(`[onMiniPositionChange] 4-2-4: ${originalPosition} → ${selectedOpt.value}, ищем второго полузащитника`);
                
                // Определяем целевой фланг для второго полузащитника
                const targetFlank = selectedOpt.value === 'LM' ? 'RM' : 'LM';
                
                // Ищем другого центрального полузащитника (CM или FR)
                const otherMidfielderIndex = newPositions.findIndex((pos, idx) => {
                    return (pos === 'CM' || pos === 'FR') && idx !== rowIndex;
                });
                
                if (otherMidfielderIndex !== -1) {
                    const otherOriginalPos = newPositions[otherMidfielderIndex];
                    newPositions[otherMidfielderIndex] = targetFlank;
                    
                    console.log(`[onMiniPositionChange] 4-2-4: Автоматически превращаем ${otherOriginalPos} (индекс ${otherMidfielderIndex}) → ${targetFlank}`);
                    
                    // Обновить мини-селектор для второго полузащитника
                    if (lineup && lineup[otherMidfielderIndex] && lineup[otherMidfielderIndex].miniPositionSelect) {
                        const flankOpts = getAllowedMiniOptions({
                            formationName,
                            positions: newPositions,
                            rowIndex: otherMidfielderIndex
                        });
                        lineup[otherMidfielderIndex].miniPositionSelect.setOptions(flankOpts);
                        lineup[otherMidfielderIndex].miniPositionSelect.setValue(targetFlank);
                    }
                } else {
                    console.log(`[onMiniPositionChange] 4-2-4: Не найден второй центральный полузащитник для автоматического превращения`);
                }
            }
        }
        
        // Обратная логика: когда фланговый полузащитник (LM/RM) становится центральным (CM/FR),
        // второй фланговый тоже должен стать центральным
        if (selectedOpt.value === 'CM' || selectedOpt.value === 'FR') {
            const originalPosition = positions[rowIndex];
            
            // Проверяем, был ли это фланговый полузащитник
            if (originalPosition === 'LM' || originalPosition === 'RM') {
                console.log(`[onMiniPositionChange] 4-2-4: ${originalPosition} → ${selectedOpt.value}, ищем второго флангового`);
                
                // Определяем противоположный фланг
                const oppositeFlank = originalPosition === 'LM' ? 'RM' : 'LM';
                
                // Ищем противоположного флангового полузащитника
                const oppositeFlankIndex = newPositions.findIndex((pos, idx) => {
                    return pos === oppositeFlank && idx !== rowIndex;
                });
                
                if (oppositeFlankIndex !== -1) {
                    // Определяем целевую позицию (приоритет CM, если FR уже занят)
                    const hasCM = newPositions.includes('CM');
                    const hasFR = newPositions.includes('FR');
                    const targetPosition = (!hasCM) ? 'CM' : (!hasFR) ? 'FR' : 'CM';
                    
                    newPositions[oppositeFlankIndex] = targetPosition;
                    
                    console.log(`[onMiniPositionChange] 4-2-4: Автоматически превращаем ${oppositeFlank} (индекс ${oppositeFlankIndex}) → ${targetPosition}`);
                    
                    // Обновить мини-селектор для противоположного флангового
                    if (lineup && lineup[oppositeFlankIndex] && lineup[oppositeFlankIndex].miniPositionSelect) {
                        const centralOpts = getAllowedMiniOptions({
                            formationName,
                            positions: newPositions,
                            rowIndex: oppositeFlankIndex
                        });
                        lineup[oppositeFlankIndex].miniPositionSelect.setOptions(centralOpts);
                        lineup[oppositeFlankIndex].miniPositionSelect.setValue(targetPosition);
                    }
                } else {
                    console.log(`[onMiniPositionChange] 4-2-4: Не найден противоположный фланговый полузащитник для автоматического превращения`);
                }
            }
        }
    }

    // КРИТИЧЕСКИ ВАЖНО: Обновляем опции для ВСЕХ позиций после любого изменения
    // Это необходимо для корректной работы ограничений (например, AM при наличии LW/RW)
    if (lineup) {
        newPositions.forEach((pos, idx) => {
            if (lineup[idx] && lineup[idx].miniPositionSelect && idx !== rowIndex) {
                const updatedOpts = getAllowedMiniOptions({
                    formationName,
                    positions: newPositions,
                    rowIndex: idx
                });
                lineup[idx].miniPositionSelect.setOptions(updatedOpts);
                // Сохраняем текущее значение, если оно все еще доступно
                const currentValue = lineup[idx].miniPositionSelect.getValue();
                const isCurrentValueStillValid = updatedOpts.some(opt => opt.value === currentValue);
                if (!isCurrentValueStillValid) {
                    // Если текущее значение больше недоступно, выбираем первую доступную опцию
                    lineup[idx].miniPositionSelect.setValue(updatedOpts[0]?.value || pos);
                }
            }
        });
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
    return {
        weather,
        temperature,
        icon: weatherDiv.querySelector('img')?.src || ''
    };
}
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

function logPlayerWeatherCoef({
    player,
    customStyleValue,
    strength
}) {
    const wt = getCurrentWeatherFromUI();
    if (!wt) {
        return;
    }
    const styleId = mapCustomStyleToStyleId(customStyleValue);
    const styleNumeric = STYLE_VALUES[styleId] ?? 0;
    getWeatherStrengthValueCached(styleNumeric, wt.temperature, wt.weather, strength, (res) => {
        // WeatherCoef calculation completed
    });
}

function getCurrentWeatherFromUI() {
    const ui = document.getElementById('vsol-weather-ui');
    if (!ui) return null;
    const selects = ui.querySelectorAll('select');
    if (selects.length < 2) return null;
    return {
        weather: selects[0].value,
        temperature: Number((selects[1].value || '').replace('°', '')) || 0
    };
}
// --- MAIN LINEUP BLOCK ---
function createTeamLineupBlock(players, initialFormationName = "4-4-2", teamId = null) {
    const lineup = [];
    const selectedPlayerIds = new Set();
    const table = document.createElement('table');
    table.className = 'orders-table';
    if (teamId) {
        table.id = `orders-table-${teamId}`;
    }
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

    function calculatePlayerStr(player, matchPosition, physicalFormId) {
        const baseStr = Number(player.baseStrength) || 0;

        // Определяем форму игрока
        let actualFormId = physicalFormId;
        if (!actualFormId || actualFormId === 'FRIENDLY_100') {
            const tournamentType = getTournamentType();
            actualFormId = getPhysicalFormIdFromData(player.form, player.form_mod, tournamentType);
        }

        // Применяем все модификаторы
        const physicalFormModifier = getPhysicalFormModifier(actualFormId);
        const realityModifier = getRealityBonus(player.real_status, player.real_sign);
        const positionModifier = getPositionModifier(player.mainPos, player.secondPos, matchPosition);

        // Для товарищеских матчей усталость всегда 25%
        let fatigueModifier;
        const tournamentType = getTournamentType();
        if (tournamentType === 'friendly') {
            fatigueModifier = 1 - (25 / 100); // 0.75
        } else {
            fatigueModifier = getFatigueBonus(player.fatigue);
        }

        const calculatedStr = baseStr * physicalFormModifier * fatigueModifier * realityModifier * positionModifier;

        return Math.round(calculatedStr);
    }

    function toOptionLabel(p, matchPosition, physicalFormId) {
        const pos = [p.mainPos, p.secondPos].filter(Boolean).join('/');
        const percent = (Number(p.form) || 0) + '%';

        // Определяем какую силу показывать
        let displayStr;

        // Определяем автоматическую форму игрока
        const tournamentType = getTournamentType();
        const autoFormId = getPhysicalFormIdFromData(p.form, p.form_mod, tournamentType);

        if (autoFormId === 'UNKNOWN' || (physicalFormId && physicalFormId !== autoFormId)) {
            // Форма неизвестна или изменена пользователем - рассчитываем от baseStr
            displayStr = calculatePlayerStr(p, matchPosition, physicalFormId || autoFormId);
        } else {
            // Форма известна и не изменена - используем realStr из игры с positionModifier
            const realStr = Number(p.realStr) || 0;
            const positionModifier = getPositionModifier(p.mainPos, p.secondPos, matchPosition);
            displayStr = Math.round(realStr * positionModifier);
        }

        return `${p.name.padEnd(16, ' ')} ${pos.padEnd(6, ' ')} ${percent.padStart(3, ' ')}   ${displayStr}`;
    }

    function updatePlayerSelectOptions() {
        lineup.forEach(slot => {
            const currentVal = slot.getValue();
            const pool = getFilteredPlayersForRow(slot.posValue, currentVal);
            const placeholder = buildPlaceholder(slot.posValue);
            const matchPosition = slot.posValue;
            const currentSlotFormId = slot.physicalFormValue;  // Может быть null - это нормально

            // Для каждого игрока в dropdown используем его собственную форму
            const opts = pool.map(p => {
                // Находим слот, в котором находится этот игрок (если он выбран где-то)
                const playerSlot = lineup.find(s => s.getValue() === String(p.id));
                const playerFormId = playerSlot ? playerSlot.physicalFormValue : null;

                return {
                    value: String(p.id),
                    label: toOptionLabel(p, matchPosition, playerFormId)
                };
            });
            slot.setOptions(opts);

            // Обновляем label выбранного игрока с его собственной формой
            if (currentVal) {
                const selectedPlayer = pool.find(p => String(p.id) === currentVal);
                if (selectedPlayer) {
                    const newLabel = toOptionLabel(selectedPlayer, matchPosition, currentSlotFormId);
                    slot.setValue(currentVal, newLabel);
                }
            } else if (!pool.some(p => String(p.id) === currentVal)) {
                slot.setValue('', '');
                if (typeof slot.setPlaceholder === 'function') slot.setPlaceholder(placeholder);
            }
        });
        if (typeof updateCaptainOptionsProxy === 'function') updateCaptainOptionsProxy();
        if (typeof window.__vs_onLineupChanged === 'function') window.__vs_onLineupChanged();
    }
    let captainSelectRef = null;

    function attachCaptainSelect(ref) {
        captainSelectRef = ref;
    }

    function updateCaptainOptionsProxy() {
        if (!captainSelectRef) return;
        const inLineupIds = new Set(lineup.map(s => s.getValue()).filter(Boolean));
        const available = players.filter(p => inLineupIds.has(String(p.id)));

        // Обновляем title селектора
        if (available.length === 0) {
            captainSelectRef.title = 'Некому быть капитаном';
        } else {
            captainSelectRef.title = 'Выберите капитана';
        }

        const dummyEntries = lineup.map(slot => {
            const pid = slot.getValue && slot.getValue();
            if (!pid) return null;
            const pl = players.find(pp => String(pp.id) === String(pid));
            return pl ? {
                player: pl
            } : null;
        });
        const prev = captainSelectRef.value;
        captainSelectRef.innerHTML = '<option value="" class="captain-placeholder">— не выбран —</option>';
        available.forEach(p => {
            const percent = estimateCaptainPercent(p, dummyEntries);

            // Находим слот капитана для получения его позиции и формы
            const captainSlot = lineup.find(slot => {
                const pid = slot.getValue && slot.getValue();
                return pid && String(pid) === String(p.id);
            });

            let captainCalculatedStr;
            if (captainSlot && captainSlot.posValue && captainSlot.physicalFormValue) {
                // Используем calculatePlayerStr для точного расчета
                captainCalculatedStr = calculatePlayerStr(p, captainSlot.posValue, captainSlot.physicalFormValue);
            } else {
                // Fallback на realStr если нет данных о позиции/форме
                captainCalculatedStr = Number(p.realStr) || 0;
            }

            const captainBonus = captainCalculatedStr * percent;

            const opt = document.createElement('option');
            opt.value = p.id;

            // Форматирование: если бонус положительный - показываем число и проценты, если отрицательный/нулевой - только проценты
            if (captainBonus > 0) {
                opt.textContent = `${p.name} — ${captainBonus.toFixed(2)} (+${(percent * 100).toFixed(0)}%)`;
            } else {
                opt.textContent = `${p.name} — ${captainBonus.toFixed(1)} (${(percent * 100).toFixed(0)}%)`;
            }

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
        const miniOpts = getAllowedMiniOptions({
            formationName,
            positions,
            rowIndex: row
        });
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
                            newPositions.forEach((p, i) => {
                                lineup[i].posValue = p;
                            });
                            selectedPlayerIds.clear();
                            lineup.forEach(s => {
                                const v = s.getValue();
                                if (v) selectedPlayerIds.add(v);
                            });
                            updatePlayerSelectOptions();
                            if (typeof updateCaptainOptionsProxy === 'function')
                                updateCaptainOptionsProxy();
                            if (typeof updateRoleSelectors === 'function')
                                updateRoleSelectors();
                            if (typeof window.__vs_onLineupChanged === 'function') window
                                .__vs_onLineupChanged();
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
        const orders = createOrdersSelect({
            placeholder,
            options: []
        });
        orders.setPlaceholder(placeholder);
        orders.setValue('', '');
        const rendered = orders.el.querySelector('.select2-selection__rendered');

        if (rendered) {
            rendered.style.textAlign = 'left';
            rendered.style.justifyContent = 'flex-start';
        }
        const styleSelect = createCustomStyleSelect((styleValue) => {
            console.log(`[SELECT] Изменение стиля: ${styleValue}`);
            
            slotApi.customStyleValue = styleValue;
            const playerId = slotApi.getValue && slotApi.getValue();

            // Сохраняем стиль игрока в кэш
            if (playerId) {
                setPlayerStyleToCache(playerId, styleValue);
                console.log(`[SELECT] Сохранен в кэш: игрок ${playerId} → стиль ${styleValue}`);
            }

            const player = players.find(p => String(p.id) === String(playerId));
            if (player) {
                console.log(`[SELECT] Применяем стиль к игроку ${player.name}: ${styleValue}`);
                logPlayerWeatherCoef({
                    player,
                    customStyleValue: slotApi.customStyleValue || 'norm',
                    strength: Number(player.realStr) || 0
                });
            }
        });
        styleSelect.style.display = 'block';
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
            selectedPlayer: null,  // ← ДОБАВЛЕНО: данные выбранного игрока
            getValue: () => orders.getValue(),
            setValue: (v, label) => {
                orders.setValue(v, label);
                // Проверяем форму игрока при установке
                if (v) {
                    const player = players.find(p => String(p.id) === String(v));
                    if (player) {
                        // Сохраняем данные игрока в slotApi
                        slotApi.selectedPlayer = player;  // ← ДОБАВЛЕНО
                        
                        // Автоматически устанавливаем стиль игрока из hidden_style
                        const playerHiddenStyleNumeric = player.hidden_style;
                        const playerHiddenStyle = convertNumericStyleToString(playerHiddenStyleNumeric);
                        
                        console.log(`[SELECT] Выбран игрок ${player.name}: hidden_style=${playerHiddenStyleNumeric} → ${playerHiddenStyle}`);
                        
                        // Загружаем стиль игрока из кэша или используем hidden_style
                        const cachedStyle = getPlayerStyleFromCache(v);
                        const effectiveStyle = cachedStyle || playerHiddenStyle;
                        
                        console.log(`[SELECT] Эффективный стиль для ${player.name}: кэш=${cachedStyle || 'нет'}, итого=${effectiveStyle}`);
                        
                        if (effectiveStyle !== 'norm') {
                            slotApi.customStyleValue = effectiveStyle;
                            if (styleSelect && styleSelect.setValue) {
                                styleSelect.setValue(effectiveStyle);
                                console.log(`[SELECT] Установлен стиль в селектор: ${effectiveStyle}`);
                            }
                        } else {
                            // Устанавливаем norm если нет кэша и hidden_style = norm
                            slotApi.customStyleValue = 'norm';
                            if (styleSelect && styleSelect.setValue) {
                                styleSelect.setValue('norm');
                                console.log(`[SELECT] Установлен стиль по умолчанию: norm`);
                            }
                        }

                        if (slotApi.physicalFormSelect) {
                            const tournamentType = document.getElementById('vs_tournament_type')?.value || 'typeC';
                            const autoFormId = getPhysicalFormIdFromData(player.form, player.form_mod, tournamentType);

                            // Устанавливаем форму только если она ещё не установлена (null)
                            // Если форма уже установлена вручную, не перезаписываем её
                            if (slotApi.physicalFormValue === null) {
                                slotApi.physicalFormSelect.setValue(autoFormId);
                                slotApi.physicalFormValue = autoFormId;

                                // Пересчитываем realStr с учетом физ формы
                                const baseRealStr = Number(player.baseRealStr || player.realStr) || 0;
                                const modifiedRealStr = applyPhysicalFormToRealStr(baseRealStr, autoFormId);
                                slotApi.modifiedRealStr = modifiedRealStr;
                            }
                        }
                    } else {
                        // Игрок не найден - очищаем данные
                        slotApi.selectedPlayer = null;  // ← ДОБАВЛЕНО
                        console.log(`[SELECT] Игрок не найден для ID: ${v}, очищаем данные`);
                    }
                } else {
                    // Игрок не выбран - очищаем данные
                    slotApi.selectedPlayer = null;  // ← ДОБАВЛЕНО
                    console.log(`[SELECT] Игрок не выбран, очищаем данные`);
                }
            },
            setOptions: (opts) => orders.setOptions(opts),
            setPlaceholder: (ph) => orders.setPlaceholder(ph),
            customStyleValue: 'norm',
            physicalFormValue: null,  // Будет установлено при выборе игрока
            modifiedRealStr: null,
            miniPositionSelect: mini,
            physicalFormSelect: null  // Будет установлен позже
        };
        orders.el.addEventListener('click', (e) => e.stopPropagation());
        const onChangePlayer = (value) => {
            selectedPlayerIds.clear();
            lineup.forEach(s => {
                const v = s.getValue();
                if (v) selectedPlayerIds.add(v);
            });
            updatePlayerSelectOptions();
            if (typeof updateRoleSelectors === 'function') {
                updateRoleSelectors();
            }
            const player = players.find(p => String(p.id) === value);
            if (player) {
                // Сохраняем данные игрока в slotApi
                slotApi.selectedPlayer = player;  // ← ДОБАВЛЕНО
                
                logPlayerWeatherCoef({
                    player,
                    customStyleValue: slotApi.customStyleValue || 'norm',
                    strength: Number(player.realStr) || 0
                });

                // Автоматически устанавливаем форму на основе данных игрока
                if (slotApi.physicalFormSelect) {
                    const tournamentType = document.getElementById('vs_tournament_type')?.value || 'typeC';
                    const formId = getPhysicalFormIdFromData(player.form, player.form_mod, tournamentType);
                    slotApi.physicalFormSelect.setValue(formId);
                    slotApi.physicalFormValue = formId;

                    // Пересчитываем realStr с учетом физ формы
                    const baseRealStr = Number(player.baseRealStr || player.realStr) || 0;
                    const modifiedRealStr = applyPhysicalFormToRealStr(baseRealStr, formId);
                    slotApi.modifiedRealStr = modifiedRealStr;

                    // Обновляем селекторы игроков с новой формой
                    updatePlayerSelectOptions();
                }
            } else {
                // Игрок не выбран - очищаем данные
                slotApi.selectedPlayer = null;  // ← ДОБАВЛЕНО
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
                        div.addEventListener('click', () => onChangePlayer(val), {
                            once: true
                        });
                    }
                });
            }
        };
        // Ячейка с селектором игрока
        tdSel.className = 'player-cell';
        tdSel.appendChild(orders.el);

        // ЗАМОРОЖЕНО: Детальные подсказки для селектора игроков
        // addPlayerDetailHints(orders.el, () => {
        //     const playerId = slotApi.getValue();
        //     if (!playerId) return null;
        //     
        //     const player = players.find(p => String(p.id) === playerId);
        //     if (!player) return null;
        //     
        //     return {
        //         player: player,
        //         matchPosition: slotApi.posValue,
        //         physicalFormId: slotApi.physicalFormValue,
        //         customStyle: slotApi.customStyleValue
        //     };
        // });

        // Ячейка с селектором стиля
        const tdStyle = document.createElement('td');
        tdStyle.className = 'txt style-cell';
        tdStyle.appendChild(styleSelect);

        // Ячейка с селектором физической формы
        const tdForm = document.createElement('td');
        tdForm.className = 'txt form-cell';

        const physicalFormSelect = createPhysicalFormSelect((formId) => {
            slotApi.physicalFormValue = formId;
            const playerId = slotApi.getValue && slotApi.getValue();
            const player = players.find(p => String(p.id) === String(playerId));
            if (player) {
                // Пересчитываем realStr с учетом физ формы
                const baseRealStr = Number(player.baseRealStr || player.realStr) || 0;
                const modifiedRealStr = applyPhysicalFormToRealStr(baseRealStr, formId);
                slotApi.modifiedRealStr = modifiedRealStr;

                // Обновляем все селекторы (каждый игрок сохраняет свою форму)
                updatePlayerSelectOptions();
            }
        }, 'typeC');

        physicalFormSelect.style.display = 'block';
        const physFormSelected = physicalFormSelect.querySelector('.selected');
        if (physFormSelected) {
            physFormSelected.style.height = '20px';
            physFormSelected.style.minHeight = '20px';
            physFormSelected.style.lineHeight = '18px';
            physFormSelected.style.padding = '1px 4px';
            physFormSelected.style.boxSizing = 'border-box';
        }

        tdForm.appendChild(physicalFormSelect);
        slotApi.physicalFormSelect = physicalFormSelect;

        // Добавляем все ячейки в строку
        tr.appendChild(tdPos);
        tr.appendChild(tdSel);
        tr.appendChild(tdStyle);
        tr.appendChild(tdForm);
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
                const opts = getAllowedMiniOptions({
                    formationName,
                    positions,
                    rowIndex: idx
                });
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
        lineup.forEach(s => {
            const v = s.getValue();
            if (v) selectedPlayerIds.add(v);
        });
        updatePlayerSelectOptions();
    }

    function updateRoleSelectors() {
        // Обновляем селекторы штрафных, угловых и пенальти
        const shtSelect = document.getElementById('sht');
        const uglovSelect = document.getElementById('uglov');
        const penaltySelect = document.getElementById('penalty');

        if (shtSelect || uglovSelect || penaltySelect) {
            // Получаем игроков из текущего состава
            const availablePlayers = [];
            lineup.forEach(slot => {
                const playerId = slot.getValue();
                if (playerId && playerId !== '-1') {
                    const player = players.find(p => String(p.id) === playerId);
                    if (player) {
                        availablePlayers.push({
                            id: playerId,
                            name: `${player.name} (${slot.posValue})`
                        });
                    }
                }
            });

            // Обновляем каждый селектор
            [shtSelect, uglovSelect, penaltySelect].forEach(select => {
                if (select) {
                    const currentValue = select.value;
                    select.innerHTML = '';

                    // Добавляем опцию по умолчанию
                    const defaultOption = document.createElement('option');
                    defaultOption.value = '-1';
                    defaultOption.className = 'grD';
                    if (select.id === 'sht') defaultOption.textContent = 'некому исполнять штрафные';
                    else if (select.id === 'uglov') defaultOption.textContent = 'некому исполнять угловые';
                    else if (select.id === 'penalty') defaultOption.textContent = 'некому исполнять пенальти';
                    select.appendChild(defaultOption);

                    // Добавляем игроков
                    availablePlayers.forEach(player => {
                        const option = document.createElement('option');
                        option.value = player.id;
                        option.textContent = player.name;
                        select.appendChild(option);
                    });

                    // Восстанавливаем выбранное значение если возможно
                    if (currentValue && availablePlayers.some(p => p.id === currentValue)) {
                        select.value = currentValue;
                    } else {
                        select.value = '-1';
                    }
                }
            });
        }
    }

    updatePlayerSelectOptions();
    return {
        block: table,
        lineup,
        updatePlayerSelectOptions,
        updateRoleSelectors,
        attachCaptainSelect,
        applyFormation,
        getFormationName() {
            return formationName;
        }
    };
}

// --- CAPTAIN AND HELPERS ---
function refreshCaptainOptions(lineupBlock, players) {
    const sel = lineupBlock.captainSelect;
    if (!sel) return;
    const inLineupIds = new Set(lineupBlock.lineup.map(s => s.getValue()).filter(Boolean));
    const available = players.filter(p => inLineupIds.has(String(p.id)));

    // Обновляем title селектора
    if (available.length === 0) {
        sel.title = 'Некому быть капитаном';
    } else {
        sel.title = 'Выберите капитана';
    }

    const dummyEntries = lineupBlock.lineup.map(slot => {
        const pid = slot.getValue && slot.getValue();
        if (!pid) return null;
        const pl = players.find(p => String(p.id) === String(pid));
        return pl ? {
            player: pl
        } : null;
    });
    const prev = sel.value;
    sel.innerHTML = '<option value="" class="captain-placeholder">— не выбран —</option>';
    available.forEach(p => {
        const percent = estimateCaptainPercent(p, dummyEntries);

        // Находим слот капитана для получения его позиции и формы
        const captainSlot = lineupBlock.lineup.find(slot => {
            const pid = slot.getValue && slot.getValue();
            return pid && String(pid) === String(p.id);
        });

        let captainCalculatedStr;
        if (captainSlot && captainSlot.posValue && captainSlot.physicalFormValue) {
            // Используем calculatePlayerStrengthGlobal для точного расчета
            captainCalculatedStr = calculatePlayerStrengthGlobal(p, captainSlot.posValue, captainSlot.physicalFormValue);
        } else {
            // Fallback на realStr если нет данных о позиции/форме
            captainCalculatedStr = Number(p.realStr) || 0;
        }

        const captainBonus = captainCalculatedStr * percent;

        const opt = document.createElement('option');
        opt.value = p.id;

        // Форматирование: если бонус положительный - показываем число и проценты, если отрицательный/нулевой - только проценты
        if (captainBonus > 0) {
            opt.textContent = `${p.name} — ${captainBonus.toFixed(2)} (+${(percent * 100).toFixed(0)}%)`;
        } else {
            opt.textContent = `${p.name} — ${captainBonus.toFixed(1)} (${(percent * 100).toFixed(0)}%)`;
        }

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
    select.title = 'Некому быть капитаном';
    select.innerHTML = '<option value="" class="captain-placeholder">— не выбран —</option>';
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
    select.setHighlight = function (status) {
        const WIN_BG = 'rgb(224, 255, 224)';
        const LOSE_BG = 'rgb(255, 208, 208)';
        const NEUTRAL = 'transparent';
        select.style.background = status === 'win' ? WIN_BG : (status === 'lose' ? LOSE_BG : NEUTRAL);
    };
    return select;
}

// ===== СИСТЕМА ПОДСКАЗОК (ГЛОБАЛЬНАЯ ОБЛАСТЬ ВИДИМОСТИ) =====

/**
 * Показывает детальную подсказку для игрока при наведении
 * @param {HTMLElement} element - Элемент для привязки подсказки
 * @param {Object} player - Данные игрока
 * @param {string} matchPosition - Позиция в матче
 * @param {string} physicalFormId - ID физической формы
 * @param {string} customStyle - Пользовательский стиль
 */
function showPlayerDetailHint(element, player, matchPosition, physicalFormId, customStyle) {
    // Удаляем существующие подсказки
    removeExistingHints();
    
    if (!player) return;
    
    // Создаем контейнер подсказки
    const hint = document.createElement('div');
    hint.className = 'vs-player-detail-hint';
    hint.style.cssText = `
        position: absolute;
        width: 350px;
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10001;
        padding: 0;
        font-size: 11px;
        line-height: 1.4;
        opacity: 0;
        transform: scale(0.95);
        transition: opacity 0.15s ease, transform 0.15s ease;
    `;
    
    // Добавляем заголовок
    const header = document.createElement('div');
    header.style.cssText = `
        background: linear-gradient(135deg, #0066cc, #0088ff);
        color: white;
        font-weight: bold;
        padding: 8px 10px;
        border-radius: 6px 6px 0 0;
        font-size: 11px;
    `;
    header.textContent = 'Детали игрока';
    hint.appendChild(header);
    
    // Добавляем содержимое
    const content = document.createElement('div');
    content.style.cssText = 'padding: 10px;';
    content.innerHTML = getHintContent('player_details', {
        player,
        matchPosition,
        physicalFormId,
        customStyle
    });
    hint.appendChild(content);
    
    // Позиционируем подсказку
    document.body.appendChild(hint);
    positionHint(hint, element, 'right top');
    
    // Анимация появления
    setTimeout(() => {
        hint.style.opacity = '1';
        hint.style.transform = 'scale(1)';
    }, 10);
    
    // Сохраняем ссылку для удаления
    element._playerHint = hint;
    
    return hint;
}

/**
 * Скрывает детальную подсказку игрока
 * @param {HTMLElement} element - Элемент с подсказкой
 */
function hidePlayerDetailHint(element) {
    if (element._playerHint) {
        const hint = element._playerHint;
        hint.style.opacity = '0';
        hint.style.transform = 'scale(0.95)';
        setTimeout(() => {
            if (hint.parentNode) {
                hint.remove();
            }
        }, 150);
        element._playerHint = null;
    }
}

/**
 * Добавляет обработчики для показа детальных подсказок игроков
 * @param {HTMLElement} selectElement - Селектор игрока
 * @param {Function} getPlayerData - Функция получения данных игрока
 */
function addPlayerDetailHints(selectElement, getPlayerData) {
    if (!selectElement || selectElement._hintsAdded) return;
    
    let hoverTimeout = null;
    
    // Обработчик наведения
    selectElement.addEventListener('mouseenter', () => {
        // Задержка перед показом подсказки
        hoverTimeout = setTimeout(() => {
            const playerData = getPlayerData();
            if (playerData && playerData.player) {
                showPlayerDetailHint(
                    selectElement,
                    playerData.player,
                    playerData.matchPosition,
                    playerData.physicalFormId,
                    playerData.customStyle
                );
            }
        }, 500); // 500ms задержка
    });
    
    // Обработчик ухода курсора
    selectElement.addEventListener('mouseleave', () => {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
        }
        hidePlayerDetailHint(selectElement);
    });
    
    selectElement._hintsAdded = true;
}

/**
 * Добавляет кнопку подсказки к элементу
 * @param {HTMLElement} container - Контейнер для кнопки
 * @param {string} type - Тип подсказки
 * @param {string} title - Заголовок подсказки
 * @param {Object} context - Дополнительный контекст для подсказки
 */
function addHelpButton(container, type, title, context = {}) {
    const helpBtn = document.createElement('button');
    helpBtn.className = 'vs-help-btn';
    helpBtn.title = 'Показать подсказку';
    helpBtn.onclick = (e) => {
        e.preventDefault();
        showCalculatorHint(helpBtn, type, title, 450, context);
        return false;
    };
    
    // Улучшенные стили кнопки
    helpBtn.style.cssText = `
        width: 16px;
        height: 16px;
        border: 1px solid #aaa;
        background: linear-gradient(135deg, #f8f8f8, #e8e8e8);
        cursor: pointer;
        display: inline-block;
        vertical-align: middle;
        margin: 0 2px 0 4px;
        border-radius: 3px;
        font-size: 10px;
        color: #666;
        text-align: center;
        line-height: 14px;
        transition: all 0.2s ease;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    `;
    helpBtn.textContent = '?';
    
    // Улучшенные hover эффекты
    helpBtn.onmouseover = () => {
        helpBtn.style.background = 'linear-gradient(135deg, #e8e8e8, #d8d8d8)';
        helpBtn.style.borderColor = '#999';
        helpBtn.style.transform = 'translateY(-1px)';
        helpBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
    };
    helpBtn.onmouseout = () => {
        helpBtn.style.background = 'linear-gradient(135deg, #f8f8f8, #e8e8e8)';
        helpBtn.style.borderColor = '#aaa';
        helpBtn.style.transform = 'translateY(0)';
        helpBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
    };
    
    container.appendChild(helpBtn);
}

// ===== КОНЕЦ СИСТЕМЫ ПОДСКАЗОК =====

function createTeamSettingsBlock(team, sideLabel, onChange) {
    if (sideLabel === 'home') {
        if (!window.homeTeam) {
            window.homeTeam = {
                defenceType: 'zonal',
                rough: 'clean',
                morale: 'normal'
            };
        }
        team = window.homeTeam;
    } else {
        if (!window.awayTeam) {
            window.awayTeam = {
                defenceType: 'zonal',
                rough: 'clean',
                morale: 'normal'
            };
        }
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

    const tacticSelect = createDummySelect();
    const defenseSelect = createDefenceTypeSelector(team, onChange);
    const roughSelect = createRoughSelector(team, onChange);
    const moraleSelect = createMoraleSelector(team, onChange);

    if (team === window.homeTeam) {
        window.homeDefenceTypeSelect = defenseSelect;
        window.homeRoughSelect = roughSelect;
        window.homeMoraleSelect = moraleSelect;
    }
    if (team === window.awayTeam) {
        window.awayDefenceTypeSelect = defenseSelect;
        window.awayRoughSelect = roughSelect;
        window.awayMoraleSelect = moraleSelect;
    }

    // Создаем блок с таблицей 3x4 (заголовок + лейблы + селекторы + отступ)
    const block = document.createElement('div');
    block.style.marginBottom = '8px';

    // Заголовок в стиле игры
    const headerTable = document.createElement('table');
    headerTable.style.cssText = `
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 2px;
    `;

    const headerRow = document.createElement('tr');
    headerRow.style.backgroundColor = 'rgb(0, 102, 0)';

    const headerCell = document.createElement('td');
    headerCell.className = 'lh18 txtw';
    headerCell.style.cssText = `
        text-align: center;
        padding: 4px;
        color: white;
        font-weight: bold;
        font-size: 11px;
    `;
    headerCell.textContent = 'Тактические настройки';

    headerRow.appendChild(headerCell);
    headerTable.appendChild(headerRow);

    // Основная таблица 3x4
    const table = document.createElement('table');
    table.id = team === window.homeTeam ? 'vs-home-settings-table' : 'vs-away-settings-table';
    table.style.cssText = `
        width: 100%;
        border-collapse: collapse;
        margin: 0 auto;
    `;

    const teamPrefix = team === window.homeTeam ? 'home' : 'away';

    // Функция для применения стилей к селекторам
    const applySelectStyles = (selectElement) => {
        if (selectElement.tagName === 'SELECT') {
            selectElement.style.cssText = `
                width: 120px;
                height: 19px;
                font-size: 11px;
                border: 1px solid rgb(170, 170, 170);
                border-radius: 0;
                padding: 1px 4px;
                box-sizing: border-box;
                background: transparent;
                color: rgb(68, 68, 68);
                line-height: 16px;
                margin: 1px auto;
                display: block;
            `;
        }
    };

    // Применяем стили ко всем селекторам
    applySelectStyles(formationSelector);
    applySelectStyles(tacticSelect);
    applySelectStyles(styleSelector);
    applySelectStyles(defenseSelect);
    applySelectStyles(roughSelect);
    applySelectStyles(moraleSelect);

    // Строка 1: Заголовки (Формация | Тактика | Стиль)
    const labelRow1 = document.createElement('tr');
    labelRow1.id = `vs-${teamPrefix}-labels-row1`;
    labelRow1.style.height = '22px';

    const createLabelCell = (text) => {
        const td = document.createElement('td');
        td.className = 'lh22 txt';
        td.style.cssText = `
            text-align: center;
            font-size: 11px;
            font-weight: bold;
            line-height: 22px;
            min-height: 22px;
            width: 33.33%;
            padding: 0 4px;
        `;
        td.textContent = text;
        return td;
    };

    labelRow1.appendChild(createLabelCell('Формация'));
    labelRow1.appendChild(createLabelCell('Тактика'));
    labelRow1.appendChild(createLabelCell('Стиль'));

    // Строка 2: Селекторы (формация | тактика | стиль)
    const selectRow1 = document.createElement('tr');
    selectRow1.id = `vs-${teamPrefix}-selects-row1`;
    selectRow1.style.height = '22px';

    const createSelectCell = (selectElement) => {
        const td = document.createElement('td');
        td.className = 'txt';
        td.style.cssText = `
            text-align: center;
            vertical-align: middle;
            padding: 1px 4px;
            width: 33.33%;
        `;
        td.appendChild(selectElement);
        return td;
    };

    selectRow1.appendChild(createSelectCell(formationSelector));
    selectRow1.appendChild(createSelectCell(tacticSelect));
    selectRow1.appendChild(createSelectCell(styleSelector));

    // Строка 3: Заголовки (Защита | Грубость | Настрой)
    const labelRow2 = document.createElement('tr');
    labelRow2.id = `vs-${teamPrefix}-labels-row2`;
    labelRow2.style.height = '22px';

    labelRow2.appendChild(createLabelCell('Защита'));
    labelRow2.appendChild(createLabelCell('Грубость'));
    labelRow2.appendChild(createLabelCell('Настрой'));

    // Строка 4: Селекторы (защита | грубость | настрой)
    const selectRow2 = document.createElement('tr');
    selectRow2.id = `vs-${teamPrefix}-selects-row2`;
    selectRow2.style.height = '22px';

    selectRow2.appendChild(createSelectCell(defenseSelect));
    selectRow2.appendChild(createSelectCell(roughSelect));
    selectRow2.appendChild(createSelectCell(moraleSelect));

    // Собираем таблицу
    table.appendChild(labelRow1);
    table.appendChild(selectRow1);
    table.appendChild(labelRow2);
    table.appendChild(selectRow2);

    // Собираем блок
    block.appendChild(headerTable);
    block.appendChild(table);

    team._styleSelector = styleSelector;
    team._formationSelector = formationSelector;

    // Добавляем кнопку подсказки для стиля игры
    setTimeout(() => {
        const styleCell = table.querySelector('tr:nth-child(1) td:nth-child(3)'); // Ячейка "Стиль"
        if (styleCell) {
            addHelpButton(styleCell, 'collision', 'Коллизии стилей');
        }
    }, 100);

    return block;
}

// Вспомогательные функции для определения типа турнира
function parseMatchInfo(html) {
    // Расширенный список возможных названий турниров
    const typeRegex = /(?:Чемпионат|Кубок межсезонья|Кубок страны|Кубок вызова|Товарищеский матч|Конференция любительских клубов|КЛК|Лига Европы|Лига европейских чемпионов|Кубок азиатской конфедерации|Лига чемпионов Азии|Кубок африканской конфедерации|Лига чемпионов Африки|Кубок Южной Америки|Кубок Либертадорес|Кубок Сев\. и Центр\. Америки|Лига чемпионов Америки|Переходные матчи|Отборочные матчи)/i;
    const typeMatch = html.match(typeRegex);

    console.log('🔍 Поиск типа турнира в HTML:');
    console.log('  Найденное совпадение:', typeMatch ? typeMatch[0] : 'НЕ НАЙДЕНО');

    // Дополнительная диагностика - ищем все возможные упоминания турниров
    const allMatches = html.match(/(?:чемпионат|кубок|лига|конференция|товарищеский|матч|турнир)[^.]*?(?:матч|турнир|лига|кубок)/gi);
    console.log('  Все найденные упоминания турниров:', allMatches ? allMatches.slice(0, 5) : 'НЕ НАЙДЕНО');

    let tournamentType = null;
    if (typeMatch) {
        const t = typeMatch[0].toLowerCase().trim();
        console.log('  Обработка строки:', `"${t}"`);

        if (t.includes('чемпионат')) tournamentType = 'championship';
        else if (t.includes('межсезонья')) tournamentType = 'preseason_cup';
        else if (t.includes('страны')) tournamentType = 'national_cup';
        else if (t.includes('вызова')) tournamentType = 'challenge_cup';
        else if (t.includes('товарищеский')) tournamentType = 'friendly';
        else if (t.includes('конференция любительских') || t === 'клк') tournamentType = 'amators';
        else if (t.includes('переходные матчи')) tournamentType = 'championship'; // Переходные матчи = тип B
        else if (t.includes('отборочные матчи')) tournamentType = 'national_cup'; // Отборочные = тип C
        else if (t.includes('лига европы')) tournamentType = 'europa_league';
        else if (t.includes('европейских чемпионов')) tournamentType = 'champions_league_europe';
        else if (t.includes('азиатской конфедерации')) tournamentType = 'asian_confederation_cup';
        else if (t.includes('чемпионов азии')) tournamentType = 'asian_champions_league';
        else if (t.includes('африканской конфедерации')) tournamentType = 'african_confederation_cup';
        else if (t.includes('чемпионов африки')) tournamentType = 'african_champions_league';
        else if (t.includes('южной америки')) tournamentType = 'south_america_cup';
        else if (t.includes('либертадорес')) tournamentType = 'libertadores';
        else if (t.includes('сев. и центр. америки')) tournamentType = 'north_central_america_cup';
        else if (t.includes('чемпионов америки')) tournamentType = 'americas_champions_league';

        console.log('  Определенный тип турнира:', tournamentType);
    } else {
        console.log('  ❌ Тип турнира не найден в HTML');
        throw new Error('Неизвестный тип турнира');
    }
    return {
        tournamentType
    };
}

function detectTournamentTypeFromPage() {
    try {
        const matchInfo = parseMatchInfo(document.body.innerHTML);
        const tournamentType = matchInfo.tournamentType;

        // Конвертируем типы турниров в типы физ форм
        const typeMapping = {
            'friendly': 'friendly',              // Товарищеский
            'championship': 'typeB',             // Чемпионат
            'preseason_cup': 'typeB',            // Кубок межсезонья
            'national_cup': 'typeC',             // Кубок страны
            'challenge_cup': 'typeC',            // Кубок вызова
            'amators': 'typeB_amateur',          // Конференция любительских
            // Международные турниры с бонусом дома
            'europa_league': 'typeC_international',
            'champions_league_europe': 'typeC_international',
            'asian_confederation_cup': 'typeC_international',
            'asian_champions_league': 'typeC_international',
            'african_confederation_cup': 'typeC_international',
            'african_champions_league': 'typeC_international',
            'south_america_cup': 'typeC_international',
            'libertadores': 'typeC_international',
            'north_central_america_cup': 'typeC_international',
            'americas_champions_league': 'typeC_international'
        };

        return typeMapping[tournamentType] || 'typeC';
    } catch (e) {
        console.warn('[TournamentType] Failed to detect, using default typeC', e);
        return 'typeC';
    }
}

function getTournamentType() {
    const select = document.getElementById('vs_tournament_type');
    if (select) {
        return select.value;
    }

    // Если селектор еще не создан, пытаемся определить автоматически
    return detectTournamentTypeFromPage();
}

// --- MAIN LOGIC ---
(function () {
    'use strict';

    // Функция для получения order_day из URL страницы
    function getOrderDayFromCurrentPage() {
        console.log('[OrderDay] Извлечение order_day из URL');
        console.log('Текущий URL:', window.location.href);

        const urlParams = new URLSearchParams(window.location.search);

        // Проверяем различные возможные параметры
        const day = urlParams.get('day');           // основной параметр в previewmatch.php
        const preview = urlParams.get('preview');   // альтернативный параметр
        const orderDay = urlParams.get('order_day'); // прямой параметр
        const matchId = urlParams.get('match_id');   // для контекста

        console.log('URL параметры:', {
            day: day || 'не найден',
            preview: preview || 'не найден',
            order_day: orderDay || 'не найден',
            match_id: matchId || 'не найден'
        });

        // Приоритет: day > preview > order_day
        const result = day || preview || orderDay;

        console.log('Итоговый Order Day:', result || 'НЕ ОПРЕДЕЛЕН');
        console.log('Источник значения:',
            day ? 'параметр day' :
            preview ? 'параметр preview' :
            orderDay ? 'параметр order_day' :
            'не найден'
        );

        return result;
    }



    // УДАЛЕНО: Функция loadLineupFromOrder - загрузка составов из sending form исключена

    // Создание кнопки для открытия калькулятора в новой вкладке
    // Создание кнопки для открытия калькулятора в новой вкладке
    function createCalculatorButton() {
        console.group('[ButtonCreate] Создание навигации в заголовке');

        // Вместо создания кнопки, добавляем навигацию в заголовок
        createHeaderNavigation();

        console.log('Навигация добавлена в заголовок');
        console.groupEnd();

        // Возвращаем пустой div, чтобы не ломать существующую логику
        const placeholder = document.createElement('div');
        placeholder.style.display = 'none';
        return placeholder;
    }



    async function init() {
        console.group('[INIT] Инициализация VF Liga Calculator');

        // Диагностика localStorage
        console.log('Диагностика localStorage:');
        console.log('vs_auto_open_calculator:', localStorage.getItem('vs_auto_open_calculator'));
        console.log('vs_calculator_mode:', localStorage.getItem('vs_calculator_mode'));
        console.log('vs_manual_preview_mode:', localStorage.getItem('vs_manual_preview_mode'));
        console.log('window.location.hash:', window.location.hash);

        console.log('Замена иконок команд...');
        replaceTeamIcons();

        // Проверяем, находимся ли мы в режиме калькулятора
        // Логика: калькулятор открывается если:
        // 1. Пользователь включил "Всегда калькулятор" ИЛИ
        // 2. Есть ручной переход к калькулятору (hash/storage)
        const autoOpenCalculator = localStorage.getItem('vs_auto_open_calculator') === 'true';
        const manualCalculatorMode = localStorage.getItem('vs_calculator_mode') === 'true' ||
                                   window.location.hash === '#calculator';

        // Если нет автоматического режима и нет явного hash, очищаем ручной режим
        if (!autoOpenCalculator && window.location.hash !== '#calculator') {
            console.log('Очищаем ручной режим калькулятора (нет автоматического режима)');
            localStorage.removeItem('vs_calculator_mode');
        }

        const isCalculatorMode = autoOpenCalculator || manualCalculatorMode;

        console.log('Детальная проверка режима работы:');
        console.log('Автоматическое открытие калькулятора:', autoOpenCalculator);
        console.log('Ручной режим калькулятора (hash/storage):', manualCalculatorMode);
        console.log('Итоговый режим:', isCalculatorMode ? 'КАЛЬКУЛЯТОР' : 'ПРЕВЬЮ');
        console.log('Полный URL:', window.location.href);

        if (!isCalculatorMode) {
            console.log('Режим превью - создаем только кнопки');
            // Если не в режиме калькулятора, показываем только кнопки
            const buttonContainer = createCalculatorButton();
            const comparisonTable = document.querySelector('table.tobl');
            if (comparisonTable && comparisonTable.parentNode) {
                comparisonTable.parentNode.insertBefore(buttonContainer, comparisonTable.nextSibling);
                console.log('Кнопки добавлены на страницу превью');
            } else {
                console.warn('Не найдена таблица для вставки кнопок');
            }
            console.groupEnd();
            return;
        }

        console.log('🧮 Режим калькулятора - инициализируем полный интерфейс');

        // Парсим рейтинги команд ДО удаления строк и сохраняем глобально
        window.cachedTeamRatings = parseTeamsRatingFromPage();
        console.log('Рейтинги команд:', window.cachedTeamRatings);

        // Удаляем ненужные строки из таблицы статистики
        removeUnwantedStatsRows();

        // Режим калькулятора - показываем полный интерфейс
        const teamLinks = document.querySelectorAll('table.tobl a[href^="roster.php?num="]');
        console.log('🔗 Найдено ссылок на команды:', teamLinks.length);

        if (teamLinks.length < 2) {
            console.error('Недостаточно ссылок на команды для инициализации калькулятора');
            console.groupEnd();
            return;
        }

        const homeTeamId = new URL(teamLinks[0].href).searchParams.get('num');
        const awayTeamId = new URL(teamLinks[1].href).searchParams.get('num');
        console.log('ID команды хозяев:', homeTeamId);
        console.log('ID команды гостей:', awayTeamId);

        if (!homeTeamId || !awayTeamId) {
            console.error('Не удалось извлечь ID команд');
            console.groupEnd();
            return;
        }

        let tournamentType;
        try {
            console.log('Определение типа турнира...');
            const info = parseMatchInfo(document.body.innerHTML);
            tournamentType = info.tournamentType;
            console.log('Тип турнира:', tournamentType);
        } catch (e) {
            console.error('Ошибка при определении типа турнира:', e.message);
            alert(e.message);
            console.groupEnd();
            return;
        }

        console.log('Загрузка данных команд...');
        const [homePlayers, awayPlayers, homeAtmosphere, awayAtmosphere] = await Promise.all([
            loadTeamRoster(homeTeamId, tournamentType),
            loadTeamRoster(awayTeamId, tournamentType),
            loadTeamAtmosphere(homeTeamId),
            loadTeamAtmosphere(awayTeamId)
        ]);

        console.log('Загружено игроков хозяев:', homePlayers.length);
        console.log('Загружено игроков гостей:', awayPlayers.length);
        console.log('Атмосфера хозяев:', homeAtmosphere);
        console.log('Атмосфера гостей:', awayAtmosphere);
        const oldUI = document.getElementById('vsol-calculator-ui');
        if (oldUI) oldUI.remove();
        const ui = createUI(homeTeamId, awayTeamId, homePlayers, awayPlayers, homeAtmosphere, awayAtmosphere);

        // Добавляем навигацию в заголовок (если еще не добавлена)
        createHeaderNavigation();

        const comparisonTable = document.querySelector('table.tobl');
        if (comparisonTable && comparisonTable.parentNode) {
            comparisonTable.parentNode.insertBefore(ui, comparisonTable.nextSibling);
        }

        // Добавляем кнопку пересчета сыгранности
        setTimeout(() => {
            addRecalculateSynergyButton();
        }, 2000);

        console.log('Инициализация калькулятора завершена');
        console.groupEnd();
    }




    function createWeatherUI(defaultWeather, defaultTemp, iconUrl, stadiumCapacity = 0) {
        const container = document.createElement('div');
        container.id = 'vsol-weather-ui';

        // Создаем структуру в стиле v1.2
        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 2px;">
                <tr style="background-color: rgb(0, 102, 0);">
                    <td class="lh18 txtw" style="text-align: center; padding: 4px; color: white; font-weight: bold; font-size: 11px;">
                        Информация о матче
                    </td>
                </tr>
            </table>
            <table style="border-collapse: collapse;">
                <tbody>
                    <tr style="background-color: rgb(0, 102, 0);">
                        <td class="lh18 txtw" style="width: 80px; text-align: center; padding: 4px; color: white; font-weight: bold; font-size: 11px;">
                            <b>Параметр</b>
                        </td>
                        <td class="lh18 txtw" style="text-align: center; padding: 4px; color: white; font-weight: bold; font-size: 11px;">
                            <b>Значение</b>
                        </td>
                    </tr>
                    <tr>
                        <td class="qt" style="height: 20px; background-color: rgb(255, 255, 187); text-align: center; font-family: Courier New, monospace; font-size: 11px;" title="Погодные условия">
                            ${iconUrl ? `<img src="${iconUrl}" height="16" style="vertical-align: top;">` : 'Погода'}
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255);">
                            <select id="vsol-weather-select" style="width: 271px; height: 20px; font-size: 11px; border: 1px solid rgb(170, 170, 170); padding: 2px 4px; box-sizing: border-box; background: white;">
                                <option value="очень жарко">очень жарко</option>
                                <option value="жарко">жарко</option>
                                <option value="солнечно">солнечно</option>
                                <option value="облачно">облачно</option>
                                <option value="пасмурно">пасмурно</option>
                                <option value="дождь">дождь</option>
                                <option value="снег">снег</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <td class="qt" style="height: 20px; background-color: rgb(255, 255, 187); text-align: center; font-family: Courier New, monospace; font-size: 11px;" title="Температура воздуха">
                            Темп
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255);">
                            <select id="vsol-temperature-select" style="width: 271px; height: 20px; font-size: 11px; border: 1px solid rgb(170, 170, 170); padding: 2px 4px; box-sizing: border-box; background: white;">
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <td class="qt" style="height: 20px; background-color: rgb(255, 255, 187); text-align: center; font-family: Courier New, monospace; font-size: 11px;" title="Посещаемость стадиона">
                            <img src="https://cdn-icons-png.flaticon.com/128/1259/1259792.png" height="16" style="vertical-align: top;">
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255); padding: 2px 4px;">
                            <input type="number" id="vs_home_attendance" min="0" max="${stadiumCapacity}" value="${stadiumCapacity}"
                                   style="width: 120px; height: 16px; font-size: 11px; border: 1px solid rgb(170, 170, 170); padding: 2px; box-sizing: border-box; background: white;">
                            <span style="font-size: 11px; color: rgb(102, 102, 102); margin-left: 4px;">/ ${stadiumCapacity}</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        `;

        const weatherSel = container.querySelector('#vsol-weather-select');
        const tempSel = container.querySelector('#vsol-temperature-select');

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
                opt.value = t;
                opt.textContent = t + '°';
                tempSel.appendChild(opt);
            }
            if (selectedTemp && parseInt(selectedTemp) >= min && parseInt(selectedTemp) <= max) {
                tempSel.value = selectedTemp;
            }
        }

        // Устанавливаем значения по умолчанию
        const WEATHER_OPTIONS = ["очень жарко", "жарко", "солнечно", "облачно", "пасмурно", "дождь", "снег"];
        weatherSel.value = defaultWeather && WEATHER_OPTIONS.includes(defaultWeather) ? defaultWeather : WEATHER_OPTIONS[0];
        fillTempOptions(weatherSel.value, defaultTemp);

        weatherSel.addEventListener('change', function () {
            fillTempOptions(weatherSel.value);
        });

        const mainTable = document.querySelector('table.wst.tobl');
        if (mainTable && mainTable.parentNode) {
            mainTable.parentNode.insertBefore(container, mainTable.nextSibling);
        } else {
            document.body.prepend(container);
        }

        // Добавляем кнопки подсказок к блоку погоды
        setTimeout(() => {
            // Подсказка для погоды
            const weatherRow = container.querySelector('tr:nth-child(2)');
            if (weatherRow) {
                const weatherCell = weatherRow.querySelector('td.qt');
                if (weatherCell) {
                    addHelpButton(weatherCell, 'weather', 'Влияние погоды');
                }
            }
        }, 100);

        return {
            container,
            getWeather: () => weatherSel.value,
            getTemperature: () => Number(tempSel.value),
            setWeather: (w) => {
                weatherSel.value = w;
                fillTempOptions(w);
            },
            setTemperature: (t) => {
                tempSel.value = t;
            }
        };
    }

    // Функция для удаления ненужных строк из таблицы статистики
    function removeUnwantedStatsRows() {
        const mainTable = document.querySelector('table.wst.tobl');
        if (!mainTable) return;

        const rowsToRemove = [
            'Стоимость команд',
            'Рейтинг силы команд',
            'Сумма сил 17-ти лучших игроков',
            'Сумма сил 14-ти лучших игроков',
            'Сумма сил 11-ти лучших игроков'
        ];

        const rows = mainTable.querySelectorAll('tr');
        rows.forEach(row => {
            const rowText = row.textContent.trim();
            if (rowsToRemove.some(textToRemove => rowText.includes(textToRemove))) {
                console.log('Удаляем строку:', rowText);
                row.remove();
            }
        });
    }

    function extractPlayersFromPlrdat(plrdat) {
        return plrdat.map(p => ({
            id: p[0],
            name: `${p[2]} ${p[3]}`,
            nat_id: p[4],        // ID национальности для Chemistry системы
            nat: p[5],           // Название национальности для Chemistry системы
            mainPos: p[6],
            secondPos: p[7],
            age: p[9],
            baseStrength: p[10],
            fatigue: p[12],
            form: p[13],
            form_mod: p[14],
            realStr: p[15],
            baseRealStr: p[15],  // Сохраняем оригинальное значение для модификации физ формой
            abilities: `${p[16]} ${p[17]} ${p[18]} ${p[19]}`,
            real_status: p[31],
            real_sign: p[32],
            hidden_style: p[33], // Скрытый стиль игрока для Chemistry системы
            styleKnowledge: 1.0, // Модификатор изученности стиля (по умолчанию 100% = 1.0)
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
            } catch (e) {
                console.log('Ошибка парсинга игрока:', e, m[1]);
            }
        }
        
        // Отладочное логирование для Chemistry системы
        if (items.length > 0) {
            const firstPlayer = items[0];
            console.log('[CHEMISTRY] Первый игрок - индексы для chemistry:', {
                'p[0] id': firstPlayer[0],
                'p[2] name': firstPlayer[2],
                'p[3] surname': firstPlayer[3],
                'p[4] nat_id': firstPlayer[4],
                'p[5] nat': firstPlayer[5],
                'p[33] hidden_style': firstPlayer[33],
                'total_length': firstPlayer.length
            });
        }
        
        console.log('[CHEMISTRY] Extracted data:', items);
        return items;
    }

    function loadTeamRoster(teamId, tournamentType) {
        const sortMap = {
            friendly: 1,
            preseason_cup: 2,
            championship: 3,
            national_cup: 4,
            amators: 10,
            challenge_cup: 47,
            // Международные турниры
            champions_league_europe: 8,
            europa_league: 14,
            asian_champions_league: 26,
            asian_confederation_cup: 27,
            african_champions_league: 28,
            african_confederation_cup: 29,
            libertadores: 30,
            south_america_cup: 31,
            americas_champions_league: 32,
            north_central_america_cup: 48
        };
        const sort = sortMap[tournamentType];
        if (!sort) return Promise.reject(new Error('Неизвестный тип турнира'));
        const url = `${SITE_CONFIG.BASE_URL}/roster.php?num=${teamId}&sort=${sort}`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: function (response) {
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
                        
                        // Отладочное логирование для Chemistry системы
                        if (players.length > 0) {
                            console.log('[CHEMISTRY] Пример игрока:', {
                                name: players[0].name,
                                nat_id: players[0].nat_id,
                                nat: players[0].nat,
                                hidden_style: players[0].hidden_style
                            });
                        }
                        
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

    function loadTeamAtmosphere(teamId) {
        const url = `${SITE_CONFIG.BASE_URL}/roster_s.php?num=${teamId}`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: function (response) {
                    if (response.status !== 200) {
                        console.warn('[Atmosphere] Failed to load roster_s for team', teamId);
                        resolve(0);
                        return;
                    }
                    try {
                        const html = response.responseText;
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, 'text/html');

                        // Ищем строку с "Атмосфера в команде:"
                        const rows = doc.querySelectorAll('tr');
                        for (const row of rows) {
                            const text = row.textContent;
                            if (text.includes('Атмосфера в команде:')) {
                                // Ищем значение в формате "+2%" или "-1%"
                                const match = text.match(/([+-]?\d+)%/);
                                if (match) {
                                    const percent = parseInt(match[1], 10);
                                    const atmosphere = percent / 100; // Конвертируем в 0.02, -0.01 и т.д.
                                    console.log('[Atmosphere] Parsed for team', teamId, ':', atmosphere);
                                    resolve(atmosphere);
                                    return;
                                }
                            }
                        }

                        console.log('[Atmosphere] Not found for team', teamId, ', using default 0');
                        resolve(0);
                    } catch (error) {
                        console.error('[Atmosphere] Parse error for team', teamId, ':', error);
                        resolve(0);
                    }
                },
                onerror: function (err) {
                    console.error('[Atmosphere] Request error for team', teamId, ':', err);
                    resolve(0);
                }
            });
        });
    }


    function getLastMatchForTeam(teamId) {
        return new Promise((resolve, reject) => {
            const url = `${SITE_CONFIG.BASE_URL}/roster_m.php?num=${teamId}`;
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: function (response) {
                    if (response.status !== 200) {
                        reject(new Error('Failed to load roster_m'));
                        return;
                    }

                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');

                        // Ищем все строки матчей (только viewmatch.php - это сыгранные матчи)
                        const matchLinks = Array.from(doc.querySelectorAll('a[href*="viewmatch.php"]'));

                        // Ищем последний сыгранный матч (идем с конца списка)
                        for (let i = matchLinks.length - 1; i >= 0; i--) {
                            const link = matchLinks[i];
                            const scoreText = link.textContent.trim();

                            // Пропускаем несыгранные матчи (счет ?:?)
                            if (scoreText === '?:?') {
                                continue;
                            }

                            const href = link.getAttribute('href');
                            const match = href.match(/day=(\d+)&match_id=(\d+)/);
                            if (match) {
                                resolve({ day: match[1], matchId: match[2] });
                                return;
                            }
                        }

                        resolve(null);
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

    function getMatchLineup(day, matchId, teamId) {
        return new Promise((resolve, reject) => {
            const url = `${SITE_CONFIG.BASE_URL}/viewmatch.php?day=${day}&match_id=${matchId}`;

            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: function (response) {
                    if (response.status !== 200) {
                        reject(new Error('Failed to load viewmatch'));
                        return;
                    }

                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');

                        // Определяем, дома или в гостях играла команда
                        const teamLinks = doc.querySelectorAll('table.tobl a[href^="roster.php?num="]');
                        let isHome = false;

                        if (teamLinks.length >= 2) {
                            const homeTeamId = new URL(teamLinks[0].href, SITE_CONFIG.BASE_URL).searchParams.get('num');
                            isHome = (homeTeamId === String(teamId));
                        }

                        // Извлекаем футболки
                        const prefix = isHome ? 'gif_0_' : 'gif_1_';
                        const shirts = {};

                        // Пробуем разные селекторы
                        let shirtDivs = doc.querySelectorAll(`div.shirt.qf[id^="${prefix}"]`);

                        if (shirtDivs.length === 0) {
                            // Пробуем без класса qf
                            shirtDivs = doc.querySelectorAll(`div.shirt[id^="${prefix}"]`);
                        }

                        if (shirtDivs.length === 0) {
                            // Пробуем просто по id
                            shirtDivs = doc.querySelectorAll(`div[id^="${prefix}"]`);
                        }

                        if (shirtDivs.length === 0) {
                            // Пробуем найти все div с классом shirt
                            const allShirts = doc.querySelectorAll('div.shirt');


                            if (allShirts.length === 0) {
                                // Проверяем что вообще есть на странице
                                const allDivs = doc.querySelectorAll('div');


                                // Проверяем есть ли таблица с составом
                                const tables = doc.querySelectorAll('table.tobl');


                                // Ищем любые div с id содержащим gif
                                const gifDivs = Array.from(allDivs).filter(d => d.id && d.id.includes('gif'));

                                if (gifDivs.length > 0) {
                                    console.log('[Shirts] Sample gif div:', {
                                        id: gifDivs[0].id,
                                        className: gifDivs[0].className,
                                        textContent: gifDivs[0].textContent,
                                        style: gifDivs[0].getAttribute('style')?.substring(0, 100)
                                    });
                                }
                            } else {
                                console.log('[Shirts] Sample shirt div:', allShirts[0] ? {
                                    id: allShirts[0].id,
                                    className: allShirts[0].className,
                                    innerHTML: allShirts[0].innerHTML.substring(0, 100)
                                } : 'none');
                            }
                        }

                        // Если нашли элементы через querySelector
                        if (shirtDivs.length > 0) {
                            shirtDivs.forEach((div, idx) => {
                                const position = div.textContent.trim();
                                const style = div.getAttribute('style');
                                const bgMatch = style ? style.match(/background-image:\s*url\(['"]*([^'"()]+)['"]*\)/) : null;

                                if (idx < 3) {
                                    console.log('[Shirts] Processing div #' + idx + ':', {
                                        id: div.id,
                                        position,
                                        styleLength: style ? style.length : 0,
                                        bgMatch: bgMatch ? bgMatch[1] : null
                                    });
                                }

                                if (bgMatch) {
                                    const shirtUrl = bgMatch[1];
                                    if (!shirts.gk && position === 'GK') {
                                        shirts.gk = shirtUrl;

                                    } else if (!shirts.field && position !== 'GK') {
                                        shirts.field = shirtUrl;

                                    }
                                }
                            });
                        } else {
                            // Если не нашли через querySelector, парсим сырой HTML

                            const htmlText = response.responseText;

                            // Ищем паттерн: id="gif_X_Y" ... background-image:url('pics/shirts/sh_XXX_sm.png')>POSITION<
                            const shirtPattern = new RegExp(`id="${prefix}\\d+"[^>]*?background-image:url\\(['"]*([^'"()]+)['"]*\\)[^>]*?>(\\w+)<`, 'g');
                            const matches = [...htmlText.matchAll(shirtPattern)];



                            if (matches.length > 0) {
                                matches.forEach((match, idx) => {
                                    if (idx < 3) {
                                        console.log('[Shirts] Pattern match #' + idx + ':', {
                                            shirtUrl: match[1],
                                            position: match[2]
                                        });
                                    }

                                    const shirtUrl = match[1];
                                    const position = match[2];

                                    if (position) {
                                        if (!shirts.gk && position === 'GK') {
                                            shirts.gk = shirtUrl;

                                        } else if (!shirts.field && position !== 'GK') {
                                            shirts.field = shirtUrl;

                                        }
                                    }
                                });
                            }
                        }


                        resolve(shirts);
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

    async function getTeamShirts(teamId) {


        // Проверяем кэш
        const cached = getCachedShirts(teamId);
        if (cached) {

            return cached;
        }

        try {
            // Получаем последний матч
            const lastMatch = await getLastMatchForTeam(teamId);

            if (!lastMatch) {

                return { gk: DEFAULT_GK_SHIRT, field: DEFAULT_SHIRT };
            }



            // Получаем расстановку
            const shirts = await getMatchLineup(lastMatch.day, lastMatch.matchId, teamId);



            // Если не нашли футболки, используем дефолтные
            if (!shirts.gk) {
                console.warn('[Shirts] No GK shirt found, using default');
                shirts.gk = DEFAULT_GK_SHIRT;
            }
            if (!shirts.field) {
                console.warn('[Shirts] No field shirt found, using default');
                shirts.field = DEFAULT_SHIRT;
            }

            // Кэшируем
            setCachedShirts(teamId, shirts);

            return shirts;
        } catch (error) {
            console.error('[Shirts] Error getting shirts for team', teamId, error);
            return { gk: DEFAULT_GK_SHIRT, field: DEFAULT_SHIRT };
        }
    }


    /**
     * Рассчитывает итоговую силу игрока с модификаторами
     */
    function calculatePlayerStrength(player, matchPosition, physicalFormId) {
        const baseStrength = player.strength;
        const modifiers = {};

        // Модификатор физической формы
        const formCoef = getPhysicalFormCoefficient(physicalFormId);
        modifiers.form = {
            name: 'Физическая форма',
            coefficient: formCoef,
            value: baseStrength * formCoef - baseStrength
        };

        // Модификатор усталости (если есть данные)
        let fatigueCoef = 1.0;
        if (player.fatigue !== undefined) {
            fatigueCoef = getFatigueCoefficient(player.fatigue);
        }
        modifiers.fatigue = {
            name: 'Усталость',
            coefficient: fatigueCoef,
            value: baseStrength * fatigueCoef - baseStrength
        };

        // Модификатор позиции
        const positionCoef = getPositionModifier(player.position1, player.position2, matchPosition);
        modifiers.position = {
            name: 'Позиция',
            coefficient: positionCoef,
            value: baseStrength * positionCoef - baseStrength
        };

        // Модификатор реальности (если игрок не реальный)
        let realityCoef = 1.0;
        if (player.isReal === false) {
            realityCoef = 0.8; // Предполагаемый штраф для нереальных игроков
        }
        modifiers.reality = {
            name: 'Реальность',
            coefficient: realityCoef,
            value: baseStrength * realityCoef - baseStrength
        };

        // Итоговый расчет
        const finalStrength = Math.round(baseStrength * formCoef * fatigueCoef * positionCoef * realityCoef);

        return {
            baseStrength,
            finalStrength,
            modifiers
        };
    }

    /**
     * Получает коэффициент физической формы
     */
    function getPhysicalFormCoefficient(formId) {
        const formCoefficients = {
            'excellent': 1.05,
            'good': 1.02,
            'normal': 1.0,
            'poor': 0.98,
            'terrible': 0.95
        };
        return formCoefficients[formId] || 1.0;
    }

    /**
     * Получает коэффициент усталости
     */
    function getFatigueCoefficient(fatigue) {
        // Усталость от 0 (свежий) до 100 (очень уставший)
        if (fatigue <= 20) return 1.0;
        if (fatigue <= 40) return 0.98;
        if (fatigue <= 60) return 0.95;
        if (fatigue <= 80) return 0.92;
        return 0.88;
    }

    /**
     * Получает полные данные игрока с расчетом всех бонусов
     * @param {Object} player - Данные игрока
     * @param {string} matchPosition - Позиция в матче
     * @param {string} physicalFormId - ID физической формы
     * @param {string} team - Команда ('home' или 'away')
     * @param {number} playerIndex - Индекс игрока в составе
     * @returns {Object} Полные данные игрока с бонусами
     */
    function getPlayerFullData(player, matchPosition, physicalFormId, team, playerIndex) {
        if (!player) return null;

        // Базовые расчеты силы
        const baseStr = Number(player.baseStrength) || Number(player.realStr) || 0;
        const physicalFormModifier = getPhysicalFormModifier(physicalFormId);
        const fatigueModifier = getFatigueBonus(Number(player.fatigue) || 0);
        const realityModifier = getRealityBonus(player.real_status, player.real_sign);
        const positionModifier = getPositionModifier(player.mainPos, player.secondPos, matchPosition);
        
        const calculatedStr = Math.round(baseStr * physicalFormModifier * fatigueModifier * realityModifier * positionModifier);

        // Расчет бонусов
        const contribution = {
            captain: 0,
            synergy: 0,
            chemistry: 0,
            morale: 0,
            atmosphere: 0,
            defence: 0,
            rough: 0,
            leadership: 0
        };

        // Бонус капитана (если игрок капитан)
        const captainSelect = document.getElementById(`vs-${team}-captain`);
        if (captainSelect && captainSelect.value === String(player.id)) {
            contribution.captain = Math.round(calculatedStr * 0.15); // 15% бонус капитана
        }

        // Бонус синергии
        const synergyInputs = document.querySelectorAll(`#vs-${team}-synergy input`);
        let synergyTotal = 0;
        synergyInputs.forEach(input => {
            synergyTotal += Number(input.value) || 0;
        });
        contribution.synergy = Math.round(synergyTotal * 0.1);

        // Бонус морали
        const moraleSelect = document.getElementById(`vs-${team}-morale`);
        if (moraleSelect) {
            const moraleValue = moraleSelect.value;
            if (moraleValue === 'super') {
                contribution.morale = Math.round(calculatedStr * 0.27);
            } else if (moraleValue === 'rest') {
                contribution.morale = Math.round(calculatedStr * -0.1);
            }
        }

        // Бонус атмосферы (для домашней команды)
        if (team === 'home') {
            const atmosphereSelect = document.getElementById('vs-home-atmosphere');
            if (atmosphereSelect) {
                const atmosphereValue = Number(atmosphereSelect.value) || 0;
                if (atmosphereValue >= 100) {
                    contribution.atmosphere = Math.round(calculatedStr * 0.15);
                } else if (atmosphereValue >= 90) {
                    contribution.atmosphere = Math.round(calculatedStr * 0.10);
                } else if (atmosphereValue >= 80) {
                    contribution.atmosphere = Math.round(calculatedStr * 0.05);
                } else {
                    contribution.atmosphere = Math.round(calculatedStr * 0.025);
                }
            }
        }

        // Общий вклад
        contribution.total = calculatedStr + 
            contribution.captain + 
            contribution.synergy + 
            contribution.chemistry + 
            contribution.morale + 
            contribution.atmosphere + 
            contribution.defence + 
            contribution.rough + 
            contribution.leadership;

        return {
            player,
            calculatedStr,
            contribution,
            modifiers: {
                physicalForm: physicalFormModifier,
                fatigue: fatigueModifier,
                reality: realityModifier,
                position: positionModifier
            }
        };
    }

    /**
     * Показывает подсказку при клике на футболку игрока в поле
     * @param {string} position - Позиция игрока
     * @param {string} team - Команда (home/away)
     * @param {Object} playerData - Данные игрока
     * @param {HTMLElement} shirtElement - Элемент футболки
     */
    function showFieldPlayerHint(position, team, playerData, shirtElement) {
        console.log('[FieldHints] showFieldPlayerHint вызвана');
        console.log('[FieldHints] position:', position);
        console.log('[FieldHints] team:', team);
        console.log('[FieldHints] playerData:', playerData);
        console.log('[FieldHints] shirtElement:', shirtElement);
        
        // Удаляем существующие подсказки
        removeExistingHints();

        if (!playerData || !playerData.player) {
            // Показываем базовую информацию о позиции
            showPositionOnlyHint(position, team, shirtElement);
            return;
        }

        const player = playerData.player;
        const matchPosition = playerData.matchPosition || position;
        const physicalFormId = playerData.physicalFormId || 'normal';
        const playerIndex = playerData.playerIndex || 0;
        
        // Создаем контейнер подсказки
        const hintDiv = document.createElement('div');
        hintDiv.className = 'vs-field-player-hint';
        hintDiv.style.cssText = `
            position: fixed;
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            border: 2px solid #007bff;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 8px 32px rgba(0, 123, 255, 0.3);
            z-index: 10000;
            max-width: 380px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.4;
            backdrop-filter: blur(10px);
            animation: fadeInScale 0.3s ease-out;
        `;

        // ОБНОВЛЕНО: Используем новую функцию getPlayerFullData
        const fullData = getPlayerFullData(player, matchPosition, physicalFormId, team, playerIndex);
        
        // Создаем содержимое подсказки
        const teamName = team === 'home' ? 'Хозяева' : 'Гости';
        const teamColor = team === 'home' ? '#28a745' : '#dc3545';
        
        hintDiv.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef;">
                <div style="width: 32px; height: 32px; background: ${teamColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; margin-right: 10px;">
                    ${position}
                </div>
                <div>
                    <div style="font-weight: bold; color: #212529; font-size: 14px;">${player.name}</div>
                    <div style="color: #6c757d; font-size: 10px;">${teamName} • ${player.age} лет</div>
                </div>
            </div>
            
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="color: #495057;">Базовая сила:</span>
                    <span style="font-weight: bold; color: #212529;">${player.strength || player.realStr}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="color: #495057;">Расчетная сила:</span>
                    <span style="font-weight: bold; color: ${fullData.calculatedStr >= (player.strength || player.realStr) ? '#28a745' : '#dc3545'}; font-size: 14px;">
                        ${fullData.calculatedStr}
                    </span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="color: #495057;">Общий вклад:</span>
                    <span style="font-weight: bold; color: #007bff; font-size: 14px;">
                        ${fullData.contribution.total}
                    </span>
                </div>
            </div>

            <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; margin-bottom: 12px;">
                <div style="font-weight: bold; color: #495057; margin-bottom: 6px; font-size: 11px;">Модификаторы силы:</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px;">
                    <div>Физ. форма: <span style="font-weight: bold;">×${fullData.modifiers.physicalForm.toFixed(3)}</span></div>
                    <div>Усталость: <span style="font-weight: bold;">×${fullData.modifiers.fatigue.toFixed(3)}</span></div>
                    <div>Позиция: <span style="font-weight: bold;">×${fullData.modifiers.position.toFixed(3)}</span></div>
                    <div>Реальность: <span style="font-weight: bold;">×${fullData.modifiers.reality.toFixed(3)}</span></div>
                </div>
            </div>

            <div style="background: #e3f2fd; padding: 8px; border-radius: 6px; margin-bottom: 12px;">
                <div style="font-weight: bold; color: #1976d2; margin-bottom: 6px; font-size: 11px;">Вклад в команду:</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px;">
                    ${fullData.contribution.captain ? `<div>Капитан: <span style="font-weight: bold; color: #28a745;">+${fullData.contribution.captain}</span></div>` : ''}
                    ${fullData.contribution.synergy ? `<div>Синергия: <span style="font-weight: bold; color: #28a745;">+${fullData.contribution.synergy}</span></div>` : ''}
                    ${fullData.contribution.chemistry ? `<div>Химия: <span style="font-weight: bold; color: #28a745;">+${fullData.contribution.chemistry}</span></div>` : ''}
                    ${fullData.contribution.morale ? `<div>Настрой: <span style="font-weight: bold; color: ${fullData.contribution.morale > 0 ? '#28a745' : '#dc3545'};">${fullData.contribution.morale > 0 ? '+' : ''}${fullData.contribution.morale}</span></div>` : ''}
                    ${fullData.contribution.atmosphere ? `<div>Атмосфера: <span style="font-weight: bold; color: #28a745;">+${fullData.contribution.atmosphere}</span></div>` : ''}
                    ${fullData.contribution.defence ? `<div>Защита: <span style="font-weight: bold; color: #28a745;">+${fullData.contribution.defence}</span></div>` : ''}
                    ${fullData.contribution.rough ? `<div>Грубость: <span style="font-weight: bold; color: #28a745;">+${fullData.contribution.rough}</span></div>` : ''}
                    ${fullData.contribution.leadership ? `<div>Лидерство: <span style="font-weight: bold; color: #28a745;">+${fullData.contribution.leadership}</span></div>` : ''}
                </div>
            </div>

            <div style="margin-bottom: 12px;">
                <div style="font-weight: bold; color: #495057; margin-bottom: 6px; font-size: 11px;">Позиции:</div>
                <div style="color: #212529;">
                    Основная: <span style="font-weight: bold;">${player.position1 || player.mainPos}</span>
                    ${(player.position2 || player.secondPos) ? `<br>Дополнительная: <span style="font-weight: bold;">${player.position2 || player.secondPos}</span>` : ''}
                    <br>В матче: <span style="font-weight: bold; color: ${matchPosition === (player.position1 || player.mainPos) || matchPosition === (player.position2 || player.secondPos) ? '#28a745' : '#ffc107'};">${matchPosition}</span>
                </div>
            </div>

            ${player.abilities && Array.isArray(player.abilities) && player.abilities.length > 0 ? `
                <div style="margin-bottom: 12px;">
                    <div style="font-weight: bold; color: #495057; margin-bottom: 6px; font-size: 11px;">Способности:</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                        ${player.abilities.map(ability => `
                            <span style="background: #e3f2fd; color: #1976d2; padding: 2px 6px; border-radius: 12px; font-size: 10px;">
                                ${ability}
                            </span>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <div style="text-align: center; margin-top: 12px; padding-top: 8px; border-top: 1px solid #e9ecef;">
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: #007bff; 
                    color: white; 
                    border: none; 
                    padding: 6px 12px; 
                    border-radius: 6px; 
                    cursor: pointer; 
                    font-size: 11px;
                    transition: background 0.2s ease;
                " onmouseover="this.style.background='#0056b3'" onmouseout="this.style.background='#007bff'">
                    Закрыть
                </button>
            </div>
        `;

        // Позиционируем подсказку
        document.body.appendChild(hintDiv);
        positionFieldHint(hintDiv, shirtElement);

        // Добавляем обработчик для закрытия по клику вне подсказки
        setTimeout(() => {
            document.addEventListener('click', function closeHint(e) {
                if (!hintDiv.contains(e.target)) {
                    hintDiv.remove();
                    document.removeEventListener('click', closeHint);
                }
            });
        }, 100);
    }

    /**
     * Показывает базовую подсказку для позиции без данных игрока
     */
    function showPositionOnlyHint(position, team, shirtElement) {
        const hintDiv = document.createElement('div');
        hintDiv.className = 'vs-field-position-hint';
        hintDiv.style.cssText = `
            position: fixed;
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            border: 2px solid #6c757d;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 8px 32px rgba(108, 117, 125, 0.3);
            z-index: 10000;
            max-width: 280px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.4;
            backdrop-filter: blur(10px);
            animation: fadeInScale 0.3s ease-out;
        `;

        const teamName = team === 'home' ? 'Хозяева' : 'Гости';
        const teamColor = team === 'home' ? '#28a745' : '#dc3545';
        const positionInfo = getPositionInfo(position);

        hintDiv.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef;">
                <div style="width: 32px; height: 32px; background: ${teamColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; margin-right: 10px;">
                    ${position}
                </div>
                <div>
                    <div style="font-weight: bold; color: #212529; font-size: 14px;">${positionInfo.name}</div>
                    <div style="color: #6c757d; font-size: 10px;">${teamName} • ${positionInfo.line}</div>
                </div>
            </div>
            
            <div style="color: #6c757d; text-align: center; margin: 12px 0;">
                <em>Игрок не выбран</em>
            </div>

            <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; margin-bottom: 12px;">
                <div style="font-weight: bold; color: #495057; margin-bottom: 6px; font-size: 11px;">О позиции:</div>
                <div style="color: #212529; font-size: 11px;">
                    ${positionInfo.description}
                </div>
            </div>

            <div style="text-align: center; margin-top: 12px; padding-top: 8px; border-top: 1px solid #e9ecef;">
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: #6c757d; 
                    color: white; 
                    border: none; 
                    padding: 6px 12px; 
                    border-radius: 6px; 
                    cursor: pointer; 
                    font-size: 11px;
                    transition: background 0.2s ease;
                " onmouseover="this.style.background='#545b62'" onmouseout="this.style.background='#6c757d'">
                    Закрыть
                </button>
            </div>
        `;

        document.body.appendChild(hintDiv);
        positionFieldHint(hintDiv, shirtElement);

        setTimeout(() => {
            document.addEventListener('click', function closeHint(e) {
                if (!hintDiv.contains(e.target)) {
                    hintDiv.remove();
                    document.removeEventListener('click', closeHint);
                }
            });
        }, 100);
    }

    /**
     * Позиционирует подсказку относительно футболки
     */
    function positionFieldHint(hintDiv, shirtElement) {
        const shirtRect = shirtElement.getBoundingClientRect();
        const hintRect = hintDiv.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = shirtRect.left + shirtRect.width / 2 - hintRect.width / 2;
        let top = shirtRect.top - hintRect.height - 10;

        // Корректируем позицию если выходит за границы экрана
        if (left < 10) left = 10;
        if (left + hintRect.width > viewportWidth - 10) left = viewportWidth - hintRect.width - 10;
        
        if (top < 10) {
            top = shirtRect.bottom + 10;
        }
        if (top + hintRect.height > viewportHeight - 10) {
            top = viewportHeight - hintRect.height - 10;
        }

        hintDiv.style.left = left + 'px';
        hintDiv.style.top = top + 'px';
    }

    /**
     * Генерирует HTML для модификаторов силы
     */
    function generateModifiersHTML(modifiers) {
        return Object.entries(modifiers).map(([key, data]) => {
            const color = data.coefficient >= 1 ? '#28a745' : data.coefficient >= 0.9 ? '#ffc107' : '#dc3545';
            const sign = data.coefficient >= 1 ? '+' : '';
            const change = ((data.coefficient - 1) * 100).toFixed(1);
            
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="color: #495057; font-size: 10px;">${data.name}:</span>
                    <span style="color: ${color}; font-weight: bold; font-size: 10px;">
                        ${data.coefficient.toFixed(3)} (${sign}${change}%)
                    </span>
                </div>
            `;
        }).join('');
    }

    /**
     * Получает информацию о позиции
     */
    function getPositionInfo(position) {
        const positions = {
            'GK': { name: 'Вратарь', line: 'Вратарская линия', description: 'Защищает ворота команды. Может брать мяч руками в штрафной площади.' },
            'LD': { name: 'Левый защитник', line: 'Линия защиты', description: 'Защищает левый фланг, участвует в атакующих действиях по флангу.' },
            'CD': { name: 'Центральный защитник', line: 'Линия защиты', description: 'Основа обороны команды. Отвечает за центральную зону защиты.' },
            'RD': { name: 'Правый защитник', line: 'Линия защиты', description: 'Защищает правый фланг, участвует в атакующих действиях по флангу.' },
            'LB': { name: 'Левый крайний защитник', line: 'Линия защиты', description: 'Активно участвует в атаке и обороне по левому флангу.' },
            'RB': { name: 'Правый крайний защитник', line: 'Линия защиты', description: 'Активно участвует в атаке и обороне по правому флангу.' },
            'SW': { name: 'Свободный защитник', line: 'Линия защиты', description: 'Играет за спиной у других защитников, подстраховывает.' },
            'LM': { name: 'Левый полузащитник', line: 'Линия полузащиты', description: 'Контролирует левый фланг в средней зоне поля.' },
            'CM': { name: 'Центральный полузащитник', line: 'Линия полузащиты', description: 'Связующее звено между защитой и атакой.' },
            'RM': { name: 'Правый полузащитник', line: 'Линия полузащиты', description: 'Контролирует правый фланг в средней зоне поля.' },
            'DM': { name: 'Опорный полузащитник', line: 'Линия полузащиты', description: 'Играет перед защитой, разрушает атаки соперника.' },
            'AM': { name: 'Атакующий полузащитник', line: 'Линия полузащиты', description: 'Создает голевые моменты, связывает полузащиту с атакой.' },
            'FR': { name: 'Свободный полузащитник', line: 'Линия полузащиты', description: 'Универсальный игрок средней линии.' },
            'LW': { name: 'Левый вингер', line: 'Линия атаки', description: 'Атакует по левому флангу, создает голевые моменты.' },
            'RW': { name: 'Правый вингер', line: 'Линия атаки', description: 'Атакует по правому флангу, создает голевые моменты.' },
            'LF': { name: 'Левый форвард', line: 'Линия атаки', description: 'Атакующий игрок левого фланга.' },
            'RF': { name: 'Правый форвард', line: 'Линия атаки', description: 'Атакующий игрок правого фланга.' },
            'CF': { name: 'Центральный форвард', line: 'Линия атаки', description: 'Основной бомбардир команды, играет в центре атаки.' },
            'ST': { name: 'Нападающий', line: 'Линия атаки', description: 'Завершает атакующие действия команды.' }
        };

        return positions[position] || { name: position, line: 'Неизвестная позиция', description: 'Информация о позиции недоступна.' };
    }

    function createShirtElement(position, shirtUrl, top, left, playerName = null, team = null, playerData = null) {
        const div = document.createElement('div');
        
        // Генерируем уникальный ID для футболки
        const uniqueId = `shirt-${team || 'unknown'}-${position}-${Math.random().toString(36).substr(2, 9)}`;
        div.id = uniqueId;
        
        console.log(`[FieldHints] Создание футболки: ID=${uniqueId}, позиция=${position}, команда=${team}, игрок=${playerName}, есть данные=${!!playerData}`);
        
        div.style.cssText = `
            position: absolute;
            width: ${FIELD_LAYOUT.SHIRT_WIDTH}px;
            height: ${FIELD_LAYOUT.SHIRT_HEIGHT}px;
            background-image: url('${shirtUrl}');
            background-size: cover;
            background-repeat: no-repeat;
            background-position: center;
            top: ${top}px;
            left: ${left}px;
            transform: translate(-50%, -50%);
            font-size: 9px;
            font-weight: bold;
            color: white;
            text-align: center;
            line-height: ${FIELD_LAYOUT.SHIRT_HEIGHT}px;
            text-shadow: 0 0 3px black, 0 0 3px black, 0 0 3px black;
            cursor: pointer;
            pointer-events: auto;
            z-index: 10;
        `;
        div.textContent = position;
        div.title = playerName ? `${position}: ${playerName}` : position;

        // Добавляем обработчик клика для показа подсказки
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log(`[FieldHints] Клик по футболке: ${uniqueId}, позиция: ${position}, команда: ${team}`);
            
            // Проверяем, есть ли данные игрока
            if (playerData && playerData.player) {
                console.log(`[FieldHints] Показываем подсказку для игрока: ${playerData.player.name}`);
            } else {
                console.log(`[FieldHints] Показываем подсказку только для позиции: ${position}`);
            }
            
            showFieldPlayerHint(position, team, playerData, div);
        });

        return div;
    }

    function displayShirtsOnField(fieldCol, homeShirts, awayShirts, homeFormation, awayFormation, homeLineup = null, awayLineup = null) {
        console.log('[FieldHints] displayShirtsOnField вызвана');
        console.log('[FieldHints] homeLineup:', homeLineup);
        console.log('[FieldHints] awayLineup:', awayLineup);
        
        // Создаём или очищаем контейнер для футболок
        let shirtsContainer = fieldCol.querySelector('.shirts-container');
        if (!shirtsContainer) {
            shirtsContainer = document.createElement('div');
            shirtsContainer.className = 'shirts-container';
            const padding = FIELD_LAYOUT.CONTAINER_PADDING;
            shirtsContainer.style.cssText = `position: absolute; top: ${padding}px; left: ${padding}px; right: ${padding}px; bottom: ${padding}px;`;
            fieldCol.appendChild(shirtsContainer);
        } else {
            shirtsContainer.innerHTML = '';
        }

        // Получаем позиции - используем актуальные posValue из lineup, если доступны
        let homePositions = FORMATIONS[homeFormation] || FORMATIONS['4-4-2'];
        let awayPositions = FORMATIONS[awayFormation] || FORMATIONS['4-4-2'];

        // Если есть lineup с актуальными позициями, используем их
        if (homeLineup && homeLineup.length > 0) {
            const actualPositions = homeLineup.map(slot => slot.posValue || '').filter(p => p);
            if (actualPositions.length === homePositions.length) {
                homePositions = actualPositions;
            }
        }

        if (awayLineup && awayLineup.length > 0) {
            const actualPositions = awayLineup.map(slot => slot.posValue || '').filter(p => p);
            if (actualPositions.length === awayPositions.length) {
                awayPositions = actualPositions;
            }
        }

        // Генерируем координаты для каждой команды с учетом фланговой привязки
        const homeCoords = generateFieldPositionsWithFlankPreservation(homePositions, 'home');
        const awayCoords = generateFieldPositionsWithFlankPreservation(awayPositions, 'away');

        console.log('[Shirts] Generated positions', {
            homeFormation,
            awayFormation,
            homePositions,
            awayPositions,
            homeCoords: homeCoords.length,
            awayCoords: awayCoords.length
        });

        // Отображаем футболки хозяев
        homeCoords.forEach((coord, idx) => {
            if (!coord) return;

            const position = coord.position;
            const shirtUrl = position === 'GK' ? homeShirts.gk : homeShirts.field;

            // Пытаемся получить имя игрока из состава
            let playerName = null;
            let playerData = null;
            if (homeLineup && homeLineup[idx]) {
                const playerId = homeLineup[idx].getValue && homeLineup[idx].getValue();
                if (playerId && homeLineup[idx].selectedPlayer) {
                    playerName = homeLineup[idx].selectedPlayer.name;
                    // Собираем данные игрока для подсказки
                    playerData = {
                        player: homeLineup[idx].selectedPlayer,
                        matchPosition: position,
                        physicalFormId: homeLineup[idx].physicalFormId || 'normal',
                        playerIndex: idx
                    };
                    console.log(`[FieldHints] Домашняя команда - позиция ${position}: игрок ${playerName}, данные:`, playerData);
                } else {
                    console.log(`[FieldHints] Домашняя команда - позиция ${position}: игрок не выбран (playerId: ${playerId})`);
                }
            } else {
                console.log(`[FieldHints] Домашняя команда - позиция ${position}: homeLineup[${idx}] отсутствует`);
            }

            const shirt = createShirtElement(position, shirtUrl, coord.top, coord.left, playerName, 'home', playerData);
            if (shirt) shirtsContainer.appendChild(shirt);
        });

        // Отображаем футболки гостей
        awayCoords.forEach((coord, idx) => {
            if (!coord) return;

            const position = coord.position;
            const shirtUrl = position === 'GK' ? awayShirts.gk : awayShirts.field;

            // Пытаемся получить имя игрока из состава
            let playerName = null;
            let playerData = null;
            if (awayLineup && awayLineup[idx]) {
                const playerId = awayLineup[idx].getValue && awayLineup[idx].getValue();
                if (playerId && awayLineup[idx].selectedPlayer) {
                    playerName = awayLineup[idx].selectedPlayer.name;
                    // Собираем данные игрока для подсказки
                    playerData = {
                        player: awayLineup[idx].selectedPlayer,
                        matchPosition: position,
                        physicalFormId: awayLineup[idx].physicalFormId || 'normal',
                        playerIndex: idx
                    };
                    console.log(`[FieldHints] Гостевая команда - позиция ${position}: игрок ${playerName}, данные:`, playerData);
                } else {
                    console.log(`[FieldHints] Гостевая команда - позиция ${position}: игрок не выбран (playerId: ${playerId})`);
                }
            } else {
                console.log(`[FieldHints] Гостевая команда - позиция ${position}: awayLineup[${idx}] отсутствует`);
            }

            const shirt = createShirtElement(position, shirtUrl, coord.top, coord.left, playerName, 'away', playerData);
            if (shirt) shirtsContainer.appendChild(shirt);
        });
    }

    async function initializeShirtsSystem(homeTeamId, awayTeamId, fieldCol, homeFormationSelect, awayFormationSelect, homeLineupBlock = null, awayLineupBlock = null) {


        // Добавляем индикатор загрузки
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'shirts-loading';
        loadingIndicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 12px;
            z-index: 100;
        `;
        loadingIndicator.textContent = 'Загрузка футболок...';
        fieldCol.style.position = 'relative';
        fieldCol.appendChild(loadingIndicator);

        try {
            // Получаем футболки для обеих команд
            const [homeShirts, awayShirts] = await Promise.all([
                getTeamShirts(homeTeamId),
                getTeamShirts(awayTeamId)
            ]);



            // Убираем индикатор загрузки
            loadingIndicator.remove();

            // Отображаем футболки
            const updateShirts = () => {
                const homeFormation = homeFormationSelect.value || '4-4-2';
                const awayFormation = awayFormationSelect.value || '4-4-2';
                const homeLineup = homeLineupBlock ? homeLineupBlock.lineup : null;
                const awayLineup = awayLineupBlock ? awayLineupBlock.lineup : null;
                displayShirtsOnField(fieldCol, homeShirts, awayShirts, homeFormation, awayFormation, homeLineup, awayLineup);
            };

            updateShirts();

            // Обновляем при изменении формации
            homeFormationSelect.addEventListener('change', updateShirts);
            awayFormationSelect.addEventListener('change', updateShirts);

            // Сохраняем функцию обновления для использования извне
            window.__updateShirtsDisplay = updateShirts;
        } catch (error) {
            console.error('[Shirts] Failed to initialize shirts system', error);
            loadingIndicator.textContent = 'Ошибка загрузки футболок';
            setTimeout(() => loadingIndicator.remove(), 3000);
        }
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
        selectEl.style.background = status === COLLISION_WIN ? WIN_BG : (status === COLLISION_LOSE ? LOSE_BG :
            NEUTRAL);
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

        // Загрузка физических форм
        if (state.physicalForms && Array.isArray(state.physicalForms)) {
            state.physicalForms.forEach((formId, idx) => {
                if (lineupBlock.lineup[idx] && lineupBlock.lineup[idx].physicalFormSelect && formId) {
                    lineupBlock.lineup[idx].physicalFormSelect.setValue(formId);
                    lineupBlock.lineup[idx].physicalFormValue = formId;
                }
            });

            // Обновляем селекторы игроков после восстановления форм
            if (lineupBlock.updatePlayerSelectOptions) {
                lineupBlock.updatePlayerSelectOptions();
            }
            if (lineupBlock.updateRoleSelectors) {
                lineupBlock.updateRoleSelectors();
            }
        }

        setTimeout(() => {
            if (state.captain) captainSel.value = state.captain;
        }, 100);
    }

    // Делаем функции системы подсказок глобально доступными
    window.showPlayerDetailHint = showPlayerDetailHint;
    window.hidePlayerDetailHint = hidePlayerDetailHint;
    window.addPlayerDetailHints = addPlayerDetailHints;
    window.addHelpButton = addHelpButton;
    window.showCalculatorHint = showCalculatorHint;
    window.getHintContent = getHintContent;
    
    // Новые функции ЭТАПА 4 - подсказки при клике на футболки
    window.showFieldPlayerHint = showFieldPlayerHint;
    window.calculatePlayerStrength = calculatePlayerStrength;

    function createUI(homeTeamId, awayTeamId, homePlayers, awayPlayers, homeAtmosphere = 0, awayAtmosphere = 0) {
        const parsedWeather = parseWeatherFromPreview();
        const stadiumCapacity = parseStadiumCapacity() || 0;
        const weatherUI = createWeatherUI(parsedWeather?.weather, parsedWeather?.temperature, parsedWeather?.icon, stadiumCapacity);
        const container = document.createElement('div');
        container.id = 'vsol-calculator-ui';
        container.appendChild(weatherUI.container);
        const homeTeamObj = {
            defenceType: 'zonal',
            rough: 'clean',
            morale: 'normal'
        };
        const awayTeamObj = {
            defenceType: 'zonal',
            rough: 'clean',
            morale: 'normal'
        };
        window.homeTeam = homeTeamObj;
        window.awayTeam = awayTeamObj;
        const homeSettingsBlock = createTeamSettingsBlock(homeTeamObj, 'home', saveAllStates);
        const awaySettingsBlock = createTeamSettingsBlock(awayTeamObj, 'away', saveAllStates);
        const homeStyle = window.homeTeam._styleSelector;
        const awayStyle = window.awayTeam._styleSelector;
        const homeFormationSelect = window.homeTeam._formationSelector;
        const awayFormationSelect = window.awayTeam._formationSelector;
        const homeLineupBlock = createTeamLineupBlock(homePlayers, "4-4-2", "home");
        const awayLineupBlock = createTeamLineupBlock(awayPlayers, "4-4-2", "away");
        const homeCaptainRow = makeCaptainRow(homeLineupBlock);
        const awayCaptainRow = makeCaptainRow(awayLineupBlock);
        window.homeStyle = homeStyle;
        window.awayStyle = awayStyle;
        window.homeFormationSelect = homeFormationSelect;
        window.awayFormationSelect = awayFormationSelect;
        window.homeLineupBlock = homeLineupBlock;
        window.awayLineupBlock = awayLineupBlock;
        const homeSaved = loadTeamState(CONFIG.STORAGE_KEYS.HOME);
        const awaySaved = loadTeamState(CONFIG.STORAGE_KEYS.AWAY);
        if (homeSaved) {
            setTeamState(homeSaved, homeStyle, homeFormationSelect, homeLineupBlock.captainSelect,
                homeLineupBlock, homePlayers);
        }
        if (awaySaved) {
            setTeamState(awaySaved, awayStyle, awayFormationSelect, awayLineupBlock.captainSelect,
                awayLineupBlock, awayPlayers);
        }
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

            // Обновляем отображение футболок при изменении состава
            if (typeof window.__updateShirtsDisplay === 'function') {
                window.__updateShirtsDisplay();
            }

            // Автоматически пересчитываем силу при изменении позиций
            if (typeof window.__vs_recalculateStrength === 'function') {
                window.__vs_recalculateStrength();
            }

            // Автоматический расчет сыгранности при изменении состава
            setTimeout(async () => {
                try {
                    // Определяем какая команда изменилась и обновляем сыгранность
                    const homePlayerIds = extractPlayerIdsFromLineup(homeLineupBlock.lineup);
                    const awayPlayerIds = extractPlayerIdsFromLineup(awayLineupBlock.lineup);

                    // Обновляем сыгранность для обеих команд если есть достаточно игроков
                    if (homePlayerIds.length >= 4) {
                        updateTeamSynergy('home', homeLineupBlock.lineup);
                    }

                    if (awayPlayerIds.length >= 4) {
                        updateTeamSynergy('away', awayLineupBlock.lineup);
                    }
                } catch (error) {
                    console.error('[AutoSynergy] Ошибка автоматического расчета:', error);
                }
            }, 500); // Небольшая задержка чтобы UI успел обновиться
        };
        const mainTable = document.createElement('table');
        mainTable.style.width = '800px'; // Увеличиваем ширину для двух колонок
        mainTable.style.margin = '0 auto 10px auto';
        mainTable.style.borderCollapse = 'separate';
        mainTable.style.tableLayout = 'fixed';
        const tr1 = document.createElement('tr');

        // Первая ячейка - поле
        const fieldCol = document.createElement('td');
        fieldCol.style.width = '400px';
        fieldCol.style.height = '566px';
        fieldCol.style.background =
            "url('https://github.com/stankewich/vfliga_calc/blob/main/img/field_01.webp?raw=true') no-repeat center center";
        fieldCol.style.backgroundSize = 'contain';
        fieldCol.style.verticalAlign = 'top';

        // Вторая ячейка - вкладки команд
        const tabsCol = document.createElement('td');
        tabsCol.style.width = '394px';
        tabsCol.style.verticalAlign = 'top';

        tr1.appendChild(fieldCol);
        tr1.appendChild(tabsCol);
        mainTable.appendChild(tr1);

        // НОВАЯ СТРУКТУРА: Создаем вкладки команд вместо таблицы составов
        // Извлекаем названия команд из заголовка матча
        function extractTeamNames() {
            const matchHeader = document.querySelector('tr[bgcolor="#006600"] td.txtw');
            if (matchHeader) {
                const teamLinks = matchHeader.querySelectorAll('a.mnuw b');
                if (teamLinks.length >= 2) {
                    return {
                        home: teamLinks[0].textContent.trim(),
                        away: teamLinks[1].textContent.trim()
                    };
                }
            }
            // Fallback к заглушкам если не найдено
            return {
                home: 'Команда хозяев',
                away: 'Команда гостей'
            };
        }

        const teamNames = extractTeamNames();
        const homeTeamName = teamNames.home;
        const awayTeamName = teamNames.away;

        const homeTabContent = createTeamTabContent(homeSettingsBlock, homeLineupBlock, homeTeamName);
        const awayTabContent = createTeamTabContent(awaySettingsBlock, awayLineupBlock, awayTeamName);

        const teamTabsContainer = createTeamTabsContainer(homeTeamName, awayTeamName, homeTabContent, awayTabContent);

        // Добавляем вкладки команд во вторую ячейку таблицы
        tabsCol.appendChild(teamTabsContainer);

        // Селектор типа турнира в стиле v1.2
        const tournamentTypeUI = document.createElement('div');
        tournamentTypeUI.id = 'vsol-tournament-ui';

        // Создаем структуру в стиле v1.2
        tournamentTypeUI.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 2px;">
                <tr style="background-color: rgb(0, 102, 0);">
                    <td class="lh18 txtw" style="text-align: center; padding: 4px; color: white; font-weight: bold; font-size: 11px;">
                        Настройки турнира
                    </td>
                </tr>
            </table>
            <table style="border-collapse: collapse;">
                <tbody>
                    <tr style="background-color: rgb(0, 102, 0);">
                        <td class="lh18 txtw" style="width: 80px; text-align: center; padding: 4px; color: white; font-weight: bold; font-size: 11px;">
                            <b>Параметр</b>
                        </td>
                        <td class="lh18 txtw" style="text-align: center; padding: 4px; color: white; font-weight: bold; font-size: 11px;">
                            <b>Значение</b>
                        </td>
                    </tr>
                    <tr>
                        <td class="qt" style="height: 20px; background-color: rgb(255, 255, 187); text-align: center; font-family: Courier New, monospace; font-size: 11px;" title="Тип турнира">
                            Турнир
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255);">
                            <select id="vs_tournament_type" style="width: 271px; height: 20px; font-size: 11px; border: 1px solid rgb(170, 170, 170); padding: 2px 4px; box-sizing: border-box; background: white;">
                                <option value="friendly">Товарищеский матч</option>
                                <option value="typeC">Тип C (кубок страны, кубок вызова)</option>
                                <option value="typeC_international">Международный кубок (C-формы, с бонусом дома)</option>
                                <option value="typeB">Тип B (чемпионат, кубок межсезонья)</option>
                                <option value="typeB_amateur">Конференция любительских клубов (тип B)</option>
                                <option value="all">Все формы</option>
                            </select>
                        </td>
                    </tr>
                </tbody>
            </table>
        `;

        const tournamentSelect = tournamentTypeUI.querySelector('#vs_tournament_type');

        // Автоматически определяем тип турнира
        const detectedType = detectTournamentTypeFromPage();
        tournamentSelect.value = detectedType;

        // Функция обновления селекторов формы
        const updatePhysicalFormSelectors = (selectedType) => {
            // Обновляем все селекторы физ форм и пересчитываем формы игроков
            [homeLineupBlock, awayLineupBlock].forEach((block, blockIdx) => {
                if (block && block.lineup) {
                    const playersList = blockIdx === 0 ? homePlayers : awayPlayers;
                    block.lineup.forEach(slot => {
                        if (slot.physicalFormSelect && slot.physicalFormSelect.setTournamentType) {
                            slot.physicalFormSelect.setTournamentType(selectedType);
                        }

                        // Пересчитываем форму игрока для нового типа турнира
                        const playerId = slot.getValue && slot.getValue();
                        if (playerId) {
                            const player = playersList.find(p => String(p.id) === String(playerId));
                            if (player && slot.physicalFormSelect) {
                                const formId = getPhysicalFormIdFromData(player.form, player.form_mod, selectedType);
                                slot.physicalFormSelect.setValue(formId);
                                slot.physicalFormValue = formId;

                                // Пересчитываем realStr
                                const baseRealStr = Number(player.baseRealStr || player.realStr) || 0;
                                const modifiedRealStr = applyPhysicalFormToRealStr(baseRealStr, formId);
                                slot.modifiedRealStr = modifiedRealStr;
                            }
                        }
                    });

                    // Обновляем все опции в селекторах после изменения типа турнира
                    // Это также обновит отображаемый текст для всех игроков
                    if (block.updatePlayerSelectOptions) {
                        block.updatePlayerSelectOptions();
                    }
                }
            });
        };

        // Обработчик изменения типа турнира
        tournamentSelect.addEventListener('change', () => {
            updatePhysicalFormSelectors(tournamentSelect.value);
        });

        // Применяем определенный тип турнира к селекторам формы при первичной загрузке
        updatePhysicalFormSelectors(detectedType);

        // Добавляем кнопку подсказки к блоку турнира
        setTimeout(() => {
            const tournamentRow = tournamentTypeUI.querySelector('tr:nth-child(2)');
            if (tournamentRow) {
                const tournamentCell = tournamentRow.querySelector('td.qt');
                if (tournamentCell) {
                    addHelpButton(tournamentCell, 'tournament', 'Тип турнира');
                }
            }
        }, 100);

        const title = document.createElement('h3');
        title.textContent = 'Калькулятор силы';
        title.style.position = 'relative';
        
        // Добавляем индикатор справки
        const helpIndicator = document.createElement('span');
        helpIndicator.innerHTML = ' <small style="color: #666; font-size: 10px;">(F1 - справка, Ctrl+H - горячие клавиши)</small>';
        title.appendChild(helpIndicator);
        
        container.appendChild(tournamentTypeUI);
        container.appendChild(title);
        container.appendChild(mainTable);

        // Блок бонусов в стиле v1.2
        const synergyWrap = document.createElement('div');
        synergyWrap.id = 'vsol-synergy-ui';

        // Создаем структуру в стиле v1.2
        synergyWrap.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 2px;">
                <tr style="background-color: rgb(0, 102, 0);">
                    <td class="lh18 txtw" style="text-align: center; padding: 4px; color: white; font-weight: bold; font-size: 11px;">
                        Бонусы команд
                    </td>
                </tr>
            </table>
            <table style="border-collapse: collapse;">
                <tbody>
                    <tr style="background-color: rgb(0, 102, 0);">
                        <td class="lh18 txtw" style="width: 120px; text-align: center; padding: 4px; color: white; font-weight: bold; font-size: 11px;">
                            <b>Параметр</b>
                        </td>
                        <td class="lh18 txtw" style="width: 120px; text-align: center; padding: 4px; color: white; font-weight: bold; font-size: 11px;">
                            <b>Хозяева</b>
                        </td>
                        <td class="lh18 txtw" style="width: 120px; text-align: center; padding: 4px; color: white; font-weight: bold; font-size: 11px;">
                            <b>Гости</b>
                        </td>
                    </tr>
                    <tr>
                        <td class="qt" style="height: 20px; background-color: rgb(255, 255, 187); text-align: center; font-family: Courier New, monospace; font-size: 11px;" title="Сыгранность команды">
                            Сыгранность
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255); padding: 2px 4px;">
                            <input type="number" id="vs_synergy_home" min="0" max="100" step="0.01" value="0.00"
                                   style="width: 100px; height: 16px; font-size: 11px; border: 1px solid rgb(170, 170, 170); padding: 2px; box-sizing: border-box; background: white;">
                            <span style="font-size: 11px; color: rgb(102, 102, 102); margin-left: 4px;">%</span>
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255); padding: 2px 4px;">
                            <input type="number" id="vs_synergy_away" min="0" max="100" step="0.01" value="0.00"
                                   style="width: 100px; height: 16px; font-size: 11px; border: 1px solid rgb(170, 170, 170); padding: 2px; box-sizing: border-box; background: white;">
                            <span style="font-size: 11px; color: rgb(102, 102, 102); margin-left: 4px;">%</span>
                        </td>
                    </tr>
                    <tr>
                        <td class="qt" style="height: 20px; background-color: rgb(255, 255, 187); text-align: center; font-family: Courier New, monospace; font-size: 11px;" title="Командная игра">
                            Команд. игра
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255); padding: 2px 4px;">
                            <span id="vs_teamwork_home" style="font-size: 11px; color: rgb(68, 68, 68);">0.00</span>
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255); padding: 2px 4px;">
                            <span id="vs_teamwork_away" style="font-size: 11px; color: rgb(68, 68, 68);">0.00</span>
                        </td>
                    </tr>
                    <tr>
                        <td class="qt" style="height: 20px; background-color: rgb(255, 255, 187); text-align: center; font-family: Courier New, monospace; font-size: 11px;" title="Атмосфера в команде">
                            Атмосфера
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255); padding: 2px 4px;">
                            <span id="vs_atmosphere_home" style="font-size: 11px; color: rgb(68, 68, 68);">0.00</span>
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255); padding: 2px 4px;">
                            <span id="vs_atmosphere_away" style="font-size: 11px; color: rgb(68, 68, 68);">0.00</span>
                        </td>
                    </tr>
                    <tr>
                        <td class="qt" style="height: 20px; background-color: rgb(255, 255, 187); text-align: center; font-family: Courier New, monospace; font-size: 11px;" title="Бонусы лидеров (Защита | Середина | Атака)">
                            Лидерство
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255); padding: 2px 4px;">
                            <span id="vs_leadership_home" style="font-size: 10px; color: rgb(68, 68, 68);">
                                <span id="vs-leadership-home-def-bonus">-</span><span id="vs-leadership-home-def-value">0</span> |
                                <span id="vs-leadership-home-mid-bonus">-</span><span id="vs-leadership-home-mid-value">0</span> |
                                <span id="vs-leadership-home-att-bonus">-</span><span id="vs-leadership-home-att-value">0</span>
                            </span>
                        </td>
                        <td class="txtl" style="background-color: rgb(255, 255, 255); padding: 2px 4px;">
                            <span id="vs_leadership_away" style="font-size: 10px; color: rgb(68, 68, 68);">
                                <span id="vs-leadership-away-def-bonus">-</span><span id="vs-leadership-away-def-value">0</span> |
                                <span id="vs-leadership-away-mid-bonus">-</span><span id="vs-leadership-away-mid-value">0</span> |
                                <span id="vs-leadership-away-att-bonus">-</span><span id="vs-leadership-away-att-value">0</span>
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>
        `;

        // Создаем объекты для совместимости с существующим кодом
        const synergyHomeUI = {
            block: synergyWrap,
            input: synergyWrap.querySelector('#vs_synergy_home')
        };

        const synergyAwayUI = {
            block: synergyWrap,
            input: synergyWrap.querySelector('#vs_synergy_away')
        };

        const leadershipHomeUI = {
            block: synergyWrap,
            defBonus: synergyWrap.querySelector('#vs-leadership-home-def-bonus'),
            defValue: synergyWrap.querySelector('#vs-leadership-home-def-value'),
            midBonus: synergyWrap.querySelector('#vs-leadership-home-mid-bonus'),
            midValue: synergyWrap.querySelector('#vs-leadership-home-mid-value'),
            attBonus: synergyWrap.querySelector('#vs-leadership-home-att-bonus'),
            attValue: synergyWrap.querySelector('#vs-leadership-home-att-value')
        };

        const leadershipAwayUI = {
            block: synergyWrap,
            defBonus: synergyWrap.querySelector('#vs-leadership-away-def-bonus'),
            defValue: synergyWrap.querySelector('#vs-leadership-away-def-value'),
            midBonus: synergyWrap.querySelector('#vs-leadership-away-mid-bonus'),
            midValue: synergyWrap.querySelector('#vs-leadership-away-mid-value'),
            attBonus: synergyWrap.querySelector('#vs-leadership-away-att-bonus'),
            attValue: synergyWrap.querySelector('#vs-leadership-away-att-value')
        };

        // Сохраняем ссылки на UI элементы лидерства для глобального доступа
        window.leadershipHomeUI = leadershipHomeUI;
        window.leadershipAwayUI = leadershipAwayUI;

        container.appendChild(synergyWrap);

        // Добавляем кнопки подсказок к блоку бонусов
        setTimeout(() => {
            // Подсказка для сыгранности
            const synergyRow = synergyWrap.querySelector('tr:nth-child(2)');
            if (synergyRow) {
                const synergyCell = synergyRow.querySelector('td.qt');
                if (synergyCell) {
                    addHelpButton(synergyCell, 'synergy', 'Бонус сыгранности');
                }
            }

            // Подсказка для командной игры
            const teamworkRow = synergyWrap.querySelector('tr:nth-child(3)');
            if (teamworkRow) {
                const teamworkCell = teamworkRow.querySelector('td.qt');
                if (teamworkCell) {
                    addHelpButton(teamworkCell, 'teamwork', 'Командная игра');
                }
            }

            // Подсказка для атмосферы
            const atmosphereRow = synergyWrap.querySelector('tr:nth-child(4)');
            if (atmosphereRow) {
                const atmosphereCell = atmosphereRow.querySelector('td.qt');
                if (atmosphereCell) {
                    addHelpButton(atmosphereCell, 'atmosphere', 'Атмосфера в команде');
                }
            }

            // Подсказка для лидерства
            const leadershipRow = synergyWrap.querySelector('tr:nth-child(5)');
            if (leadershipRow) {
                const leadershipCell = leadershipRow.querySelector('td.qt');
                if (leadershipCell) {
                    addHelpButton(leadershipCell, 'leadership', 'Бонусы лидеров');
                }
            }
        }, 100);

        if (homeSaved && typeof homeSaved.synergyHomePercent !== 'undefined') {
            setSynergyPercentHome(homeSaved.synergyHomePercent);
        }
        if (awaySaved && typeof awaySaved.synergyAwayPercent !== 'undefined') {
            setSynergyPercentAway(awaySaved.synergyAwayPercent);
        }
        synergyHomeUI.input.addEventListener('input', () => {
            clampSynergyInput(synergyHomeUI.input);
            saveAllStates();
        });
        synergyHomeUI.input.addEventListener('change', () => {
            clampSynergyInput(synergyHomeUI.input);
            saveAllStates();
        });
        synergyAwayUI.input.addEventListener('input', () => {
            clampSynergyInput(synergyAwayUI.input);
            saveAllStates();
        });
        synergyAwayUI.input.addEventListener('change', () => {
            clampSynergyInput(synergyAwayUI.input);
            saveAllStates();
        });
        homeLineupBlock.applyFormation(homeFormationSelect.value || '4-4-2');
        awayLineupBlock.applyFormation(awayFormationSelect.value || '4-4-2');
        refreshCaptainOptions(homeLineupBlock, homePlayers);
        refreshCaptainOptions(awayLineupBlock, awayPlayers);

        function onStyleChange(repaintStyleCollision, saveAllStates) {
            repaintStyleCollision();
            saveAllStates();
        }

        function makeFormationHandler(lineupBlock, formationSelect, players, applyFormation, refreshCaptainOptions,
            saveAllStates) {
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
            clearTeamState(CONFIG.STORAGE_KEYS.HOME);
            clearTeamState(CONFIG.STORAGE_KEYS.AWAY);
            homeStyle.value = 'norm';
            awayStyle.value = 'norm';
            homeFormationSelect.value = Object.keys(FORMATIONS)[0];
            awayFormationSelect.value = Object.keys(FORMATIONS)[0];
            homeLineupBlock.applyFormation(homeFormationSelect.value);
            awayLineupBlock.applyFormation(awayFormationSelect.value);
            homeLineupBlock.lineup.forEach(slot => {
                slot.setValue('', '');
            });
            awayLineupBlock.lineup.forEach(slot => {
                slot.setValue('', '');
            });
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

        // Функция для пересчета силы команд
        window.__vs_recalculateStrength = async () => {
            const wt = getCurrentWeatherFromUI();
            if (!wt) {
                alert('Не найдены элементы UI погоды');
                return;
            }
            const stadiumCapacityLocal = stadiumCapacity;
            const homeAttendanceInput = document.getElementById('vs_home_attendance');
            const homeAttendance = homeAttendanceInput ? parseInt(homeAttendanceInput.value, 10) :
                stadiumCapacityLocal;
            const homeAttendancePercent = stadiumCapacityLocal ? Math.round((homeAttendance /
                stadiumCapacityLocal) * 100) : -1;
            const userSynergyHome = getSynergyPercentHome() / 100;
            const userSynergyAway = getSynergyPercentAway() / 100;
            const homeTeamStyleId = mapCustomStyleToStyleId(homeStyle.value);
            const awayTeamStyleId = mapCustomStyleToStyleId(awayStyle.value);
            async function computeTeamStrength(lineup, players, teamStyleId, sideLabel, opponentTeamStyleId,
                homeBonusPercent = -1, userSynergy = 0, atmosphereValue = 0) {
                const teamRatings = window.cachedTeamRatings || parseTeamsRatingFromPage() || {
                    home: 0,
                    away: 0
                };
                const moraleMode = (sideLabel === 'home' ? (window.homeTeam && window.homeTeam.morale) :
                    (window.awayTeam && window.awayTeam.morale)) || 'normal';
                const moraleBounds = getMoraleBonusBounds({
                    homeRating: teamRatings.home,
                    awayRating: teamRatings.away,
                    sideLabel
                });

                // Бонус дома для турниров типа B и международных кубков
                const tournamentType = getTournamentType();
                const hasHomeBonus = tournamentType === 'typeB' ||
                                     tournamentType === 'typeB_amateur' ||
                                     tournamentType === 'typeC_international';
                const homeBonusValue = hasHomeBonus ? getHomeBonus(homeBonusPercent) : 0;

                const myStyleId = teamStyleId || 'norm';
                const oppStyleId = opponentTeamStyleId || 'norm';
                const inLineupPlayers = lineup.map(slot => {
                    const id = slot.getValue && slot.getValue();
                    return id ? players.find(p => String(p.id) === String(id)) : null;
                }).filter(Boolean);
                const {
                    teamIBonusByPlayer,
                    teamIBonusTotal
                } = getTeamIBonusForLineup(inLineupPlayers, lineup);
                const captainSelectEl = sideLabel === 'home' ? homeLineupBlock.captainSelect :
                    awayLineupBlock.captainSelect;
                const {
                    captainId,
                    captainPlayer,
                    dummyEntries
                } = buildCaptainContext(lineup, players, captainSelectEl);
                const teamCaptainPercent = estimateCaptainPercent(captainPlayer, dummyEntries) || 0;
                let captainBonus = 0;
                if (captainPlayer && teamCaptainPercent !== 0) {
                    const captainRealStr = Number(captainPlayer.realStr) || 0;
                    captainBonus = captainRealStr * teamCaptainPercent;
                }
                const {
                    teamStatus,
                    teamBonus
                } = getCollisionInfo(myStyleId, oppStyleId);
                const tasks = lineup.map(slot => new Promise(resolve => {
                    const playerId = slot.getValue && slot.getValue();
                    if (!playerId) return resolve(null);
                    const player = players.find(p => String(p.id) === String(playerId));
                    if (!player) return resolve(null);
                    const playerCustomStyle = slot.customStyleValue || 'norm';
                    const playerStyleId = KNOWN_STYLE_IDS.has(playerCustomStyle) ?
                        playerCustomStyle : 'norm';
                    const styleNumeric = STYLE_VALUES[playerStyleId] ?? 0;
                    const requestedStrength = Number(player.baseStrength) || 0;
                    getWeatherStrengthValueCached(styleNumeric, wt.temperature, wt.weather,
                        requestedStrength, (res) => {
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

                            // Логируем ws для отладки
                            console.log('[Weather] Player WS calculated', {
                                player: player.name,
                                baseStr: player.baseStrength,
                                temperature: wt.temperature,
                                weather: wt.weather,
                                weatherStr: res.weatherStr,
                                ws: ws,
                                method: res.details?.method,
                                interpolated: res.interpolated,
                                lowerPoint: res.details?.lowerPoint,
                                upperPoint: res.details?.upperPoint
                            });

                            resolve({
                                player,
                                weatherStr: (ws == null || ws === 0) ? null :
                                    ws,
                                wasNormalized: !!res.details.wasNormalized,
                                playerStyleId,
                                teamStyleId: myStyleId
                            });
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
                let totalSynergyBonus = 0;
                let totalPositionBonus = 0;
                let totalTeamIBonus = 0;
                let totalAtmosphereBonus = 0;
                const slotEntries = lineup.map((slot, idx) => {
                    const playerId = slot.getValue && slot.getValue();
                    const player = playerId ? players.find(p => String(p.id) === String(
                        playerId)) : null;
                    const matchPos = slot.posValue || null;
                    return player ? {
                        idx,
                        slot,
                        player,
                        matchPos
                    } : null;
                }).filter(Boolean);
                
                // Сохраняем slotEntries для Chemistry системы с customStyleValue
                window.currentSlotEntries = slotEntries.map(entry => ({
                    ...entry,
                    customStyleValue: entry.slot.customStyleValue || entry.player.hidden_style || 'norm'
                }));
                const team = {
                    positions: slotEntries.map(e => e.matchPos),
                    realStr: slotEntries.map(e => Number(e.player.realStr) || 0),
                    contribution: slotEntries.map(e => 0),
                    defenceType: (sideLabel === 'home' ? (window.homeTeam && window.homeTeam
                        .defenceType) : (window.awayTeam && window.awayTeam.defenceType)) ||
                        'zonal',
                    rough: (sideLabel === 'home' ? (window.homeTeam && window.homeTeam.rough) : (
                        window.awayTeam && window.awayTeam.rough)) || 'clean',
                    morale: (sideLabel === 'home' ? (window.homeTeam && window.homeTeam.morale) : (
                        window.awayTeam && window.awayTeam.morale)) || 'normal',
                    log: [],
                    name: sideLabel
                };
                const opponent = {
                    positions: (sideLabel === 'home' ? (window.awayLineupBlock && window
                        .awayLineupBlock.lineup.map(slot => slot.posValue)) : (window
                            .homeLineupBlock && window.homeLineupBlock.lineup.map(slot => slot
                                .posValue))) || []
                };
                const totalRoughBonus = roughBonus({
                    team,
                    slotEntries
                }) || 0;
                defenceTypeBonus({
                    team,
                    opponent
                });
                const bonusActive = team.contribution.some(v => v > 0);
                const defenceTypeWinStatus = bonusActive ? 'win' : 'lose';
                if (sideLabel === 'home' && window.homeDefenceTypeSelect) {
                    window.homeDefenceTypeSelect.setHighlight(defenceTypeWinStatus);
                }
                if (sideLabel === 'away' && window.awayDefenceTypeSelect) {
                    window.awayDefenceTypeSelect.setHighlight(defenceTypeWinStatus);
                }
                totalDefenceTypeBonus = team.contribution.reduce((s, v) => s + (Number(v) || 0), 0);
                const leadersByLine = {
                    DEF: [],
                    MID: [],
                    ATT: []
                };
                slotEntries.forEach(entry => {
                    const line = getLineByMatchPos(entry.matchPos);
                    if (!line) return;
                    const abilities = parseAbilities(entry.player.abilities);
                    const leaderAb = abilities.find(a => a.type === 'Л');
                    if (!leaderAb) return;
                    const lvl = Math.max(1, Math.min(4, Number(leaderAb.level) || 1));
                    leadersByLine[line].push({
                        entry,
                        level: lvl
                    });
                });
                const leadershipBonusByPlayerId = new Map();
                ['DEF', 'MID', 'ATT'].forEach(line => {
                    const leaders = leadersByLine[line];
                    if (!leaders || leaders.length !== 1) {
                        return;
                    }
                    const leader = leaders[0];

                    // Используем calculatedRealStr вместо realStr для корректного расчета
                    const leaderSlot = leader.entry.slot;
                    let leaderCalculatedStr = 0;
                    if (leaderSlot && leaderSlot.posValue && leaderSlot.physicalFormValue) {
                        leaderCalculatedStr = calculatePlayerStrengthGlobal(
                            leader.entry.player,
                            leaderSlot.posValue,
                            leaderSlot.physicalFormValue
                        );
                    } else {
                        leaderCalculatedStr = Number(leader.entry.player.realStr) || 0;
                    }

                    const coeff = LEADERSHIP_LEVEL_COEFF[leader.level] || 0;
                    const perPlayerBonus = leaderCalculatedStr * coeff;
                    slotEntries.forEach(entry => {
                        const l = getLineByMatchPos(entry.matchPos);
                        if (l !== line) {
                            return;
                        }
                        const prev = leadershipBonusByPlayerId.get(String(entry.player.id)) || 0;
                        leadershipBonusByPlayerId.set(String(entry.player.id), prev + perPlayerBonus);
                    });
                });
                results.forEach(entry => {
                    if (!entry || !entry.player) return;
                    const slotEntryIdx = slotEntries.findIndex(e => String(e.player.id) === String(entry
                        .player.id));
                    if (slotEntryIdx < 0) return;

                    // НОВАЯ ЛОГИКА: Рассчитываем силу игрока на основе baseStr с модификаторами
                    const slotEntry = slotEntries[slotEntryIdx];
                    const slot = slotEntry.slot;  // Используем slot из slotEntry
                    const idx = slotEntry.idx;    // Используем оригинальный индекс
                    const baseStr = Number(entry.player.baseStrength) || 0;
                    const ws = Number(entry.weatherStr);

                    if (!ws || ws === 0) {
                        console.warn('[Calc] Skip player due to invalid WeatherStrength', {
                            side: sideLabel,
                            name: entry.player.name,
                            baseStr,
                            ws
                        });
                        return;
                    }

                    const denom = ws / (baseStr || 1);
                    if (!Number.isFinite(denom) || denom === 0) {
                        console.warn('[Calc] Skip player due to invalid denominator', {
                            side: sideLabel,
                            name: entry.player.name,
                            baseStr,
                            ws,
                            denom
                        });
                        return;
                    }

                    // Шаг 1: Получаем все модификаторы для baseStr
                    // Если форма не установлена вручную, определяем автоматически
                    let actualFormId = slot?.physicalFormValue;
                    if (!actualFormId) {
                        const tournamentType = getTournamentType();
                        actualFormId = getPhysicalFormIdFromData(entry.player.form, entry.player.form_mod, tournamentType);
                    }

                    const physicalFormModifier = getPhysicalFormModifier(actualFormId);
                    const fatigueModifier = getFatigueBonus(entry.player.fatigue);
                    const realityModifier = getRealityBonus(entry.player.real_status, entry.player.real_sign);

                    const playerMatchPos = idx >= 0 ? slotEntries[idx]?.matchPos : null;
                    const playerMainPos = entry.player.mainPos || null;
                    const playerSecondPos = entry.player.secondPos || null;
                    const positionModifier = getPositionModifier(playerMainPos, playerSecondPos, playerMatchPos);

                    // Шаг 2: Вычисляем calculatedRealStr = baseStr * все модификаторы
                    const calculatedRealStr = baseStr * physicalFormModifier * fatigueModifier * realityModifier * positionModifier;

                    // Шаг 3: Вычисляем contribBase = calculatedRealStr * denom
                    const contribBase = calculatedRealStr * denom;
                    // Шаг 4: Бонусы от contribBase
                    const abilityBonusesDetailed = getAbilitiesBonusesDetailed(entry.player.abilities, myStyleId);
                    const abilitiesBonus = getAbilitiesBonusForStyleId(entry.player.abilities, myStyleId);
                    const favoriteStyleBonus = getFavoriteStyleBonus(myStyleId, entry.playerStyleId);

                    // Вратарские способности (только для GK)
                    let goalkeeperBonus = 0;
                    if (playerMatchPos === 'GK') {
                        const hasSW = slotEntries.some(e => e.matchPos === 'SW');
                        goalkeeperBonus = getGoalkeeperAbilitiesBonus(entry.player.abilities, hasSW);
                    }

                    const synergyBonus = getSynergyBonus(entry.player, inLineupPlayers, myStyleId, userSynergy);
                    const synergyBonusForPlayer = contribBase * synergyBonus;
                    totalSynergyBonus += synergyBonusForPlayer;

                    const chemistryBonus = getChemistryBonus(entry.player, inLineupPlayers, myStyleId);
                    const chemistryBonusForPlayer = contribBase * chemistryBonus;
                    totalChemistryBonus += chemistryBonusForPlayer;

                    const positionBonus = getPositionBonus(myStyleId, playerMatchPos);
                    const positionBonusForPlayer = contribBase * positionBonus;
                    totalPositionBonus += positionBonusForPlayer;

                    const moraleBonusForPlayer = getMoraleBonusForPlayer({
                        moraleMode,
                        contribBase,
                        bounds: moraleBounds
                    });
                    totalMoraleBonus += moraleBonusForPlayer;

                    const atmosphereBonusForPlayer = getAtmosphereBonus(contribBase, atmosphereValue);
                    totalAtmosphereBonus += atmosphereBonusForPlayer;

                    const homeBonusForPlayer = contribBase * homeBonusValue;
                    totalHomeBonus += homeBonusForPlayer;

                    let collisionWinBonusForPlayer = 0;
                    if (teamStatus === COLLISION_WIN && teamBonus > 0) {
                        collisionWinBonusForPlayer = contribBase * teamBonus;
                        totalCollisionWinBonus += collisionWinBonusForPlayer;
                    }

                    const defenceTypeBonusForPlayer = idx >= 0 ? (team.contribution[idx] || 0) : 0;

                    const totalBonus = abilitiesBonus + favoriteStyleBonus + goalkeeperBonus;
                    const contribWithIndividualBonuses = contribBase * (1 + totalBonus);

                    // Шаг 5: Бонусы от calculatedRealStr
                    const isCaptain = captainId && String(entry.player.id) === String(captainId);
                    // Капитанский бонус: если это капитан, бонус 0, иначе вычисляем от calculatedRealStr капитана
                    let captainBonusForPlayer = 0;
                    if (!isCaptain && captainPlayer && teamCaptainPercent !== 0) {
                        // Находим slot капитана для получения его позиции и формы
                        const captainSlot = lineup.find(s => {
                            const pid = s.getValue && s.getValue();
                            return pid && String(pid) === String(captainId);
                        });

                        let captainCalculatedStr;
                        if (captainSlot && captainSlot.posValue) {
                            // Вычисляем calculatedRealStr капитана с учетом всех модификаторов
                            const captainBaseStr = Number(captainPlayer.baseStrength) || 0;

                            // Форма капитана
                            let captainFormId = captainSlot.physicalFormValue;
                            if (!captainFormId) {
                                const tournamentType = getTournamentType();
                                captainFormId = getPhysicalFormIdFromData(captainPlayer.form, captainPlayer.form_mod, tournamentType);
                            }

                            const captainPhysicalFormModifier = getPhysicalFormModifier(captainFormId);
                            const captainFatigueModifier = getFatigueBonus(captainPlayer.fatigue);
                            const captainRealityModifier = getRealityBonus(captainPlayer.real_status, captainPlayer.real_sign);
                            const captainPositionModifier = getPositionModifier(captainPlayer.mainPos, captainPlayer.secondPos, captainSlot.posValue);

                            captainCalculatedStr = captainBaseStr * captainPhysicalFormModifier * captainFatigueModifier * captainRealityModifier * captainPositionModifier;
                        } else {
                            // Fallback на realStr если нет данных о позиции
                            captainCalculatedStr = Number(captainPlayer.realStr) || 0;
                        }

                        captainBonusForPlayer = captainCalculatedStr * teamCaptainPercent;
                    }

                    const roughMode = getRough(team);
                    const roughBonusForPlayer = getRoughBonusForPlayer(calculatedRealStr, roughMode);

                    const leadershipBonusForPlayer = leadershipBonusByPlayerId.get(String(entry.player.id)) || 0;
                    totalLeadershipBonus += leadershipBonusForPlayer;

                    // teamIBonus добавляется к каждому игроку
                    const teamIBonusForPlayer = teamIBonusTotal;
                    totalTeamIBonus += teamIBonusForPlayer;

                    const contribution = contribWithIndividualBonuses +
                        captainBonusForPlayer +
                        collisionWinBonusForPlayer +
                        chemistryBonusForPlayer +
                        homeBonusForPlayer +
                        leadershipBonusForPlayer +
                        synergyBonusForPlayer +
                        roughBonusForPlayer +
                        defenceTypeBonusForPlayer +
                        positionBonusForPlayer +
                        moraleBonusForPlayer +
                        atmosphereBonusForPlayer +
                        teamIBonusForPlayer;
                    total += contribution;

                    console.log('[Calc] Player contribution', {
                        side: sideLabel,
                        name: entry.player.name,
                        baseStr,
                        weatherStr: ws,
                        calculatedRealStr,
                        contribBase,
                        moraleMode,
                        moraleBonusForPlayer: moraleBonusForPlayer.toFixed(2),
                        leadershipBonusForPlayer: leadershipBonusForPlayer.toFixed(2),
                        moraleBounds: {
                            super: moraleBounds.superBonus,
                            rest: moraleBounds.restBonus
                        },
                        contribution
                    });
                });
                // teamIBonusTotal уже добавлен к каждому игроку, не добавляем отдельно
                const nonCaptainCount = results.filter(entry => entry && entry.player && (!captainId ||
                    String(entry.player.id) !== String(captainId))).length;
                const totalCaptainBonus = (Number(captainBonus) || 0) * nonCaptainCount;

                console.log('[Calc] Team total', {
                    side: sideLabel,
                    total,
                    moraleMode,
                    moraleBounds: {
                        super: moraleBounds.superBonus,
                        rest: moraleBounds.restBonus
                    },
                    totalTeamIBonus,
                    totalCaptainBonus,
                    totalCollisionWinBonus,
                    totalSynergyBonus,
                    totalChemistryBonus,
                    totalHomeBonus,
                    totalDefenceTypeBonus,
                    totalLeadershipBonus,
                    totalRoughBonus,
                    totalPositionBonus,
                    totalMoraleBonus,
                    atmosphereValue,
                    totalAtmosphereBonus
                });

                // Обновляем отображение бонусов лидеров в UI
                updateLeadershipBonusesDisplay(sideLabel, leadershipBonusByPlayerId, slotEntries);

                // Обновляем отображение командной игры в UI
                updateTeamworkDisplay(sideLabel, totalTeamIBonus);

                // Обновляем отображение атмосферы в UI
                updateAtmosphereDisplay(sideLabel, atmosphereValue, totalAtmosphereBonus);

                return total
            }
            try {
                const [homeStrength, awayStrength] = await Promise.all([
                    computeTeamStrength(homeLineupBlock.lineup, homePlayers, homeTeamStyleId,
                        'home', awayTeamStyleId, homeAttendancePercent, userSynergyHome, homeAtmosphere),
                    computeTeamStrength(awayLineupBlock.lineup, awayPlayers, awayTeamStyleId,
                        'away', homeTeamStyleId, -1, userSynergyAway, awayAtmosphere)
                ]);
                const oldResult = container.querySelector('.vsol-result');
                if (oldResult) oldResult.remove();
                const resultDiv = document.createElement('div');
                resultDiv.className = 'vsol-result';
                resultDiv.style.marginTop = '15px';
                resultDiv.style.fontWeight = 'bold';
                resultDiv.innerHTML =
                    `<div>Сила хозяев: <b>${Math.round(homeStrength)}</b></div><div>Сила гостей: <b>${Math.round(awayStrength)}</b></div>`;
                container.appendChild(resultDiv);
            } catch (e) {
                console.error('Ошибка расчёта:', e);
                alert('Ошибка при расчёте силы команд. Подробности в консоли.');
            }
        };

        const btn = document.createElement('button');
        btn.textContent = 'Рассчитать силу';
        btn.style.marginTop = '15px';
        btn.className = 'butn-green';
        btn.style.padding = '8px 16px';
        btn.onclick = () => window.__vs_recalculateStrength();
        container.appendChild(btn);
        window.saveAllStates = saveAllStates;

        // Кнопка обновления футболок
        const refreshShirtsBtn = document.createElement('button');
        refreshShirtsBtn.textContent = 'Обновить футболки';
        refreshShirtsBtn.style.marginTop = '10px';
        refreshShirtsBtn.style.marginLeft = '10px';
        refreshShirtsBtn.className = 'butn';
        refreshShirtsBtn.style.padding = '6px 12px';
        refreshShirtsBtn.style.fontSize = '12px';
        refreshShirtsBtn.title = 'Очистить кэш и загрузить футболки заново';
        refreshShirtsBtn.onclick = async () => {
            if (!homeTeamId || !awayTeamId) return;

            // Очищаем кэш
            try {
                localStorage.removeItem(getShirtsCacheKey(homeTeamId));
                localStorage.removeItem(getShirtsCacheKey(awayTeamId));


                // Перезагружаем футболки
                await initializeShirtsSystem(homeTeamId, awayTeamId, fieldCol, homeFormationSelect, awayFormationSelect, homeLineupBlock, awayLineupBlock);

                alert('Футболки успешно обновлены!');
            } catch (error) {
                console.error('[Shirts] Failed to refresh:', error);
                alert('Ошибка при обновлении футболок');
            }
        };
        container.appendChild(refreshShirtsBtn);

        // Инициализируем систему футболок
        if (homeTeamId && awayTeamId && fieldCol) {
            initializeShirtsSystem(homeTeamId, awayTeamId, fieldCol, homeFormationSelect, awayFormationSelect, homeLineupBlock, awayLineupBlock)
                .catch(err => console.error('[Shirts] Failed to initialize:', err));
        }

        // Первый автоматический расчет после загрузки
        setTimeout(() => {
            if (typeof window.__vs_recalculateStrength === 'function') {
                window.__vs_recalculateStrength();
            }
        }, 1000);

        return container;
    }

    // Делаем остальные функции системы подсказок глобально доступными
    window.showCalculatorHint = showCalculatorHint;
    window.removeExistingHints = removeExistingHints;
    window.getHintContent = getHintContent;
    window.positionHint = positionHint;

    /**
     * @param {string} type - Тип подсказки ('synergy', 'leadership', 'weather', 'collision', 'tournament')
     * @param {string} title - Заголовок подсказки
     * @param {number} width - Ширина подсказки
     * @param {Object} context - Дополнительный контекст для интерактивных подсказок
     */
    function showCalculatorHint(button, type, title, width = 400, context = {}) {
        // Удаляем существующие подсказки
        removeExistingHints();
        
        // Создаем контейнер подсказки
        const hint = document.createElement('div');
        hint.className = 'vs-calculator-hint';
        hint.style.cssText = `
            position: absolute;
            width: ${width}px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            padding: 0;
            font-size: 11px;
            line-height: 1.4;
            opacity: 0;
            transform: scale(0.95);
            transition: opacity 0.2s ease, transform 0.2s ease;
        `;
        
        // Добавляем заголовок
        const header = document.createElement('div');
        header.style.cssText = `
            background: linear-gradient(135deg, #006600, #008800);
            color: white;
            font-weight: bold;
            padding: 10px 12px;
            border-radius: 6px 6px 0 0;
            position: relative;
            font-size: 12px;
        `;
        header.textContent = title;
        hint.appendChild(header);
        
        // Добавляем кнопку закрытия
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            position: absolute;
            top: 8px;
            right: 10px;
            border: none;
            background: none;
            font-size: 18px;
            cursor: pointer;
            color: rgba(255,255,255,0.8);
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 3px;
            transition: background-color 0.2s ease;
        `;
        closeBtn.onmouseover = () => closeBtn.style.backgroundColor = 'rgba(255,255,255,0.2)';
        closeBtn.onmouseout = () => closeBtn.style.backgroundColor = 'transparent';
        closeBtn.onclick = () => {
            hint.style.opacity = '0';
            hint.style.transform = 'scale(0.95)';
            setTimeout(() => hint.remove(), 200);
        };
        header.appendChild(closeBtn);
        
        // Добавляем содержимое
        const content = document.createElement('div');
        content.style.cssText = 'padding: 12px;';
        content.innerHTML = getHintContent(type, context);
        hint.appendChild(content);
        
        // Позиционируем подсказку
        document.body.appendChild(hint);
        positionHint(hint, button, 'right top');
        
        // Анимация появления
        setTimeout(() => {
            hint.style.opacity = '1';
            hint.style.transform = 'scale(1)';
        }, 10);
        
        // Автоматическое закрытие при клике вне подсказки
        setTimeout(() => {
            document.addEventListener('click', function closeOnOutsideClick(e) {
                if (!hint.contains(e.target) && e.target !== button) {
                    hint.style.opacity = '0';
                    hint.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        hint.remove();
                        document.removeEventListener('click', closeOnOutsideClick);
                    }, 200);
                }
            });
        }, 100);
    }

    /**
     * Удаляет все существующие подсказки
     */
    function removeExistingHints() {
        const existingHints = document.querySelectorAll('.vs-calculator-hint');
        existingHints.forEach(hint => hint.remove());
    }

    /**
     * Возвращает HTML-контент для подсказки
     * @param {string} type - Тип подсказки
     * @param {Object} context - Дополнительный контекст для интерактивных подсказок
     * @returns {string} HTML-контент
     */
    function getHintContent(type, context = {}) {
        const hints = {
            synergy: () => {
                const currentHome = getSynergyPercentHome();
                const currentAway = getSynergyPercentAway();
                
                return `
                    <p><strong>Бонус сыгранности</strong> рассчитывается на основе последних 25 матчей команды.</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Текущие значения:</strong><br>
                        Хозяева: <span style="color: #006600; font-weight: bold;">${currentHome.toFixed(2)}%</span><br>
                        Гости: <span style="color: #006600; font-weight: bold;">${currentAway.toFixed(2)}%</span>
                    </div>
                    <p><strong>Правила начисления:</strong></p>
                    <table style="width: 100%; font-size: 10px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 4px; border: 1px solid #ddd;">Игроков в составе</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Бонус за матч</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">За 25 матчей</th>
                        </tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">6 игроков</td><td style="padding: 4px; border: 1px solid #ddd;">+0.10%</td><td style="padding: 4px; border: 1px solid #ddd;">+2.50%</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">7 игроков</td><td style="padding: 4px; border: 1px solid #ddd;">+0.25%</td><td style="padding: 4px; border: 1px solid #ddd;">+6.25%</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">8 игроков</td><td style="padding: 4px; border: 1px solid #ddd;">+0.50%</td><td style="padding: 4px; border: 1px solid #ddd;">+12.50%</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">9 игроков</td><td style="padding: 4px; border: 1px solid #ddd;">+0.75%</td><td style="padding: 4px; border: 1px solid #ddd;">+18.75%</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">10 игроков</td><td style="padding: 4px; border: 1px solid #ddd;">+1.00%</td><td style="padding: 4px; border: 1px solid #ddd;">+25.00%</td></tr>
                        <tr style="background: #d4edda;"><td style="padding: 4px; border: 1px solid #ddd;"><strong>11+ игроков</strong></td><td style="padding: 4px; border: 1px solid #ddd;"><strong>+1.25%</strong></td><td style="padding: 4px; border: 1px solid #ddd;"><strong>+31.25%</strong></td></tr>
                    </table>
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>💡 Совет: Используйте кнопку "Пересчитать сыгранность" для автоматического расчета на основе текущего состава.</em></p>
                    <p style="font-size: 10px; color: #666;"><em>⚠️ Товарищеские матчи не учитываются в расчете сыгранности.</em></p>
                `;
            },
            
            leadership: () => {
                // Получаем текущие значения лидерства из UI
                const homeDefValue = document.getElementById('vs-leadership-home-def-value')?.textContent || '0';
                const homeMidValue = document.getElementById('vs-leadership-home-mid-value')?.textContent || '0';
                const homeAttValue = document.getElementById('vs-leadership-home-att-value')?.textContent || '0';
                const awayDefValue = document.getElementById('vs-leadership-away-def-value')?.textContent || '0';
                const awayMidValue = document.getElementById('vs-leadership-away-mid-value')?.textContent || '0';
                const awayAttValue = document.getElementById('vs-leadership-away-att-value')?.textContent || '0';
                
                return `
                    <p><strong>Бонусы лидеров</strong> применяются к игрокам соответствующих линий.</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Текущие бонусы:</strong><br>
                        <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                            <div style="flex: 1;">
                                <strong>Хозяева:</strong><br>
                                <span style="font-size: 10px;">Защ: ${homeDefValue} | Сер: ${homeMidValue} | Ата: ${homeAttValue}</span>
                            </div>
                            <div style="flex: 1; text-align: right;">
                                <strong>Гости:</strong><br>
                                <span style="font-size: 10px;">Защ: ${awayDefValue} | Сер: ${awayMidValue} | Ата: ${awayAttValue}</span>
                            </div>
                        </div>
                    </div>
                    <p><strong>Типы лидерства:</strong></p>
                    <ul style="margin: 8px 0; padding-left: 16px; font-size: 10px;">
                        <li><strong>Защита:</strong> GK, LD, LB, SW, CD, RD, RB</li>
                        <li><strong>Полузащита:</strong> LM, DM, CM, FR, RM</li>
                        <li><strong>Атака:</strong> LW, LF, AM, CF, ST, RW, RF</li>
                    </ul>
                    <p><strong>Коэффициенты по уровням:</strong></p>
                    <table style="width: 100%; font-size: 10px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 4px; border: 1px solid #ddd;">Уровень</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Коэффициент</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Пример (сила 100)</th>
                        </tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Л1</td><td style="padding: 4px; border: 1px solid #ddd;">3%</td><td style="padding: 4px; border: 1px solid #ddd;">+3.0</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Л2</td><td style="padding: 4px; border: 1px solid #ddd;">6%</td><td style="padding: 4px; border: 1px solid #ddd;">+6.0</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Л3</td><td style="padding: 4px; border: 1px solid #ddd;">9%</td><td style="padding: 4px; border: 1px solid #ddd;">+9.0</td></tr>
                        <tr style="background: #d4edda;"><td style="padding: 4px; border: 1px solid #ddd;"><strong>Л4</strong></td><td style="padding: 4px; border: 1px solid #ddd;"><strong>12%</strong></td><td style="padding: 4px; border: 1px solid #ddd;"><strong>+12.0</strong></td></tr>
                    </table>
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>⚠️ Условие: В каждой линии должен быть ровно 1 лидер для получения бонуса.</em></p>
                    <p style="font-size: 10px; color: #666;"><em>💡 Формула: Сила лидера × Коэффициент уровня = Бонус для всех игроков линии</em></p>
                `;
            },
            
            weather: () => {
                const weatherUI = getCurrentWeatherFromUI();
                const currentWeather = weatherUI ? weatherUI.weather : 'не выбрано';
                const currentTemp = weatherUI ? weatherUI.temperature : 'не выбрано';
                
                return `
                    <p><strong>Влияние погоды</strong> на силу игроков зависит от их адаптации к климатическим условиям.</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Текущие условия:</strong><br>
                        Погода: <span style="color: #006600; font-weight: bold;">${currentWeather}</span><br>
                        Температура: <span style="color: #006600; font-weight: bold;">${currentTemp}°</span>
                    </div>
                    <p><strong>Диапазоны температур:</strong></p>
                    <table style="width: 100%; font-size: 10px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 4px; border: 1px solid #ddd;">Погода</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Температура</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Влияние</th>
                        </tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Очень жарко</td><td style="padding: 4px; border: 1px solid #ddd;">26-30°</td><td style="padding: 4px; border: 1px solid #ddd;">Сильное</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Жарко</td><td style="padding: 4px; border: 1px solid #ddd;">15-29°</td><td style="padding: 4px; border: 1px solid #ddd;">Умеренное</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Солнечно</td><td style="padding: 4px; border: 1px solid #ddd;">10-29°</td><td style="padding: 4px; border: 1px solid #ddd;">Слабое</td></tr>
                        <tr style="background: #d4edda;"><td style="padding: 4px; border: 1px solid #ddd;"><strong>Облачно</strong></td><td style="padding: 4px; border: 1px solid #ddd;"><strong>5-25°</strong></td><td style="padding: 4px; border: 1px solid #ddd;"><strong>Нейтральное</strong></td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Пасмурно</td><td style="padding: 4px; border: 1px solid #ddd;">1-20°</td><td style="padding: 4px; border: 1px solid #ddd;">Слабое</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Дождь</td><td style="padding: 4px; border: 1px solid #ddd;">1-15°</td><td style="padding: 4px; border: 1px solid #ddd;">Умеренное</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Снег</td><td style="padding: 4px; border: 1px solid #ddd;">0-4°</td><td style="padding: 4px; border: 1px solid #ddd;">Сильное</td></tr>
                    </table>
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>💡 Калькулятор использует интерполяцию для точного расчета между табличными значениями.</em></p>
                    <p style="font-size: 10px; color: #666;"><em>⚠️ Влияние зависит от стиля игры игрока и его базовой силы.</em></p>
                `;
            },
            
            collision: () => {
                const homeStyle = window.homeStyle?.value || 'norm';
                const awayStyle = window.awayStyle?.value || 'norm';
                const collisionInfo = getCollisionInfo(homeStyle, awayStyle);
                
                const styleNames = {
                    'norm': 'Нормальный',
                    'sp': 'Спартаковский', 
                    'brazil': 'Бразильский',
                    'tiki': 'Тики-така',
                    'bb': 'Бей-беги',
                    'kat': 'Катеначчо',
                    'brit': 'Британский'
                };
                
                let statusText = 'Нет коллизии';
                let statusColor = '#666';
                if (collisionInfo.teamStatus === 'win') {
                    statusText = `Хозяева выигрывают (+${(collisionInfo.teamBonus * 100).toFixed(0)}%)`;
                    statusColor = '#28a745';
                } else if (collisionInfo.oppStatus === 'win') {
                    statusText = `Гости выигрывают (+${(collisionInfo.oppBonus * 100).toFixed(0)}%)`;
                    statusColor = '#dc3545';
                }
                
                return `
                    <p><strong>Коллизии стилей</strong> - взаимодействие между стилями игры команд. Часть игры, вносящий элемент непредсказуемости результата.</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Текущая ситуация:</strong><br>
                        Хозяева: <span style="color: #006600; font-weight: bold;">${styleNames[homeStyle]}</span><br>
                        Гости: <span style="color: #006600; font-weight: bold;">${styleNames[awayStyle]}</span><br>
                        <div style="margin-top: 4px; padding: 4px; background: white; border-radius: 3px;">
                            <strong style="color: ${statusColor};">${statusText}</strong>
                        </div>
                    </div>
                    <p><strong>Таблица коллизий:</strong></p>
                    <table style="width: 100%; font-size: 9px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 3px; border: 1px solid #ddd;">Стиль</th>
                            <th style="padding: 3px; border: 1px solid #ddd;">Побеждает</th>
                            <th style="padding: 3px; border: 1px solid #ddd;">Бонус</th>
                        </tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Спартаковский</td><td style="padding: 3px; border: 1px solid #ddd;">Британский</td><td style="padding: 3px; border: 1px solid #ddd;">+38%</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Бей-беги</td><td style="padding: 3px; border: 1px solid #ddd;">Спартаковский</td><td style="padding: 3px; border: 1px solid #ddd;">+42%</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Бразильский</td><td style="padding: 3px; border: 1px solid #ddd;">Бей-беги</td><td style="padding: 3px; border: 1px solid #ddd;">+34%</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Тики-така</td><td style="padding: 3px; border: 1px solid #ddd;">Катеначчо</td><td style="padding: 3px; border: 1px solid #ddd;">+36%</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Катеначчо</td><td style="padding: 3px; border: 1px solid #ddd;">Бразильский</td><td style="padding: 3px; border: 1px solid #ddd;">+44%</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Британский</td><td style="padding: 3px; border: 1px solid #ddd;">Тики-така</td><td style="padding: 3px; border: 1px solid #ddd;">+40%</td></tr>
                    </table>
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>Селектор стиля подсвечивается зеленым (выигрыш) или красным (проигрыш).</em></p>
                    <p style="font-size: 10px; color: #666;"><em>Бонус применяется ко всем игрокам выигрывающей команды. В случае проигрыша коллизии - проигравшая команда не теряет силу!</em></p>
                `;
            },

            tournament: () => {
                const currentType = getTournamentType();
                const typeNames = {
                    'friendly': 'Товарищеский матч',
                    'typeC': 'Тип C (кубки стран)',
                    'typeC_international': 'Международный кубок',
                    'typeB': 'Тип B (чемпионаты)',
                    'typeB_amateur': 'Конференция любительских',
                    'all': 'Все формы'
                };
                
                return `
                    <p><strong>Тип турнира</strong> определяет доступные физические формы игроков. Могут быть ошибки, тк не доработано.</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Текущий тип:</strong><br>
                        <span style="color: #006600; font-weight: bold;">${typeNames[currentType] || currentType}</span>
                    </div>
                    <p><strong>Типы турниров и формы:</strong></p>
                    <table style="width: 100%; font-size: 10px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 4px; border: 1px solid #ddd;">Тип</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Диапазон форм</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Особенности</th>
                        </tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Товарищеский</td><td style="padding: 4px; border: 1px solid #ddd;">100%</td><td style="padding: 4px; border: 1px solid #ddd;">Играются без учёта формы</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Тип C</td><td style="padding: 4px; border: 1px solid #ddd;">76-124%</td><td style="padding: 4px; border: 1px solid #ddd;">Кубки стран, кубки вызова - нет домашнего бонуса</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Тип B</td><td style="padding: 4px; border: 1px solid #ddd;">75-125%</td><td style="padding: 4px; border: 1px solid #ddd;">Чемпионаты, межсезонье</td></tr>
                        <tr style="background: #d4edda;"><td style="padding: 4px; border: 1px solid #ddd;"><strong>Международный</strong></td><td style="padding: 4px; border: 1px solid #ddd;"><strong>76-124%</strong></td><td style="padding: 4px; border: 1px solid #ddd;"><strong>Есть домашний бонус</strong></td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Любительский</td><td style="padding: 4px; border: 1px solid #ddd;">75-125%</td><td style="padding: 4px; border: 1px solid #ddd;">Конференция КЛК - аналог чемпионата</td></tr>
                    </table>
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>Калькулятор автоматически определяет тип турнира по странице матча.</em></p>
                    <p style="font-size: 10px; color: #666;"><em>Изменение типа турнира пересчитывает формы всех игроков.</em></p>
                `;
            },

            teamwork: () => {
                const homeTeamwork = document.getElementById('vs_teamwork_home')?.textContent || '0.00';
                const awayTeamwork = document.getElementById('vs_teamwork_away')?.textContent || '0.00';
                
                return `
                    <p><strong>Командная игра</strong> - бонус от способности "Командная Игра" (И).</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Текущие бонусы:</strong><br>
                        Хозяева: <span style="color: #006600; font-weight: bold;">+${homeTeamwork}</span><br>
                        Гости: <span style="color: #006600; font-weight: bold;">+${awayTeamwork}</span>
                    </div>
                    <p><strong>Коэффициенты по уровням:</strong></p>
                    <table style="width: 100%; font-size: 10px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 4px; border: 1px solid #ddd;">Уровень</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Коэффициент</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Пример (сила 100)</th>
                        </tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">И1</td><td style="padding: 4px; border: 1px solid #ddd;">0.5%</td><td style="padding: 4px; border: 1px solid #ddd;">+0.5</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">И2</td><td style="padding: 4px; border: 1px solid #ddd;">1.0%</td><td style="padding: 4px; border: 1px solid #ddd;">+1.0</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">И3</td><td style="padding: 4px; border: 1px solid #ddd;">2.0%</td><td style="padding: 4px; border: 1px solid #ddd;">+2.0</td></tr>
                        <tr style="background: #d4edda;"><td style="padding: 4px; border: 1px solid #ddd;"><strong>И4</strong></td><td style="padding: 4px; border: 1px solid #ddd;"><strong>3.0%</strong></td><td style="padding: 4px; border: 1px solid #ddd;"><strong>+3.0</strong></td></tr>
                    </table>
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>Бонус рассчитывается от модифицированной силы игрока (с учетом формы, позиции и т.д.) и применяется ко всем игрокам команды как дополнительная прибавка.</em></p>
                                    `;
            },

            atmosphere: () => {
                const homeAtmosphere = document.getElementById('vs_atmosphere_home')?.textContent || '0.00';
                const awayAtmosphere = document.getElementById('vs_atmosphere_away')?.textContent || '0.00';
                
                return `
                    <p><strong>Атмосфера в команде</strong> влияет на всех игроков команды.</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Текущие значения:</strong><br>
                        Хозяева: <span style="color: ${parseFloat(homeAtmosphere) >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">${homeAtmosphere}</span><br>
                        Гости: <span style="color: ${parseFloat(awayAtmosphere) >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">${awayAtmosphere}</span>
                    </div>
                    <p><strong>Возможные значения:</strong></p>
                    <table style="width: 100%; font-size: 10px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 4px; border: 1px solid #ddd;">Атмосфера</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Значение</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Влияние</th>
                        </tr>
                        <tr style="background: #f8d7da;"><td style="padding: 4px; border: 1px solid #ddd;">Очень плохая</td><td style="padding: 4px; border: 1px solid #ddd;">-3%</td><td style="padding: 4px; border: 1px solid #ddd;">Сильное снижение</td></tr>
                        <tr style="background: #f8d7da;"><td style="padding: 4px; border: 1px solid #ddd;">Плохая</td><td style="padding: 4px; border: 1px solid #ddd;">-2%</td><td style="padding: 4px; border: 1px solid #ddd;">Умеренное снижение</td></tr>
                        <tr style="background: #fff3cd;"><td style="padding: 4px; border: 1px solid #ddd;">Слабая</td><td style="padding: 4px; border: 1px solid #ddd;">-1%</td><td style="padding: 4px; border: 1px solid #ddd;">Слабое снижение</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Нейтральная</td><td style="padding: 4px; border: 1px solid #ddd;">0%</td><td style="padding: 4px; border: 1px solid #ddd;">Без влияния</td></tr>
                        <tr style="background: #d1ecf1;"><td style="padding: 4px; border: 1px solid #ddd;">Хорошая</td><td style="padding: 4px; border: 1px solid #ddd;">+1%</td><td style="padding: 4px; border: 1px solid #ddd;">Слабое улучшение</td></tr>
                        <tr style="background: #d4edda;"><td style="padding: 4px; border: 1px solid #ddd;">Отличная</td><td style="padding: 4px; border: 1px solid #ddd;">+2%</td><td style="padding: 4px; border: 1px solid #ddd;">Умеренное улучшение</td></tr>
                        <tr style="background: #d4edda;"><td style="padding: 4px; border: 1px solid #ddd;">Превосходная</td><td style="padding: 4px; border: 1px solid #ddd;">+3%</td><td style="padding: 4px; border: 1px solid #ddd;">Сильное улучшение</td></tr>
                    </table>
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>Данные загружаются автоматически со страницы состава команды.</em></p>
                    <p style="font-size: 10px; color: #666;"><em>Бонус применяется ко всем игрокам в составе по аналогии с остальными прибавками (спецумения, например).</em></p>
                `;
            },

            // Новые подсказки для составов и игроков
            player_selection: () => {
                return `
                    <p><strong>Выбор игроков</strong> - рекомендации по составлению оптимального состава.</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Советы по выбору:</strong>
                    </div>
                    <ul style="margin: 8px 0; padding-left: 16px; font-size: 10px;">
                        <li><strong>Сила:</strong>Выбирайте игроков, чтобы посчитать силу состава</li>
                    </ul>
                    <p><strong>Модификаторы позиций:</strong></p>
                    <table style="width: 100%; font-size: 9px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 3px; border: 1px solid #ddd;">Соответствие</th>
                            <th style="padding: 3px; border: 1px solid #ddd;">Модификатор</th>
                            <th style="padding: 3px; border: 1px solid #ddd;">Пример</th>
                        </tr>
                        <tr style="background: #d4edda;"><td style="padding: 3px; border: 1px solid #ddd;">Основная позиция</td><td style="padding: 3px; border: 1px solid #ddd;">100%</td><td style="padding: 3px; border: 1px solid #ddd;">CD на CD</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Близкая позиция</td><td style="padding: 3px; border: 1px solid #ddd;">90-95%</td><td style="padding: 3px; border: 1px solid #ddd;">CD на LD/RD</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Смежная позиция</td><td style="padding: 3px; border: 1px solid #ddd;">80-85%</td><td style="padding: 3px; border: 1px solid #ddd;">CD на DM</td></tr>
                        <tr style="background: #f8d7da;"><td style="padding: 3px; border: 1px solid #ddd;">Чужая позиция</td><td style="padding: 3px; border: 1px solid #ddd;">70%</td><td style="padding: 3px; border: 1px solid #ddd;">CD на ST</td></tr>
                    </table>
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>Наведите курсор на селектор игрока для детальной информации.</em></p>
                    <p style="font-size: 10px; color: #666;"><em>Калькулятор автоматически сортирует игроков по силе для позиции.</em></p>
                `;
            },

            physical_form: () => {
                return `
                    <p><strong>Физическая форма</strong> - ключевой фактор силы игрока в матче.</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Влияние на силу:</strong><br>
                        Сила в матче = Базовая сила × Модификатор формы
                    </div>
                    <p><strong>Диапазоны форм по турнирам:</strong></p>
                    <table style="width: 100%; font-size: 10px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 4px; border: 1px solid #ddd;">Турнир</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Мин. форма</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Макс. форма</th>
                        </tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Товарищеский</td><td style="padding: 4px; border: 1px solid #ddd;">100%</td><td style="padding: 4px; border: 1px solid #ddd;">100%</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Тип C</td><td style="padding: 4px; border: 1px solid #ddd;">76%</td><td style="padding: 4px; border: 1px solid #ddd;">124%</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Тип B</td><td style="padding: 4px; border: 1px solid #ddd;">75%</td><td style="padding: 4px; border: 1px solid #ddd;">125%</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Международный</td><td style="padding: 4px; border: 1px solid #ddd;">76%</td><td style="padding: 4px; border: 1px solid #ddd;">124%</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">Любительский</td><td style="padding: 4px; border: 1px solid #ddd;">75%</td><td style="padding: 4px; border: 1px solid #ddd;">125%</td></tr>
                    </table>
                   
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>Калькулятор автоматически определяет форму по данным игрока и типу турнира.</em></p>
                    <p style="font-size: 10px; color: #666;"><em>Вы можете вручную изменить форму игрока в селекторе.</em></p>
                `;
            },

            abilities: () => {
                return `
                    <p><strong>Способности игроков</strong> дают дополнительные бонусы в зависимости от стиля игры.</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Основные способности:</strong>
                    </div>
                    <table style="width: 100%; font-size: 9px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 3px; border: 1px solid #ddd;">Способность</th>
                            <th style="padding: 3px; border: 1px solid #ddd;">Лучший стиль</th>
                            <th style="padding: 3px; border: 1px solid #ddd;">Бонус (4 ур.)</th>
                        </tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Скорость (Ск)</td><td style="padding: 3px; border: 1px solid #ddd;">Бей-беги</td><td style="padding: 3px; border: 1px solid #ddd;">+40%</td></tr>
                    </table>
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>Бонусы способностей зависят от выбранного стиля игры команды.</em></p>
                    <p style="font-size: 10px; color: #666;"><em>Лидерство работает только при наличии ровно 1 лидера в линии.</em></p>
                `;
            },

            // Детальная подсказка для конкретного игрока
            player_details: (context) => {
                const { player, matchPosition, physicalFormId, customStyle } = context;
                if (!player) return '<p>Игрок не найден.</p>';
                
                const baseStr = Number(player.baseStrength) || Number(player.realStr) || 0;
                const age = Number(player.age) || 0;
                const form = Number(player.form) || 0;
                const fatigue = Number(player.fatigue) || 0;
                
                // Рассчитываем все модификаторы
                const physicalFormModifier = getPhysicalFormModifier(physicalFormId);
                const realityModifier = getRealityBonus(player.real_status, player.real_sign);
                const positionModifier = getPositionModifier(player.mainPos, player.secondPos, matchPosition);
                
                // Усталость
                let fatigueModifier;
                const tournamentType = getTournamentType();
                if (tournamentType === 'friendly') {
                    fatigueModifier = 1 - (25 / 100);
                } else {
                    fatigueModifier = getFatigueBonus(fatigue);
                }
                
                // Итоговая сила
                const finalStr = Math.round(baseStr * physicalFormModifier * fatigueModifier * realityModifier * positionModifier);
                
                // Определяем цвет формы
                let formColor = '#666';
                if (form >= 110) formColor = '#28a745';
                else if (form >= 95) formColor = '#ffc107';
                else if (form >= 85) formColor = '#fd7e14';
                else formColor = '#dc3545';
                
                // Определяем цвет усталости
                let fatigueColor = '#666';
                if (fatigue <= 25) fatigueColor = '#28a745';
                else if (fatigue <= 50) fatigueColor = '#ffc107';
                else if (fatigue <= 75) fatigueColor = '#fd7e14';
                else fatigueColor = '#dc3545';
                
                return `
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin-bottom: 8px;">
                        <strong style="font-size: 12px;">${player.name}</strong><br>
                        <span style="font-size: 10px; color: #666;">
                            ${player.mainPos}${player.secondPos ? '/' + player.secondPos : ''} | ${age} лет
                        </span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <div style="flex: 1;">
                            <strong>Базовая сила:</strong> ${baseStr}<br>
                            <strong>Итоговая сила:</strong> <span style="color: #006600; font-weight: bold;">${finalStr}</span>
                        </div>
                        <div style="flex: 1; text-align: right;">
                            <strong>Позиция:</strong> ${matchPosition}<br>
                            <strong>Стиль:</strong> ${customStyle || 'norm'}
                        </div>
                    </div>
                    
                    <table style="width: 100%; font-size: 10px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 4px; border: 1px solid #ddd;">Модификатор</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Значение</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Влияние</th>
                        </tr>
                        <tr>
                            <td style="padding: 4px; border: 1px solid #ddd;">Физ. форма</td>
                            <td style="padding: 4px; border: 1px solid #ddd; color: ${formColor}; font-weight: bold;">${form}%</td>
                            <td style="padding: 4px; border: 1px solid #ddd;">×${physicalFormModifier.toFixed(3)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px; border: 1px solid #ddd;">Усталость</td>
                            <td style="padding: 4px; border: 1px solid #ddd; color: ${fatigueColor}; font-weight: bold;">${fatigue}%</td>
                            <td style="padding: 4px; border: 1px solid #ddd;">×${fatigueModifier.toFixed(3)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px; border: 1px solid #ddd;">Позиция</td>
                            <td style="padding: 4px; border: 1px solid #ddd;">${matchPosition}</td>
                            <td style="padding: 4px; border: 1px solid #ddd;">×${positionModifier.toFixed(3)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px; border: 1px solid #ddd;">Реальность</td>
                            <td style="padding: 4px; border: 1px solid #ddd;">${player.real_status || 'нет'}</td>
                            <td style="padding: 4px; border: 1px solid #ddd;">×${realityModifier.toFixed(3)}</td>
                        </tr>
                    </table>
                    
                    ${player.abilities ? `
                        <div style="margin-top: 8px;">
                            <strong>Способности:</strong><br>
                            <span style="font-size: 10px; color: #666;">${player.abilities}</span>
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 8px; font-size: 10px; color: #666;">
                        <em>💡 Расчет: ${baseStr} × ${physicalFormModifier.toFixed(3)} × ${fatigueModifier.toFixed(3)} × ${realityModifier.toFixed(3)} × ${positionModifier.toFixed(3)} = ${finalStr}</em>
                    </div>
                `;
            },

            physical_form: () => {
                const tournamentType = getTournamentType();
                const typeNames = {
                    'friendly': 'Товарищеский',
                    'typeC': 'Тип C',
                    'typeB': 'Тип B',
                    'typeC_international': 'Международный',
                    'typeB_amateur': 'Любительский'
                };
                
                return `
                    <p><strong>Физическая форма</strong> влияет на итоговую силу игрока.</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Текущий турнир:</strong> ${typeNames[tournamentType] || tournamentType}
                    </div>
                    <p><strong>Влияние на силу:</strong></p>
                    <table style="width: 100%; font-size: 10px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 4px; border: 1px solid #ddd;">Форма</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Модификатор</th>
                            <th style="padding: 4px; border: 1px solid #ddd;">Пример (сила 100)</th>
                        </tr>
                        <tr style="background: #f8d7da;"><td style="padding: 4px; border: 1px solid #ddd;">76% ↓</td><td style="padding: 4px; border: 1px solid #ddd;">×0.76</td><td style="padding: 4px; border: 1px solid #ddd;">76</td></tr>
                        <tr><td style="padding: 4px; border: 1px solid #ddd;">88% ↑</td><td style="padding: 4px; border: 1px solid #ddd;">×0.88</td><td style="padding: 4px; border: 1px solid #ddd;">88</td></tr>
                        <tr style="background: #d4edda;"><td style="padding: 4px; border: 1px solid #ddd;">100% ↑</td><td style="padding: 4px; border: 1px solid #ddd;">×1.00</td><td style="padding: 4px; border: 1px solid #ddd;">100</td></tr>
                        <tr style="background: #d4edda;"><td style="padding: 4px; border: 1px solid #ddd;">117% ↑</td><td style="padding: 4px; border: 1px solid #ddd;">×1.17</td><td style="padding: 4px; border: 1px solid #ddd;">117</td></tr>
                        <tr style="background: #d4edda;"><td style="padding: 4px; border: 1px solid #ddd;">125% ↓</td><td style="padding: 4px; border: 1px solid #ddd;">×1.25</td><td style="padding: 4px; border: 1px solid #ddd;">125</td></tr>
                    </table>
                    <p><strong>Направления формы:</strong></p>
                    <ul style="margin: 8px 0; padding-left: 16px; font-size: 10px;">
                        <li><strong>↑ Растет:</strong> Форма улучшается</li>
                        <li><strong>↓ Падает:</strong> Форма ухудшается</li>
                        </ul>
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>Чем выше форма - тем лучше!</em></p>
                `;
            },

            abilities: () => {
                const currentStyle = window.homeStyle?.value || window.awayStyle?.value || 'norm';
                const styleNames = {
                    'norm': 'Нормальный',
                    'sp': 'Спартаковский', 
                    'brazil': 'Бразильский',
                    'tiki': 'Тики-така',
                    'bb': 'Бей-беги',
                    'kat': 'Катеначчо',
                    'brit': 'Британский'
                };
                
                return `
                    <p><strong>Способности игроков</strong> дают бонусы в зависимости от стиля команды.</p>
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
                        <strong>Текущий стиль:</strong> ${styleNames[currentStyle]}
                    </div>
                    <p><strong>Основные способности:</strong></p>
                    <table style="width: 100%; font-size: 9px; border-collapse: collapse; margin: 8px 0;">
                        <tr style="background: #e9ecef;">
                            <th style="padding: 3px; border: 1px solid #ddd;">Способность</th>
                            <th style="padding: 3px; border: 1px solid #ddd;">Лучший стиль</th>
                            <th style="padding: 3px; border: 1px solid #ddd;">Бонус (4 ур.)</th>
                        </tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Скорость (Ск)</td><td style="padding: 3px; border: 1px solid #ddd;">Бей-беги</td><td style="padding: 3px; border: 1px solid #ddd;">+40%</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Игра головой(Г)</td><td style="padding: 3px; border: 1px solid #ddd;">Британский</td><td style="padding: 3px; border: 1px solid #ddd;">+40%</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Пас Дальний (Пд)</td><td style="padding: 3px; border: 1px solid #ddd;">Катеначчо</td><td style="padding: 3px; border: 1px solid #ddd;">+40%</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Пас короткий (Пк)</td><td style="padding: 3px; border: 1px solid #ddd;">Спартаковский</td><td style="padding: 3px; border: 1px solid #ddd;">+40%</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Дриблинг (Д)</td><td style="padding: 3px; border: 1px solid #ddd;">Бразильский</td><td style="padding: 3px; border: 1px solid #ddd;">+40%</td></tr>
                        <tr><td style="padding: 3px; border: 1px solid #ddd;">Комбинации (Км)</td><td style="padding: 3px; border: 1px solid #ddd;">Тики-така</td><td style="padding: 3px; border: 1px solid #ddd;">+40%</td></tr>
                    </table>
                    <p><strong>Специальные способности:</strong></p>
                    <ul style="margin: 8px 0; padding-left: 16px; font-size: 10px;">
                        <li><strong>Лидерство (Л):</strong> Дает бонус всей линии (3-12%)</li>
                        <li><strong>Интуиция (И):</strong> Командная игра (0.5-3%)</li>
                        <li><strong>Капитанство (Ка):</strong> Улучшает капитанские бонусы</li>
                        <li><strong>Вратарские (В, Р):</strong> Зависят от наличия SW в защите</li>
                    </ul>
                    <p style="font-size: 10px; color: #666; margin-top: 8px;"><em>Подбирайте игроков с способностями, подходящими под стиль команды.</em></p>
                `;
            }
        };
        
        const hintFunction = hints[type];
        if (typeof hintFunction === 'function') {
            return hintFunction();
        }
        
        return hints[type] || '<p>Информация недоступна.</p>';
    }

    /**
     * Позиционирует подсказку относительно кнопки
     * @param {HTMLElement} hint - Элемент подсказки
     * @param {HTMLElement} button - Кнопка-триггер
     * @param {string} position - Позиция ('right top', 'left bottom', etc.)
     */
    function positionHint(hint, button, position = 'right top') {
        const buttonRect = button.getBoundingClientRect();
        const hintRect = hint.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        let left, top;
        
        switch (position) {
            case 'right top':
                left = buttonRect.right + 8;
                top = buttonRect.top;
                break;
            case 'left bottom':
                left = buttonRect.left - hintRect.width - 8;
                top = buttonRect.bottom + 8;
                break;
            case 'center bottom':
                left = buttonRect.left + (buttonRect.width - hintRect.width) / 2;
                top = buttonRect.bottom + 8;
                break;
            default:
                left = buttonRect.right + 8;
                top = buttonRect.top;
        }
        
        // Корректируем позицию, чтобы подсказка не выходила за границы экрана
        if (left + hintRect.width > viewport.width) {
            left = buttonRect.left - hintRect.width - 8;
        }
        if (left < 0) {
            left = 8;
        }
        if (top + hintRect.height > viewport.height) {
            top = buttonRect.top - hintRect.height - 8;
        }
        if (top < 0) {
            top = 8;
        }
        
        hint.style.left = left + window.scrollX + 'px';
        hint.style.top = top + window.scrollY + 'px';
    }

    /**
     * Добавляет кнопку подсказки к элементу
     * @param {HTMLElement} container - Контейнер для кнопки
     * @param {string} type - Тип подсказки
     * @param {string} title - Заголовок подсказки
     * @param {Object} context - Дополнительный контекст для подсказки
     */
    function addHelpButton(container, type, title, context = {}) {
        const helpBtn = document.createElement('button');
        helpBtn.className = 'vs-help-btn';
        helpBtn.title = 'Показать подсказку';
        helpBtn.onclick = (e) => {
            e.preventDefault();
            showCalculatorHint(helpBtn, type, title, 450, context);
            return false;
        };
        
        // Улучшенные стили кнопки
        helpBtn.style.cssText = `
            width: 16px;
            height: 16px;
            border: 1px solid #aaa;
            background: linear-gradient(135deg, #f8f8f8, #e8e8e8);
            cursor: pointer;
            display: inline-block;
            vertical-align: middle;
            margin: 0 2px 0 4px;
            border-radius: 3px;
            font-size: 10px;
            color: #666;
            text-align: center;
            line-height: 14px;
            transition: all 0.2s ease;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        `;
        helpBtn.textContent = '?';
        
        // Улучшенные hover эффекты
        helpBtn.onmouseover = () => {
            helpBtn.style.background = 'linear-gradient(135deg, #e8e8e8, #d8d8d8)';
            helpBtn.style.borderColor = '#999';
            helpBtn.style.transform = 'translateY(-1px)';
            helpBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
        };
        helpBtn.onmouseout = () => {
            helpBtn.style.background = 'linear-gradient(135deg, #f8f8f8, #e8e8e8)';
            helpBtn.style.borderColor = '#aaa';
            helpBtn.style.transform = 'translateY(0)';
            helpBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
        };
        
        container.appendChild(helpBtn);
    }

    /**
     * Создает контекстную подсказку при наведении
     * @param {HTMLElement} element - Элемент для подсказки
     * @param {string} content - Содержимое подсказки
     * @param {string} position - Позиция подсказки
     */
    function addHoverHint(element, content, position = 'top') {
        let hintElement = null;
        let showTimeout = null;
        let hideTimeout = null;

        const showHint = () => {
            if (hintElement) return;

            hintElement = document.createElement('div');
            hintElement.className = 'vs-hover-hint';
            hintElement.innerHTML = content;
            hintElement.style.cssText = `
                position: absolute;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 6px 8px;
                border-radius: 4px;
                font-size: 10px;
                line-height: 1.3;
                z-index: 10001;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s ease;
                max-width: 200px;
                word-wrap: break-word;
            `;

            document.body.appendChild(hintElement);
            
            // Позиционируем подсказку
            const rect = element.getBoundingClientRect();
            const hintRect = hintElement.getBoundingClientRect();
            
            let left, top;
            switch (position) {
                case 'top':
                    left = rect.left + (rect.width - hintRect.width) / 2;
                    top = rect.top - hintRect.height - 5;
                    break;
                case 'bottom':
                    left = rect.left + (rect.width - hintRect.width) / 2;
                    top = rect.bottom + 5;
                    break;
                case 'left':
                    left = rect.left - hintRect.width - 5;
                    top = rect.top + (rect.height - hintRect.height) / 2;
                    break;
                case 'right':
                    left = rect.right + 5;
                    top = rect.top + (rect.height - hintRect.height) / 2;
                    break;
            }

            // Корректируем позицию, чтобы не выходить за границы экрана
            left = Math.max(5, Math.min(left, window.innerWidth - hintRect.width - 5));
            top = Math.max(5, Math.min(top, window.innerHeight - hintRect.height - 5));

            hintElement.style.left = left + window.scrollX + 'px';
            hintElement.style.top = top + window.scrollY + 'px';
            
            // Показываем с анимацией
            setTimeout(() => {
                if (hintElement) hintElement.style.opacity = '1';
            }, 10);
        };

        const hideHint = () => {
            if (hintElement) {
                hintElement.style.opacity = '0';
                setTimeout(() => {
                    if (hintElement && hintElement.parentNode) {
                        hintElement.parentNode.removeChild(hintElement);
                    }
                    hintElement = null;
                }, 200);
            }
        };

        element.addEventListener('mouseenter', () => {
            clearTimeout(hideTimeout);
            showTimeout = setTimeout(showHint, 500); // Задержка 500ms
        });

        element.addEventListener('mouseleave', () => {
            clearTimeout(showTimeout);
            hideTimeout = setTimeout(hideHint, 100);
        });
    }

    /**
     * Добавляет интерактивную подсказку с примером расчета
     * @param {HTMLElement} container - Контейнер для кнопки
     * @param {string} type - Тип подсказки
     * @param {string} title - Заголовок подсказки
     * @param {Function} calculator - Функция для расчета примера
     */
    function addInteractiveHelpButton(container, type, title, calculator = null) {
        const helpBtn = document.createElement('button');
        helpBtn.className = 'vs-help-btn interactive';
        helpBtn.title = 'Показать интерактивную подсказку';
        
        // Добавляем индикатор интерактивности
        helpBtn.innerHTML = '<span style="font-size: 8px;">?</span><span style="font-size: 6px; position: absolute; top: 1px; right: 1px;">⚡</span>';
        
        helpBtn.onclick = (e) => {
            e.preventDefault();
            const context = calculator ? { example: calculator() } : {};
            showCalculatorHint(helpBtn, type, title, 500, context);
            return false;
        };
        
        // Стили для интерактивной кнопки
        helpBtn.style.cssText = `
            width: 16px;
            height: 16px;
            border: 1px solid #007bff;
            background: linear-gradient(135deg, #e3f2fd, #bbdefb);
            cursor: pointer;
            display: inline-block;
            vertical-align: middle;
            margin: 0 2px 0 4px;
            border-radius: 3px;
            color: #1976d2;
            text-align: center;
            line-height: 14px;
            transition: all 0.2s ease;
            box-shadow: 0 1px 2px rgba(0,123,255,0.2);
            position: relative;
        `;
        
        // Hover эффекты для интерактивной кнопки
        helpBtn.onmouseover = () => {
            helpBtn.style.background = 'linear-gradient(135deg, #bbdefb, #90caf9)';
            helpBtn.style.borderColor = '#0056b3';
            helpBtn.style.transform = 'translateY(-1px)';
            helpBtn.style.boxShadow = '0 2px 4px rgba(0,123,255,0.3)';
        };
        helpBtn.onmouseout = () => {
            helpBtn.style.background = 'linear-gradient(135deg, #e3f2fd, #bbdefb)';
            helpBtn.style.borderColor = '#007bff';
            helpBtn.style.transform = 'translateY(0)';
            helpBtn.style.boxShadow = '0 1px 2px rgba(0,123,255,0.2)';
        };
        
        container.appendChild(helpBtn);
    }

    /**
     * Добавляет поддержку клавиатурных сокращений для подсказок
     */
    function initializeKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl + H - показать справку по горячим клавишам
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault();
                showKeyboardShortcutsHelp();
            }
            
            // Escape - закрыть все подсказки
            if (e.key === 'Escape') {
                removeExistingHints();
            }
            
            // F1 - показать общую справку
            if (e.key === 'F1') {
                e.preventDefault();
                showGeneralHelp();
            }
        });
    }

    /**
     * Показывает справку по клавиатурным сокращениям
     */
    function showKeyboardShortcutsHelp() {
        const hint = document.createElement('div');
        hint.className = 'vs-calculator-hint keyboard-shortcuts';
        hint.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 400px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            padding: 0;
            font-size: 11px;
            line-height: 1.4;
        `;
        
        hint.innerHTML = `
            <div style="background: linear-gradient(135deg, #006600, #008800); color: white; font-weight: bold; padding: 10px 12px; border-radius: 6px 6px 0 0;">
                Клавиатурные сокращения
                <button onclick="this.parentElement.parentElement.remove()" style="position: absolute; top: 8px; right: 10px; border: none; background: none; font-size: 18px; cursor: pointer; color: rgba(255,255,255,0.8);">×</button>
            </div>
            <div style="padding: 12px;">
                <table style="width: 100%; font-size: 10px; border-collapse: collapse;">
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 6px; text-align: left; border-bottom: 1px solid #ddd;">Сочетание</th>
                        <th style="padding: 6px; text-align: left; border-bottom: 1px solid #ddd;">Действие</th>
                    </tr>
                    <tr>
                        <td style="padding: 4px; border-bottom: 1px solid #eee;"><kbd style="background: #f8f9fa; padding: 2px 4px; border-radius: 2px;">Ctrl + H</kbd></td>
                        <td style="padding: 4px; border-bottom: 1px solid #eee;">Показать эту справку</td>
                    </tr>
                    <tr>
                        <td style="padding: 4px; border-bottom: 1px solid #eee;"><kbd style="background: #f8f9fa; padding: 2px 4px; border-radius: 2px;">F1</kbd></td>
                        <td style="padding: 4px; border-bottom: 1px solid #eee;">Общая справка по калькулятору</td>
                    </tr>
                    <tr>
                        <td style="padding: 4px; border-bottom: 1px solid #eee;"><kbd style="background: #f8f9fa; padding: 2px 4px; border-radius: 2px;">Escape</kbd></td>
                        <td style="padding: 4px; border-bottom: 1px solid #eee;">Закрыть все подсказки</td>
                    </tr>
                    <tr>
                        <td style="padding: 4px;"><kbd style="background: #f8f9fa; padding: 2px 4px; border-radius: 2px;">?</kbd></td>
                        <td style="padding: 4px;">Кнопки подсказок в интерфейсе</td>
                    </tr>
                </table>
                <p style="margin-top: 12px; font-size: 10px; color: #666;">
                    Наведите курсор на элементы интерфейса для получения дополнительной информации.
                </p>
            </div>
        `;
        
        document.body.appendChild(hint);
    }

    /**
     * Показывает общую справку по калькулятору
     */
    function showGeneralHelp() {
        const hint = document.createElement('div');
        hint.className = 'vs-calculator-hint general-help';
        hint.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 500px;
            max-height: 80vh;
            overflow-y: auto;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            padding: 0;
            font-size: 11px;
            line-height: 1.4;
        `;
        
        hint.innerHTML = `
            <div style="background: linear-gradient(135deg, #006600, #008800); color: white; font-weight: bold; padding: 10px 12px; border-radius: 6px 6px 0 0;">
                Справка по калькулятору силы команд
                <button onclick="this.parentElement.parentElement.remove()" style="position: absolute; top: 8px; right: 10px; border: none; background: none; font-size: 18px; cursor: pointer; color: rgba(255,255,255,0.8);">×</button>
            </div>
            <div style="padding: 12px;">
                <h4 style="margin: 0 0 8px 0; color: #006600;">Основные функции</h4>
                <ul style="margin: 0 0 12px 0; padding-left: 16px; font-size: 10px;">
                    <li><strong>Расчет силы команд</strong> - учитывает все бонусы и модификаторы</li>
                    <li><strong>Автоматическая загрузка</strong> - составы и данные команд</li>
                    <li><strong>Интерактивные подсказки</strong> - помощь по всем элементам</li>
                    <li><strong>Сохранение состояний</strong> - автоматическое сохранение настроек</li>
                </ul>
                
                <h4 style="margin: 12px 0 8px 0; color: #006600;">Порядок работы</h4>
                <ol style="margin: 0 0 12px 0; padding-left: 16px; font-size: 10px;">
                    <li>Выберите тип турнира (определяется автоматически)</li>
                    <li>Настройте погодные условия</li>
                    <li>Выберите стили игры и тактические настройки</li>
                    <li>Составьте оптимальные составы команд</li>
                    <li>Назначьте капитанов и исполнителей стандартов</li>
                    <li>Нажмите "Рассчитать силу" для получения результата</li>
                </ol>
                
                <h4 style="margin: 12px 0 8px 0; color: #006600;">Учитываемые факторы</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 10px;">
                    <div>
                        <strong>Игроки:</strong>
                        <ul style="margin: 4px 0; padding-left: 12px;">
                            <li>Базовая сила</li>
                            <li>Физическая форма</li>
                            <li>Позиционные модификаторы</li>
                            <li>Способности</li>
                            <li>Усталость</li>
                        </ul>
                    </div>
                    <div>
                        <strong>Команда:</strong>
                        <ul style="margin: 4px 0; padding-left: 12px;">
                            <li>Стиль игры</li>
                            <li>Сыгранность</li>
                            <li>Лидерство</li>
                            <li>Атмосфера</li>
                            <li>Настрой и грубость</li>
                        </ul>
                    </div>
                </div>
                
                <h4 style="margin: 12px 0 8px 0; color: #006600;">Внешние факторы</h4>
                <ul style="margin: 0 0 12px 0; padding-left: 16px; font-size: 10px;">
                    <li><strong>Погода:</strong> Температура и условия влияют на игроков</li>
                    <li><strong>Домашний бонус:</strong> Посещаемость стадиона (для некоторых турниров)</li>
                    <li><strong>Коллизии стилей:</strong> Взаимодействие стилей команд</li>
                </ul>
                
                <p style="margin-top: 12px; font-size: 10px; color: #666; text-align: center;">
                    <strong>Версия:</strong> ${document.querySelector('script[src*="Virtual-Soccer-Strength-Analyzer"]')?.textContent?.match(/@version\s+([\d.]+)/)?.[1] || 'неизвестна'}<br>
                    Для получения подробной справки нажимайте кнопки <strong>?</strong> рядом с элементами интерфейса.
                </p>
            </div>
        `;
        
        document.body.appendChild(hint);
    }

    // Инициализируем клавиатурные сокращения при загрузке
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeKeyboardShortcuts);
    } else {
        initializeKeyboardShortcuts();
    }

    // ===== НОВЫЕ ФУНКЦИИ ДЛЯ ВКЛАДОК КОМАНД =====

    function createTeamTabsContainer(homeTeamName, awayTeamName, homeContent, awayContent) {
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'team-tabs-container';
        tabsContainer.id = 'vsol-team-tabs-container';
        tabsContainer.style.cssText = `
            background: white;
            box-sizing: border-box;
        `;

        // Заголовок с вкладками
        const tabsHeader = document.createElement('div');
        tabsHeader.className = 'tabs-header';
        tabsHeader.id = 'vsol-tabs-header';
        tabsHeader.style.cssText = `
            background: rgb(248, 248, 248);
            border-bottom: 1px solid rgb(204, 204, 204);
            padding: 8px 12px;
        `;

        const homeTabLink = document.createElement('a');
        homeTabLink.href = '#';
        homeTabLink.className = 'tab-link active';
        homeTabLink.id = 'tab-home';
        homeTabLink.textContent = homeTeamName + ' (дома)';
        homeTabLink.style.cssText = `
            text-decoration: none;
            padding: 5px 10px;
            margin-right: 5px;
            color: rgb(0, 0, 0);
            font-weight: bold;
        `;

        const separator = document.createTextNode(' | ');

        const awayTabLink = document.createElement('a');
        awayTabLink.href = '#';
        awayTabLink.className = 'tab-link';
        awayTabLink.id = 'tab-away';
        awayTabLink.textContent = awayTeamName + ' (в гостях)';
        awayTabLink.style.cssText = `
            text-decoration: none;
            padding: 5px 10px;
            margin-right: 5px;
            color: rgb(102, 102, 102);
            font-weight: normal;
        `;

        // Обработчики переключения вкладок
        homeTabLink.onclick = (e) => {
            e.preventDefault();
            showTeamTab('home');
        };

        awayTabLink.onclick = (e) => {
            e.preventDefault();
            showTeamTab('away');
        };

        tabsHeader.appendChild(homeTabLink);
        tabsHeader.appendChild(separator);
        tabsHeader.appendChild(awayTabLink);

        // Контент вкладок
        const homeTabContent = document.createElement('div');
        homeTabContent.id = 'tab-content-home';
        homeTabContent.className = 'tab-content active';
        homeTabContent.style.cssText = `
            display: block;
        `;
        homeTabContent.appendChild(homeContent);

        const awayTabContent = document.createElement('div');
        awayTabContent.id = 'tab-content-away';
        awayTabContent.className = 'tab-content';
        awayTabContent.style.cssText = `
            display: none;
        `;
        awayTabContent.appendChild(awayContent);

        tabsContainer.appendChild(tabsHeader);
        tabsContainer.appendChild(homeTabContent);
        tabsContainer.appendChild(awayTabContent);

        return tabsContainer;
    }

    function showTeamTab(tabName) {
        // Скрываем все вкладки
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
            content.classList.remove('active');
        });

        // Убираем активный класс со всех ссылок
        document.querySelectorAll('.tab-link').forEach(link => {
            link.classList.remove('active');
            link.style.fontWeight = 'normal';
            link.style.color = 'rgb(102, 102, 102)';
        });

        // Показываем нужную вкладку
        const targetContent = document.getElementById(`tab-content-${tabName}`);
        const targetLink = document.getElementById(`tab-${tabName}`);

        if (targetContent) {
            targetContent.style.display = 'block';
            targetContent.classList.add('active');
        }

        if (targetLink) {
            targetLink.classList.add('active');
            targetLink.style.fontWeight = 'bold';
            targetLink.style.color = 'rgb(0, 0, 0)';
        }
    }

    function createTeamTabContent(teamSettings, lineupBlock, teamName) {
        const content = document.createElement('div');
        content.id = `vsol-team-content-${teamName.toLowerCase().replace(/\s+/g, '-')}`;

        // Секция тактических настроек
        const tacticsSection = document.createElement('div');
        tacticsSection.className = 'section';
        tacticsSection.id = `vsol-tactics-section-${teamName.toLowerCase().replace(/\s+/g, '-')}`;
        tacticsSection.style.marginBottom = '20px';

        // Добавляем настройки напрямую без дополнительной обертки
        tacticsSection.appendChild(teamSettings);

        // Секция состава
        const lineupSection = document.createElement('div');
        lineupSection.className = 'section';
        lineupSection.id = `vsol-lineup-section-${teamName.toLowerCase().replace(/\s+/g, '-')}`;
        lineupSection.style.marginBottom = '20px';

        // Заголовок состава в стиле игры
        const lineupHeaderTable = document.createElement('table');
        lineupHeaderTable.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 2px;
        `;

        const lineupHeaderRow = document.createElement('tr');
        lineupHeaderRow.style.backgroundColor = 'rgb(0, 102, 0)';

        const lineupHeaderCell = document.createElement('td');
        lineupHeaderCell.className = 'lh18 txtw';
        lineupHeaderCell.style.cssText = `
            text-align: center;
            padding: 4px;
            color: white;
            font-weight: bold;
            font-size: 11px;
        `;
        lineupHeaderCell.textContent = 'Состав';

        lineupHeaderRow.appendChild(lineupHeaderCell);
        lineupHeaderTable.appendChild(lineupHeaderRow);

        // Добавляем подсказку к заголовку состава
        setTimeout(() => {
            addHelpButton(lineupHeaderCell, 'player_selection', 'Выбор игроков');
        }, 100);

        // Добавляем состав напрямую без дополнительной обертки
        lineupSection.appendChild(lineupHeaderTable);
        lineupSection.appendChild(lineupBlock.block);

        // Секция ролей (капитан, штрафные, угловые, пенальти)
        const rolesSection = document.createElement('div');
        rolesSection.className = 'section';
        rolesSection.id = `vsol-roles-section-${teamName.toLowerCase().replace(/\s+/g, '-')}`;

        // Заголовок ролей в стиле игры
        const rolesHeaderTable = document.createElement('table');
        rolesHeaderTable.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 2px;
        `;

        const rolesHeaderRow = document.createElement('tr');
        rolesHeaderRow.style.backgroundColor = 'rgb(0, 102, 0)';

        const rolesHeaderCell = document.createElement('td');
        rolesHeaderCell.className = 'lh18 txtw';
        rolesHeaderCell.style.cssText = `
            text-align: center;
            padding: 4px;
            color: white;
            font-weight: bold;
            font-size: 11px;
        `;
        rolesHeaderCell.textContent = 'Настройки ролей';

        rolesHeaderRow.appendChild(rolesHeaderCell);
        rolesHeaderTable.appendChild(rolesHeaderRow);

        // Добавляем подсказку к заголовку ролей
        setTimeout(() => {
            addHelpButton(rolesHeaderCell, 'abilities', 'Способности игроков');
        }, 100);

        // Создаем таблицу ролей
        const rolesTable = document.createElement('table');
        rolesTable.style.cssText = `
            width: 271px;
            border-collapse: collapse;
        `;

        const rolesTbody = document.createElement('tbody');

        // Заголовок таблицы ролей
        const headerRow = document.createElement('tr');
        headerRow.style.backgroundColor = 'rgb(0, 102, 0)';

        const roleHeaderCell = document.createElement('td');
        roleHeaderCell.className = 'lh18 txtw';
        roleHeaderCell.style.cssText = `
            width: 40px;
            text-align: center;
            padding: 4px;
            color: white;
            font-weight: bold;
            font-size: 11px;
        `;
        roleHeaderCell.innerHTML = '<b>Роль</b>';

        const playerHeaderCell = document.createElement('td');
        playerHeaderCell.className = 'lh18 txtw';
        playerHeaderCell.style.cssText = `
            text-align: center;
            padding: 4px;
            color: white;
            font-weight: bold;
            font-size: 11px;
        `;
        playerHeaderCell.innerHTML = '<b>Игрок</b>';

        headerRow.appendChild(roleHeaderCell);
        headerRow.appendChild(playerHeaderCell);
        rolesTbody.appendChild(headerRow);

        // Строка капитана
        const captainRowTr = document.createElement('tr');

        const captainRoleCell = document.createElement('td');
        captainRoleCell.className = 'qt';
        captainRoleCell.style.cssText = `
            height: 20px;
            background-color: rgb(255, 255, 187);
            text-align: center;
            font-family: Courier New, monospace;
            font-size: 11px;
        `;
        captainRoleCell.title = 'Капитан команды';
        captainRoleCell.innerHTML = '<img src="pics/captbig.png" style="vertical-align:top">';

        const captainPlayerCell = document.createElement('td');
        captainPlayerCell.className = 'txtl';

        // Используем существующий селектор капитана из lineupBlock
        if (lineupBlock && lineupBlock.captainSelect) {
            // Применяем стили к селектору капитана для соответствия таблице
            lineupBlock.captainSelect.style.cssText = `
                width: 271px;
                height: 20px;
                font-size: 11px;
                border: 1px solid rgb(170, 170, 170);
                padding: 2px 4px;
                box-sizing: border-box;
                background: white;
            `;
            captainPlayerCell.appendChild(lineupBlock.captainSelect);
        } else {
            // Fallback если селектор не найден
            captainPlayerCell.innerHTML = `
                <select style="width:271px; height:20px; font-size:11px;">
                    <option value="-1" class="grD">некому быть капитаном команды</option>
                </select>
            `;
        }

        captainRowTr.appendChild(captainRoleCell);
        captainRowTr.appendChild(captainPlayerCell);
        rolesTbody.appendChild(captainRowTr);

        // Строка штрафных
        const penaltyRow = document.createElement('tr');

        const penaltyRoleCell = document.createElement('td');
        penaltyRoleCell.className = 'qt';
        penaltyRoleCell.style.cssText = `
            height: 20px;
            background-color: rgb(255, 255, 187);
            text-align: center;
            font-family: Courier New, monospace;
            font-size: 11px;
        `;
        penaltyRoleCell.title = 'Исполнитель штрафных ударов';
        penaltyRoleCell.textContent = 'Шт';

        const penaltyPlayerCell = document.createElement('td');
        penaltyPlayerCell.className = 'txtl';
        penaltyPlayerCell.innerHTML = `
            <select tabindex="-1" id="sht" name="sht" style="width:271px; height:20px; font-size:11px; border:1px solid rgb(170,170,170); padding:2px 4px; box-sizing:border-box; background:white;">
                <option value="-1" class="grD">некому исполнять штрафные</option>
            </select>
        `;

        penaltyRow.appendChild(penaltyRoleCell);
        penaltyRow.appendChild(penaltyPlayerCell);
        rolesTbody.appendChild(penaltyRow);

        // Строка угловых
        const cornerRow = document.createElement('tr');

        const cornerRoleCell = document.createElement('td');
        cornerRoleCell.className = 'qt';
        cornerRoleCell.style.cssText = `
            height: 20px;
            background-color: rgb(255, 255, 187);
            text-align: center;
            font-family: Courier New, monospace;
            font-size: 11px;
        `;
        cornerRoleCell.title = 'Исполнитель угловых ударов';
        cornerRoleCell.textContent = 'Уг';

        const cornerPlayerCell = document.createElement('td');
        cornerPlayerCell.className = 'txtl';
        cornerPlayerCell.innerHTML = `
            <select tabindex="-1" id="uglov" name="uglov" style="width:271px; height:20px; font-size:11px; border:1px solid rgb(170,170,170); padding:2px 4px; box-sizing:border-box; background:white;">
                <option value="-1" class="grD">некому исполнять угловые</option>
            </select>
        `;

        cornerRow.appendChild(cornerRoleCell);
        cornerRow.appendChild(cornerPlayerCell);
        rolesTbody.appendChild(cornerRow);

        // Строка пенальти
        const penRow = document.createElement('tr');

        const penRoleCell = document.createElement('td');
        penRoleCell.className = 'qt';
        penRoleCell.style.cssText = `
            height: 20px;
            background-color: rgb(255, 255, 187);
            text-align: center;
            font-family: Courier New, monospace;
            font-size: 11px;
        `;
        penRoleCell.title = 'Пенальтист';
        penRoleCell.textContent = 'Пен';

        const penPlayerCell = document.createElement('td');
        penPlayerCell.className = 'txtl';
        penPlayerCell.innerHTML = `
            <select tabindex="-1" id="penalty" name="penalty" style="width:271px; height:20px; font-size:11px; border:1px solid rgb(170,170,170); padding:2px 4px; box-sizing:border-box; background:white;">
                <option value="-1" class="grD">некому исполнять пенальти</option>
            </select>
        `;

        penRow.appendChild(penRoleCell);
        penRow.appendChild(penPlayerCell);
        rolesTbody.appendChild(penRow);

        rolesTable.appendChild(rolesTbody);
        rolesSection.appendChild(rolesHeaderTable);
        rolesSection.appendChild(rolesTable);

        // Собираем все секции
        content.appendChild(tacticsSection);
        content.appendChild(lineupSection);
        content.appendChild(rolesSection);

        return content;
    }

    // ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ИНТЕРАКТИВНЫХ КАЛЬКУЛЯТОРОВ =====
    
    /**
     * Инициализирует систему подсказок для существующих элементов футболок на странице
     * Используется для HTML страниц, где футболки уже созданы статически
     */
    window.initializeFieldHints = function() {
        console.log('[FieldHints] Начинаем инициализацию системы подсказок...');
        
        // Находим все существующие элементы футболок
        const shirtsContainers = document.querySelectorAll('.shirts-container');
        console.log(`[FieldHints] Найдено контейнеров футболок: ${shirtsContainers.length}`);
        
        shirtsContainers.forEach((container, containerIndex) => {
            const shirtElements = container.children;
            console.log(`[FieldHints] Контейнер ${containerIndex}: найдено футболок: ${shirtElements.length}`);
            
            Array.from(shirtElements).forEach((shirtElement, shirtIndex) => {
                // Проверяем, что это элемент футболки
                if (shirtElement.style.backgroundImage && shirtElement.style.backgroundImage.includes('shirt')) {
                    // Генерируем уникальный ID если его нет
                    if (!shirtElement.id) {
                        const position = shirtElement.textContent || `pos${shirtIndex}`;
                        const team = containerIndex === 0 ? 'home' : 'away';
                        shirtElement.id = `shirt-${team}-${position}-${Math.random().toString(36).substr(2, 9)}`;
                    }
                    
                    // Добавляем стили для интерактивности
                    shirtElement.style.cursor = 'pointer';
                    
                    // Добавляем обработчик клика для показа подсказки
                    shirtElement.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const position = shirtElement.textContent || 'Unknown';
                        const team = containerIndex === 0 ? 'home' : 'away';
                        
                        console.log(`[FieldHints] Клик по футболке: ${shirtElement.id}, позиция: ${position}, команда: ${team}`);
                        
                        // Показываем подсказку только для позиции (без данных игрока)
                        showFieldPlayerHint(position, team, null, shirtElement);
                    });
                    
                    console.log(`[FieldHints] Добавлены обработчики для футболки: ${shirtElement.id}`);
                }
            });
        });
        
        console.log('[FieldHints] Инициализация системы подсказок завершена');
    };
    
    // ===== КОНЕЦ НОВЫХ ФУНКЦИЙ =====
    
    // ===== ОТЛАДОЧНЫЕ ФУНКЦИИ ДЛЯ CHEMISTRY СИСТЕМЫ =====
    
    /**
     * Отладочная функция для тестирования Chemistry системы
     */
    window.testChemistry = function() {
        console.log('=== ТЕСТ CHEMISTRY СИСТЕМЫ ===');
        
        // Проверяем доступность данных
        const slotEntries = window.currentSlotEntries || [];
        if (slotEntries.length === 0) {
            console.log('❌ slotEntries не доступны. Сначала рассчитайте силу команды.');
            return;
        }
        
        console.log('✅ Найдено игроков в составе:', slotEntries.length);
        
        // Проверяем данные игроков
        slotEntries.forEach((entry, idx) => {
            const player = entry.player;
            console.log(`Игрок ${idx + 1}: ${player.name}`, {
                position: entry.matchPos,
                nat_id: player.nat_id,
                nat: player.nat,
                hidden_style: player.hidden_style,
                styleKnowledge: player.styleKnowledge
            });
        });
        
        // Тестируем функции Chemistry
        console.log('\n=== ТЕСТ ФУНКЦИЙ ===');
        
        // Тест коллизий стилей
        console.log('Коллизии стилей:');
        console.log('sp vs brit:', areStylesInCollision('sp', 'brit')); // должно быть true
        console.log('norm vs sp:', areStylesInCollision('norm', 'sp')); // должно быть false
        console.log('bb vs sp:', areStylesInCollision('bb', 'sp')); // должно быть true
        
        // Тест связей позиций
        const positions = slotEntries.map(e => e.matchPos);
        console.log('\nСвязи позиций:');
        positions.forEach((pos, idx) => {
            const connections = getPositionConnections(pos, positions);
            console.log(`${pos}: [${connections.join(', ')}]`);
        });
        
        // Тест расчета Chemistry для каждого игрока
        console.log('\n=== РАСЧЕТ CHEMISTRY ===');
        const players = slotEntries.map(e => e.player);
        
        slotEntries.forEach((entry, idx) => {
            const modifier = calculatePlayerChemistryModifier(entry.player, players, positions);
            console.log(`${entry.player.name} (${entry.matchPos}): ${(modifier * 100).toFixed(1)}%`);
        });
        
        // Тест Style Knowledge модификатора
        console.log('\n=== ТЕСТ STYLE KNOWLEDGE ===');
        if (players.length > 0) {
            const testPlayer = players[0];
            const originalKnowledge = testPlayer.styleKnowledge;
            
            console.log(`Тестируем игрока: ${testPlayer.name}`);
            
            // Тестируем разные уровни изученности
            const knowledgeLevels = [0.2, 0.4, 0.6, 0.8, 1.0];
            knowledgeLevels.forEach(level => {
                testPlayer.styleKnowledge = level;
                const modifier = calculatePlayerChemistryModifier(testPlayer, players, positions);
                console.log(`Style Knowledge ${(level * 100)}%: Chemistry = ${(modifier * 100).toFixed(1)}%`);
            });
            
            // Восстанавливаем оригинальное значение
            testPlayer.styleKnowledge = originalKnowledge;
        }
        
        console.log('=== КОНЕЦ ТЕСТА ===');
    };
    
    /**
     * Показывает информацию о Chemistry системе
     */
    window.chemistryInfo = function() {
        console.log(`
🧪 CHEMISTRY SYSTEM v0.938

НОВОЕ: Интеграция с селектором стилей!
- По умолчанию показывает hidden_style игрока
- Пользователь может изменить стиль
- Chemistry учитывает выбранный стиль

Команды для тестирования:
- testChemistry() - полный тест системы
- chemistryInfo() - эта справка

Как использовать:
1. Откройте калькулятор силы
2. Настройте составы команд
3. Измените стили игроков (по желанию)
4. Нажмите "Рассчитать силу"
5. Выполните testChemistry() в консоли

Система учитывает:
- Национальности игроков (nat_id, nat)
- Стили игроков (customStyleValue ИЛИ hidden_style)
- Изученность стиля (styleKnowledge) - модификатор от 0.0 до 1.0
- Связи между позициями на поле
- Коллизии стилей (из collision_bonuses)

Формула: BaseChemistry * StyleKnowledge = FinalChemistry
Диапазон модификаторов: от -5% до +12.5%

Логирование: Все сообщения помечены тегом [CHEMISTRY]
        `);
    };
    
    // Показываем справку при загрузке
    console.log('🧪 Chemistry System v0.943 загружена! ОБНОВЛЕН граф связей позиций (GK + LD). Используйте testCacheFunctions() для проверки.');

// Проверяем загрузку функций кэша
setTimeout(() => {
    if (typeof window.getStyleCacheStats === 'function') {
        console.log('✅ Функции управления кэшем загружены успешно');
        console.log('📋 Доступные команды: testCacheFunctions(), getStyleCacheStats(), smartCleanupStyleCache()');
    } else {
        console.error('❌ Ошибка загрузки функций управления кэшем');
    }
}, 100);
    
    // ===== КОНЕЦ ОТЛАДОЧНЫХ ФУНКЦИЙ =====
    
    init();
})();