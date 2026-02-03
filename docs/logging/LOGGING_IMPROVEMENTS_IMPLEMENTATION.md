# План внедрения улучшений логирования

## Приоритетность внедрения

### Этап 1: Критичные улучшения (Высокий приоритет)

#### 1.1 Улучшение функции `applyLoadedLineup`
**Проблема:** Отсутствует детальное логирование процесса применения состава
**Решение:** Добавить структурированное логирование с группировкой

**Файл:** `calc.user.js` (строки ~4237-4275)

```javascript
// ЗАМЕНИТЬ существующую функцию на улучшенную версию
function applyLoadedLineup(loadedLineup, homePlayers) {
    console.group('🔄 [LineupApply] Применение загруженного состава');
    console.log('📊 Входные данные:', {
        'Игроков в составе': Object.keys(loadedLineup.lineup || {}).length,
        'Капитан': loadedLineup.captain || 'не указан',
        'Стиль игры': loadedLineup.gameStyle || 'не указан',
        'Доступно игроков': homePlayers.length
    });

    if (!loadedLineup || !window.homeLineupBlock) {
        console.warn('❌ Недостаточно данных для применения состава');
        console.groupEnd();
        return;
    }

    try {
        let appliedPlayers = 0;
        let appliedPositions = 0;
        const failedPlayers = [];
        
        // Применяем игроков по позициям
        Object.keys(loadedLineup.lineup).forEach(posIndex => {
            const lineupData = loadedLineup.lineup[posIndex];
            const slot = window.homeLineupBlock.lineup[parseInt(posIndex)];
            
            if (slot && lineupData.playerId) {
                const player = homePlayers.find(p => String(p.id) === String(lineupData.playerId));
                if (player) {
                    slot.setValue(lineupData.playerId, player.name);
                    appliedPlayers++;
                    console.log(`  ✅ Позиция ${posIndex}: ${player.name} (ID: ${lineupData.playerId})`);
                    
                    if (lineupData.position) {
                        slot.posValue = lineupData.position;
                        if (slot.positionSelect) {
                            slot.positionSelect.value = lineupData.position;
                            appliedPositions++;
                            console.log(`    📍 Установлена позиция: ${lineupData.position}`);
                        }
                    }
                } else {
                    failedPlayers.push({ posIndex, playerId: lineupData.playerId });
                    console.warn(`  ❌ Игрок не найден: позиция ${posIndex}, ID ${lineupData.playerId}`);
                }
            }
        });

        // Применяем капитана
        let captainApplied = false;
        if (loadedLineup.captain && window.homeLineupBlock.captainSelect) {
            window.homeLineupBlock.captainSelect.value = loadedLineup.captain;
            captainApplied = true;
            console.log(`👑 Установлен капитан: ID ${loadedLineup.captain}`);
        }

        // Применяем стиль игры
        let styleApplied = false;
        if (loadedLineup.gameStyle && window.homeStyle) {
            window.homeStyle.value = loadedLineup.gameStyle;
            styleApplied = true;
            console.log(`⚽ Установлен стиль игры: ${loadedLineup.gameStyle}`);
        }

        console.log('📊 Результат применения:', {
            'Применено игроков': appliedPlayers,
            'Неудачных попыток': failedPlayers.length,
            'Установлено позиций': appliedPositions,
            'Капитан': captainApplied ? 'установлен' : 'не установлен',
            'Стиль игры': styleApplied ? 'установлен' : 'не установлен'
        });

        if (failedPlayers.length > 0) {
            console.warn('⚠️ Не удалось применить игроков:', failedPlayers);
        }

        // Обновляем интерфейс
        if (typeof window.__vs_onLineupChanged === 'function') {
            window.__vs_onLineupChanged();
            console.log('🔄 Интерфейс обновлен');
        }

        const successMessage = `Состав применен: ${appliedPlayers} игроков${failedPlayers.length > 0 ? `, ${failedPlayers.length} ошибок` : ''}`;
        console.log(`✅ ${successMessage}`);
        console.groupEnd();
        alert(successMessage);
        
    } catch (error) {
        console.error('💥 [LineupApply] Критическая ошибка при применении состава:', {
            message: error.message,
            stack: error.stack,
            loadedLineup: loadedLineup
        });
        console.groupEnd();
        alert('Ошибка при применении состава: ' + error.message);
    }
}
```

