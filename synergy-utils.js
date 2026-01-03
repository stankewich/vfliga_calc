// ==UserScript==
// @name         VF Liga Synergy Utils
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Утилиты для работы с сыгранностью и парсинга данных игроков
// @author       Arne
// ==/UserScript==

/**
 * УТИЛИТЫ ДЛЯ РАБОТЫ С СЫГРАННОСТЬЮ И ПАРСИНГА ДАННЫХ
 * 
 * Этот файл содержит функции, которые были вынесены из основного калькулятора
 * для возможного использования в будущем:
 * 
 * 1. Парсинг данных игроков из HTML
 * 2. Загрузка составов из sending form
 * 3. Определение команд пользователя
 * 4. Применение загруженных составов
 * 5. Создание кнопок загрузки
 */

// Конфигурация сайта
const SITE_CONFIG = (() => {
    const hostname = window.location.hostname;
    let baseUrl = 'https://www.virtualsoccer.ru'; // default
    
    if (hostname === 'www.virtualsoccer.ru') {
        baseUrl = 'https://www.virtualsoccer.ru';
    } else if (hostname === 'virtualsoccer.ru') {
        baseUrl = 'https://virtualsoccer.ru';
    }
    
    return {
        BASE_URL: baseUrl
    };
})();

// =============================================================================
// ФУНКЦИИ ПАРСИНГА ДАННЫХ ИГРОКОВ
// =============================================================================

/**
 * Загрузка данных игроков команды
 */
async function loadTeamPlayersData(teamId, tournamentType = 'championship', orderDay = null) {
    const typeMapping = {
        'championship': 'typeC',
        'cup': 'typeB', 
        'preseason_cup': 'typeB',
        'friendly': 'typeA'
    };
    
    try {
        const sort = typeMapping[tournamentType] || 'typeC';
        const url = `${SITE_CONFIG.BASE_URL}/roster.php?num=${teamId}&sort=${sort}`;
        
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function(response) {
                    if (response.status === 200) {
                        const playersData = extractPlayersDataFromHTML(response.responseText);
                        resolve(playersData);
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror: reject,
                ontimeout: reject
            });
        });
    } catch (error) {
        throw new Error(`Ошибка загрузки данных игроков: ${error.message}`);
    }
}

/**
 * Извлечение данных игроков из HTML
 */
function extractPlayersDataFromHTML(html) {
    const playersData = {};
    
    try {
        const plrdatMatch = html.match(/var plrdat\s*=\s*(\[[\s\S]*?\]);/);
        if (!plrdatMatch) {
            return playersData;
        }
        
        const plrdatArray = JSON.parse(plrdatMatch[1]);
        
        plrdatArray.forEach(playerArray => {
            if (playerArray && playerArray.length >= 82) {
                const playerId = String(playerArray[0]);
                const playerName = playerArray[1];
                const age = parseInt(playerArray[2]) || 0;
                const strength = parseInt(playerArray[3]) || 0;
                const fatigue = parseInt(playerArray[4]) || 0;
                const form = parseInt(playerArray[5]) || 100;
                
                playersData[playerId] = {
                    id: playerId,
                    name: playerName,
                    age: age,
                    strength: strength,
                    fatigue: fatigue,
                    form: form,
                    rawData: playerArray
                };
            }
        });
        
        return playersData;
    } catch (error) {
        return playersData;
    }
}

// =============================================================================
// ФУНКЦИИ ОПРЕДЕЛЕНИЯ КОМАНД
// =============================================================================

/**
 * Определение команды пользователя по составу
 */
async function detectUserTeamFromLineup(orderDay, homeTeamId, awayTeamId) {
    if (!awayTeamId) {
        return { teamId: homeTeamId, isHome: true };
    }
    
    try {
        const url = `${SITE_CONFIG.BASE_URL}/mng_order.php?order_day=${orderDay}`;
        
        const response = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: resolve,
                onerror: reject,
                ontimeout: reject
            });
        });

        if (response.status !== 200) {
            return { teamId: homeTeamId, isHome: true };
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.responseText, 'text/html');
        
        const playerSelects = doc.querySelectorAll('select[name^="plr["]');
        
        if (playerSelects.length === 0) {
            return { teamId: homeTeamId, isHome: true };
        }
        
        const firstPlayerSelect = playerSelects[0];
        let selectedOption = firstPlayerSelect.querySelector('option[selected]');
        if (!selectedOption && firstPlayerSelect.selectedIndex > 0) {
            selectedOption = firstPlayerSelect.options[firstPlayerSelect.selectedIndex];
        }
        if (!selectedOption && firstPlayerSelect.value && firstPlayerSelect.value !== '-1') {
            selectedOption = firstPlayerSelect.querySelector(`option[value="${firstPlayerSelect.value}"]`);
        }
        
        if (!selectedOption || !selectedOption.value || selectedOption.value === '-1') {
            return { teamId: homeTeamId, isHome: true };
        }
        
        const selectedPlayerId = selectedOption.value;
        
        const homePlayersData = await loadTeamPlayersData(homeTeamId, 'championship', orderDay);
        const awayPlayersData = await loadTeamPlayersData(awayTeamId, 'championship', orderDay);
        
        const isInHomeTeam = homePlayersData[selectedPlayerId];
        const isInAwayTeam = awayPlayersData[selectedPlayerId];
        
        if (isInHomeTeam && !isInAwayTeam) {
            return { teamId: homeTeamId, isHome: true };
        } else if (isInAwayTeam && !isInHomeTeam) {
            return { teamId: awayTeamId, isHome: false };
        } else {
            return { teamId: homeTeamId, isHome: true };
        }
        
    } catch (error) {
        return { teamId: homeTeamId, isHome: true };
    }
}