#### 1.2 Добавление конфигурации логирования
**Файл:** `calc.user.js` (добавить в начало после констант)

```javascript
// ===== LOGGING CONFIGURATION =====
const LOG_CONFIG = {
    ENABLED: true,
    LEVEL: {
        ERROR: 0,
        WARN: 1, 
        INFO: 2,
        DEBUG: 3
    },
    CURRENT_LEVEL: 2, // INFO по умолчанию (можно изменить для отладки)
    MODULES: {
        LINEUP_CHECK: true,
        LINEUP_LOAD: true,
        LINEUP_APPLY: true,
        SHIRTS: true,
        INIT: true,
        PERFORMANCE: false // отключено по умолчанию
    }
};

// Централизованная функция логирования
function vsLog(level, module, message, data = null) {
    if (!LOG_CONFIG.ENABLED || !LOG_CONFIG.MODULES[module]) return;
    if (level > LOG_CONFIG.CURRENT_LEVEL) return;
    
    const timestamp = new Date().toISOString().substr(11, 12);
    const prefix = `[${timestamp}] [${module}]`;
    
    switch (level) {
        case LOG_CONFIG.LEVEL.ERROR:
            console.error(`💥 ${prefix}`, message, data || '');
            break;
        case LOG_CONFIG.LEVEL.WARN:
            console.warn(`⚠️ ${prefix}`, message, data || '');
            break;
        case LOG_CONFIG.LEVEL.INFO:
            console.log(`ℹ️ ${prefix}`, message, data || '');
            break;
        case LOG_CONFIG.LEVEL.DEBUG:
            console.log(`🔍 ${prefix}`, message, data || '');
            break;
    }
}

// Трекер производительности
class PerformanceTracker {
    constructor() {
        this.timers = new Map();
    }
    
    start(operation) {
        if (!LOG_CONFIG.MODULES.PERFORMANCE) return;
        this.timers.set(operation, performance.now());
        vsLog(LOG_CONFIG.LEVEL.DEBUG, 'PERFORMANCE', `Начало операции: ${operation}`);
    }
    
    end(operation) {
        if (!LOG_CONFIG.MODULES.PERFORMANCE) return;
        const startTime = this.timers.get(operation);
        if (startTime) {
            const duration = (performance.now() - startTime).toFixed(2);
            vsLog(LOG_CONFIG.LEVEL.INFO, 'PERFORMANCE', `Завершено: ${operation} (${duration}ms)`);
            this.timers.delete(operation);
            return duration;
        }
        return null;
    }
}

const perf = new PerformanceTracker();
```

### Этап 2: Улучшения системы рубашек (Средний приоритет)

#### 2.1 Улучшение функции `getTeamShirts`
**Файл:** `shirts-system.js` (строки ~182-212)