// =============================================================================
// ФУНКЦИИ ЗАГРУЗКИ СОСТАВОВ ИЗ SENDING FORM
// =============================================================================

/**
 * Загрузка состава из sending form
 */
async function loadLineupFromOrder(orderDay) {
    try {
        const url = `${SITE_CONFIG.BASE_URL}/mng_order.php?order_day=${orderDay}`;
        
        const response = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: resolve,
                onerror: reject,
                ontimeout: reject
            });
        });

        if (response.status !== 200) {
            return null;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.responseText, 'text/html');
        
        // Извлечение игроков
        const lineup = {};
        const playerSelects = doc.querySelectorAll('select[name^="plr["]');
        
        playerSelects.forEach((select, index) => {
            let selectedOption = select.querySelector('option[selected]');
            if (!selectedOption && select.selectedIndex > 0) {
                selectedOption = select.options[select.selectedIndex];
            }
            
            if (selectedOption && selectedOption.value && selectedOption.value !== '-1') {
                lineup[index] = {
                    id: selectedOption.value,
                    name: selectedOption.textContent.trim()
                };
            }
        });
        
        // Извлечение капитана
        let captain = null;
        const captainSelect = doc.querySelector('select[name="captain"]');
        if (captainSelect) {
            const selectedCaptain = captainSelect.querySelector('option[selected]') || 
                                  captainSelect.options[captainSelect.selectedIndex];
            if (selectedCaptain && selectedCaptain.value && selectedCaptain.value !== '-1') {
                captain = selectedCaptain.value;
            }
        }
        
        // Извлечение стиля игры
        let gameStyle = 'norm';
        const styleSelect = doc.querySelector('select[name="playstyle"]');
        if (styleSelect) {
            const selectedOption = styleSelect.querySelector('option[selected]') || 
                                 styleSelect.options[styleSelect.selectedIndex];
            if (selectedOption && selectedOption.value) {
                const styleMapping = {
                    'нормальный': 'norm',
                    'британский': 'brit',
                    'бразильский': 'brazil',
                    'тики-така': 'tiki',
                    'бей-беги': 'bb',
                    'катеначчо': 'kat',
                    'спартаковский': 'sp'
                };
                gameStyle = styleMapping[selectedOption.value] || selectedOption.value;
            }
        }
        
        // Извлечение грубости
        let roughness = 'clean';
        const roughnessSelect = doc.querySelector('select[name="gamestyle"]');
        if (roughnessSelect) {
            const selectedRoughOption = roughnessSelect.querySelector('option[selected]') || 
                                      roughnessSelect.options[roughnessSelect.selectedIndex];
            if (selectedRoughOption) {
                roughness = selectedRoughOption.value === '1' ? 'rough' : 'clean';
            }
        }

        // Извлечение вида защиты
        let defenseType = 'zonal';
        const defenseSelect = doc.querySelector('select[name="defence"]');
        if (defenseSelect) {
            const selectedDefenseOption = defenseSelect.querySelector('option[selected]') || 
                                        defenseSelect.options[defenseSelect.selectedIndex];
            if (selectedDefenseOption) {
                defenseType = selectedDefenseOption.value === '2' ? 'man' : 'zonal';
            }
        }
        
        // Извлечение формации
        let formation = null;
        const formationMatch = response.responseText.match(/var v_formation\s*=\s*"([^"]+)"/);
        if (formationMatch) {
            formation = formationMatch[1];
        }
        
        return {
            lineup,
            captain,
            gameStyle,
            roughness,
            defenseType,
            formation,
            orderDay
        };
        
    } catch (error) {
        return null;
    }
}

/**
 * Проверка наличия состава в sending form
 */
async function checkLineupExists(orderDay) {
    if (!orderDay) {
        return false;
    }
    
    try {
        const url = `${SITE_CONFIG.BASE_URL}/mng_order.php?order_day=${orderDay}`;
        
        const response = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: resolve,
                onerror: reject,
                ontimeout: reject
            });
        });

        if (response.status !== 200) {
            return false;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.responseText, 'text/html');
        
        const playerSelects = doc.querySelectorAll('select[name^="plr["]');
        
        if (playerSelects.length === 0) {
            return false;
        }
        
        let validPlayers = 0;
        
        playerSelects.forEach(select => {
            let selectedOption = select.querySelector('option[selected]');
            if (!selectedOption && select.selectedIndex > 0) {
                selectedOption = select.options[select.selectedIndex];
            }
            if (!selectedOption && select.value && select.value !== '-1') {
                selectedOption = select.querySelector(`option[value="${select.value}"]`);
            }
            
            if (selectedOption && selectedOption.value && selectedOption.value !== '-1') {
                validPlayers++;
            }
        });
        
        return validPlayers > 0;
        
    } catch (error) {
        return false;
    }
}

// =============================================================================
// ЭКСПОРТ ФУНКЦИЙ
// =============================================================================

// Если используется как модуль
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadTeamPlayersData,
        extractPlayersDataFromHTML,
        detectUserTeamFromLineup,
        loadLineupFromOrder,
        checkLineupExists
    };
}

// Если используется в браузере
if (typeof window !== 'undefined') {
    window.SynergyUtils = {
        loadTeamPlayersData,
        extractPlayersDataFromHTML,
        detectUserTeamFromLineup,
        loadLineupFromOrder,
        checkLineupExists
    };
}