```javascript
// ЗАМЕНИТЬ существующую функцию
async function getTeamShirts(teamId) {
    console.group('👕 [Shirts] Получение футболок команды');
    console.log('🆔 ID команды:', teamId);
    
    const startTime = performance.now();
    
    // Проверяем кэш
    const cached = getCachedShirts(teamId);
    if (cached) {
        console.log('💾 Использованы кэшированные футболки');
        console.log('👕 Футболки из кэша:', cached);
        console.log(`⚡ Время выполнения: ${(performance.now() - startTime).toFixed(2)}ms`);
        console.groupEnd();
        return cached;
    }
    
    console.log('🔍 Кэш не найден, загружаем из последнего матча...');
    
    try {
        // Получаем последний матч
        console.log('📅 Поиск последнего матча...');
        const lastMatch = await getLastMatchForTeam(teamId);
        
        if (!lastMatch) {
            console.warn('❌ Матчи не найдены, используем футболки по умолчанию');
            const defaultShirts = { gk: DEFAULT_GK_SHIRT, field: DEFAULT_SHIRT };
            console.log('👕 Футболки по умолчанию:', defaultShirts);
            console.log(`⚡ Время выполнения: ${(performance.now() - startTime).toFixed(2)}ms`);
            console.groupEnd();
            return defaultShirts;
        }
        
        console.log('✅ Найден последний матч:', {
            day: lastMatch.day,
            matchId: lastMatch.matchId
        });
        
        // Получаем расстановку
        console.log('📋 Загрузка расстановки матча...');
        const shirts = await getMatchLineup(lastMatch.day, lastMatch.matchId, teamId);
        
        let modifications = 0;
        
        // Если не нашли футболки, используем дефолтные
        if (!shirts.gk) {
            shirts.gk = DEFAULT_GK_SHIRT;
            modifications++;
            console.log('⚠️ Футболка вратаря не найдена, используется по умолчанию');
        }
        if (!shirts.field) {
            shirts.field = DEFAULT_SHIRT;
            modifications++;
            console.log('⚠️ Полевая футболка не найдена, используется по умолчанию');
        }
        
        console.log('👕 Итоговые футболки:', shirts);
        console.log('📊 Статистика:', {
            'Источник': 'последний матч',
            'Модификаций': modifications,
            'День матча': lastMatch.day,
            'ID матча': lastMatch.matchId
        });
        
        // Кэшируем
        setCachedShirts(teamId, shirts);
        console.log('💾 Футболки сохранены в кэш (действительны 7 дней)');
        
        console.log(`⚡ Время выполнения: ${(performance.now() - startTime).toFixed(2)}ms`);
        console.groupEnd();
        return shirts;
        
    } catch (error) {
        console.error('💥 [Shirts] Ошибка при получении футболок:', {
            teamId: teamId,
            message: error.message,
            stack: error.stack,
            duration: `${(performance.now() - startTime).toFixed(2)}ms`
        });
        
        const defaultShirts = { gk: DEFAULT_GK_SHIRT, field: DEFAULT_SHIRT };
        console.log('👕 Используются футболки по умолчанию:', defaultShirts);
        console.groupEnd();
        return defaultShirts;
    }
}
```

#### 2.2 Улучшение функции инициализации рубашек
**Файл:** `shirts-system.js` (строки ~280-300)

```javascript
// ЗАМЕНИТЬ существующую функцию
async function initializeShirtsSystem(homeTeamId, awayTeamId, fieldCol, homeFormationSelect, awayFormationSelect) {
    console.group('👕 [Shirts] Инициализация системы футболок');
    console.log('🏠 ID команды хозяев:', homeTeamId);
    console.log('✈️ ID команды гостей:', awayTeamId);
    
    const startTime = performance.now();
    
    try {
        // Получаем футболки для обеих команд параллельно
        console.log('📥 Загрузка футболок для обеих команд...');
        const [homeShirts, awayShirts] = await Promise.all([
            getTeamShirts(homeTeamId),
            getTeamShirts(awayTeamId)
        ]);
        
        console.log('👕 Результат загрузки футболок:', {
            'Хозяева': {
                'Вратарь': homeShirts.gk,
                'Поле': homeShirts.field
            },
            'Гости': {
                'Вратарь': awayShirts.gk,
                'Поле': awayShirts.field
            }
        });
        
        // Отображаем футболки
        console.log('🎨 Отображение футболок на поле...');
        const updateShirts = () => {
            const homeFormation = homeFormationSelect.value || '4-4-2';
            const awayFormation = awayFormationSelect.value || '4-4-2';
            
            console.log('🔄 Обновление отображения футболок:', {
                'Формация хозяев': homeFormation,
                'Формация гостей': awayFormation
            });
            
            displayShirtsOnField(fieldCol, homeShirts, awayShirts, homeFormation, awayFormation);
        };
        
        updateShirts();
        
        // Обновляем при изменении формации
        homeFormationSelect.addEventListener('change', updateShirts);
        awayFormationSelect.addEventListener('change', updateShirts);
        console.log('🔗 Подключены обработчики изменения формации');
        
        console.log(`⚡ Инициализация завершена за ${(performance.now() - startTime).toFixed(2)}ms`);
        console.log('✅ Система футболок готова к работе');
        console.groupEnd();
        
    } catch (error) {
        console.error('💥 [Shirts] Ошибка инициализации системы футболок:', {
            homeTeamId,
            awayTeamId,
            message: error.message,
            stack: error.stack,
            duration: `${(performance.now() - startTime).toFixed(2)}ms`
        });
        console.groupEnd();
        throw error;
    }
}
```

### Этап 3: Дополнительные улучшения (Низкий приоритет)

#### 3.1 Добавление функции отладки логирования
**Файл:** `calc.user.js` (добавить в конец)

```javascript
// ===== DEBUG FUNCTIONS =====
// Функции для управления логированием из консоли браузера

window.vsDebug = {
    // Включить/выключить логирование
    setLogging: (enabled) => {
        LOG_CONFIG.ENABLED = enabled;
        console.log(`🔧 Логирование ${enabled ? 'включено' : 'отключено'}`);
    },
    
    // Установить уровень логирования
    setLevel: (level) => {
        const levels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
        if (level >= 0 && level <= 3) {
            LOG_CONFIG.CURRENT_LEVEL = level;
            console.log(`🔧 Уровень логирования установлен: ${levels[level]}`);
        }
    },
    
    // Включить/выключить модуль логирования
    setModule: (module, enabled) => {
        if (LOG_CONFIG.MODULES.hasOwnProperty(module)) {
            LOG_CONFIG.MODULES[module] = enabled;
            console.log(`🔧 Модуль ${module} ${enabled ? 'включен' : 'отключен'}`);
        }
    },
    
    // Показать текущую конфигурацию
    showConfig: () => {
        console.log('🔧 Текущая конфигурация логирования:', LOG_CONFIG);
    },
    
    // Включить режим отладки (все логи)
    enableDebug: () => {
        LOG_CONFIG.ENABLED = true;
        LOG_CONFIG.CURRENT_LEVEL = 3;
        Object.keys(LOG_CONFIG.MODULES).forEach(module => {
            LOG_CONFIG.MODULES[module] = true;
        });
        console.log('🔧 Режим отладки включен (все логи активны)');
    },
    
    // Производственный режим (только ошибки и предупреждения)
    enableProduction: () => {
        LOG_CONFIG.ENABLED = true;
        LOG_CONFIG.CURRENT_LEVEL = 1;
        LOG_CONFIG.MODULES.PERFORMANCE = false;
        console.log('🔧 Производственный режим (только ошибки и предупреждения)');
    }
};

// Справка по использованию
console.log(`
🔧 VS Calculator Debug Commands:
- vsDebug.setLogging(true/false) - включить/выключить логирование
- vsDebug.setLevel(0-3) - установить уровень (0=ERROR, 1=WARN, 2=INFO, 3=DEBUG)
- vsDebug.setModule('MODULE_NAME', true/false) - управление модулями
- vsDebug.showConfig() - показать текущие настройки
- vsDebug.enableDebug() - режим полной отладки
- vsDebug.enableProduction() - производственный режим
`);
```

## Порядок внедрения

### Шаг 1: Подготовка
1. Создать резервную копию файлов `calc.user.js` и `shirts-system.js`
2. Обновить версию скрипта в заголовке

### Шаг 2: Внедрение базовой конфигурации
1. Добавить `LOG_CONFIG` и функции логирования в начало `calc.user.js`
2. Протестировать базовую функциональность

### Шаг 3: Улучшение критичных функций
1. Заменить функцию `applyLoadedLineup`
2. Протестировать применение состава
3. Проверить корректность логирования

### Шаг 4: Улучшение системы рубашек
1. Обновить функции в `shirts-system.js`
2. Протестировать загрузку и отображение футболок
3. Проверить производительность

### Шаг 5: Добавление отладочных функций
1. Добавить `window.vsDebug` объект
2. Протестировать управление логированием из консоли

### Шаг 6: Финальное тестирование
1. Протестировать все сценарии использования
2. Проверить производительность
3. Убедиться в отсутствии регрессий

## Ожидаемые результаты

После внедрения улучшений:
- ✅ Детальное логирование всех операций с составом
- ✅ Структурированный вывод с группировкой сообщений
- ✅ Контроль уровня детализации логирования
- ✅ Метрики производительности для критичных операций
- ✅ Удобные инструменты отладки для разработчиков
- ✅ Сохранение обратной совместимости