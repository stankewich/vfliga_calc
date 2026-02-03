# Анализ селектора стилей в таблице составов

**Дата:** 3 февраля 2026  
**Версия:** 0.937  
**Статус:** 📋 Анализ архитектуры

## Обзор системы

Селектор стилей в элементе `orders-table-home` (и `orders-table-away`) является частью системы создания составов команд в калькуляторе силы.

## Архитектура

### 1. Создание таблиц составов

```javascript
// В функции init() калькулятора:
const homeLineupBlock = createTeamLineupBlock(homePlayers, "4-4-2", "home");
const awayLineupBlock = createTeamLineupBlock(awayPlayers, "4-4-2", "away");
```

**Результат:**
- Таблица с ID `orders-table-home` для домашней команды
- Таблица с ID `orders-table-away` для гостевой команды

### 2. Структура функции createTeamLineupBlock

```javascript
function createTeamLineupBlock(players, initialFormationName = "4-4-2", teamId = null) {
    const table = document.createElement('table');
    table.className = 'orders-table';
    
    if (teamId) {
        table.id = `orders-table-${teamId}`;  // ← orders-table-home / orders-table-away
    }
    
    // Создание 11 строк для игроков
    const rowsCount = 11;
    // ...
}
```

### 3. Создание строки игрока

Каждая строка содержит несколько элементов:

```javascript
// Для каждой позиции (GK, LD, CD, etc.):
for (let row = 0; row < rowsCount; row++) {
    const tr = document.createElement('tr');
    
    // 1. Номер позиции
    const orderCell = document.createElement('td');
    orderCell.className = 'order';
    
    // 2. Селектор игрока (dropdown)
    const playerCell = document.createElement('td');
    
    // 3. Мини-селектор позиции
    const miniPosCell = document.createElement('td');
    
    // 4. СЕЛЕКТОР СТИЛЯ ← Здесь создается!
    const styleCell = document.createElement('td');
    const styleSelect = createCustomStyleSelect((styleValue) => {
        // Обработчик изменения стиля
    });
    
    // 5. Селектор физической формы
    const formCell = document.createElement('td');
}
```

## Селектор стиля (createCustomStyleSelect)

### Создание селектора

```javascript
function createCustomStyleSelect(onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-style-select';
    
    // Создание элемента "выбранное значение"
    const selectedDiv = document.createElement('div');
    selectedDiv.className = 'selected';
    
    // Иконка стиля
    const selectedIcon = document.createElement('img');
    selectedIcon.className = 'icon';
    selectedIcon.style.display = 'none';
    
    // Список опций (dropdown)
    const optionsList = document.createElement('ul');
    optionsList.className = 'options';
    
    // Заполнение опций стилями
    PLAYER_STYLES.forEach(style => {
        const li = document.createElement('li');
        li.dataset.value = style.value;
        
        if (style.icon) {
            const icon = document.createElement('img');
            icon.src = style.icon;
            icon.className = 'icon';
            li.appendChild(icon);
        }
        
        optionsList.appendChild(li);
    });
    
    return wrapper;
}
```

### Доступные стили

```javascript
const PLAYER_STYLES = [
    { value: 'norm', label: 'Норм', icon: null },
    { value: 'sp', label: 'СП', icon: 'style-icons/sp.png' },
    { value: 'bb', label: 'ББ', icon: 'style-icons/bb.png' },
    { value: 'brazil', label: 'Бразил', icon: 'style-icons/brazil.png' },
    { value: 'tiki', label: 'Тики', icon: 'style-icons/tiki.png' },
    { value: 'kat', label: 'Кат', icon: 'style-icons/kat.png' },
    { value: 'brit', label: 'Брит', icon: 'style-icons/brit.png' }
];
```

## Логика работы селектора стиля

### 1. Обработчик изменения стиля

```javascript
const styleSelect = createCustomStyleSelect((styleValue) => {
    // 1. Сохраняем стиль в API слота
    slotApi.customStyleValue = styleValue;
    
    // 2. Получаем ID выбранного игрока
    const playerId = slotApi.getValue && slotApi.getValue();
    
    // 3. Сохраняем стиль игрока в кэш
    if (playerId) {
        setPlayerStyleToCache(playerId, styleValue);
    }
    
    // 4. Логируем коэффициент погоды для игрока
    const player = players.find(p => String(p.id) === String(playerId));
    if (player) {
        logPlayerWeatherCoef({
            player,
            customStyleValue: slotApi.customStyleValue || 'norm',
            strength: Number(player.realStr) || 0
        });
    }
});
```

### 2. Загрузка стиля из кэша

```javascript
// При выборе игрока:
slotApi.setValue = (v, label) => {
    orders.setValue(v, label);
    
    if (v) {
        const player = players.find(p => String(p.id) === String(v));
        if (player) {
            // Загружаем стиль игрока из кэша
            const cachedStyle = getPlayerStyleFromCache(v);
            if (cachedStyle && cachedStyle !== 'norm') {
                slotApi.customStyleValue = cachedStyle;
                if (styleSelect && styleSelect.setValue) {
                    styleSelect.setValue(cachedStyle);
                }
            }
        }
    }
};
```

### 3. API слота (slotApi)

Каждая строка таблицы имеет API объект:

```javascript
const slotApi = {
    rowIndex: row,                    // Индекс строки (0-10)
    posValue: initialPos,             // Позиция (GK, LD, CD, etc.)
    selectedPlayer: null,             // Данные выбранного игрока
    customStyleValue: 'norm',         // Выбранный стиль
    physicalFormValue: null,          // Выбранная физическая форма
    
    // Методы
    getValue: () => orders.getValue(),
    setValue: (v, label) => { /* ... */ },
    setOptions: (opts) => orders.setOptions(opts),
    setPlaceholder: (ph) => orders.setPlaceholder(ph)
};
```

## Интеграция с Chemistry системой

### Проблема: Стиль vs hidden_style

**Селектор стиля** устанавливает `customStyleValue`, но **Chemistry система** использует `hidden_style` из данных игрока.

```javascript
// Селектор стиля:
slotApi.customStyleValue = 'sp';  // Выбранный пользователем стиль

// Chemistry система:
player.hidden_style = 'norm';     // Скрытый стиль из plrdat
```

### Текущее поведение

1. **Пользователь выбирает стиль** в селекторе → `customStyleValue = 'sp'`
2. **Chemistry система** использует `hidden_style = 'norm'` из данных игрока
3. **Результат:** Стиль из селектора НЕ влияет на Chemistry

### Возможные решения

#### Вариант 1: Использовать customStyleValue в Chemistry

```javascript
function getChemistryBonus(player, inLineupPlayers, teamStyleId) {
    // Получаем позиции из slotEntries
    const slotEntries = window.currentSlotEntries || [];
    
    slotEntries.forEach(entry => {
        // Используем customStyleValue вместо hidden_style
        const playerStyle = entry.customStyleValue || player.hidden_style || 'norm';
        
        // Создаем модифицированный объект игрока
        const modifiedPlayer = {
            ...player,
            hidden_style: playerStyle  // Перезаписываем стиль
        };
        
        // Рассчитываем Chemistry с новым стилем
        const modifier = calculatePlayerChemistryModifier(modifiedPlayer, inLineupPlayers, positions);
    });
}
```

#### Вариант 2: Обновить slotEntries с customStyleValue

```javascript
// При сохранении slotEntries добавить customStyleValue:
window.currentSlotEntries = slotEntries.map(entry => ({
    ...entry,
    customStyleValue: entry.customStyleValue || 'norm'
}));
```

#### Вариант 3: Игнорировать селектор стиля в Chemistry

Оставить Chemistry работать только с `hidden_style` из данных игрока, а селектор стиля использовать только для других расчетов (погода, коллизии).

## Кэширование стилей

### Функции кэширования

```javascript
// Сохранение стиля игрока
function setPlayerStyleToCache(playerId, styleValue) {
    if (!window.playerStyleCache) {
        window.playerStyleCache = {};
    }
    window.playerStyleCache[playerId] = styleValue;
}

// Загрузка стиля игрока
function getPlayerStyleFromCache(playerId) {
    if (!window.playerStyleCache) {
        return null;
    }
    return window.playerStyleCache[playerId] || null;
}
```

### Логика кэширования

1. **При выборе стиля** → сохраняется в кэш
2. **При выборе игрока** → загружается из кэша
3. **При смене игрока** → кэш сохраняется для предыдущего игрока

## CSS стили

```css
#vsol-calculator-ui .custom-style-select {
    position: relative;
    width: 100%;
    user-select: none;
    display: block;
}

#vsol-calculator-ui .custom-style-select .selected {
    border: 1px solid #aaa;
    padding: 2px 4px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: 20px;
    cursor: pointer;
}

#vsol-calculator-ui .custom-style-select .options {
    display: none;
    position: absolute;
    left: 0;
    width: 100%;
    background: #fff;
    border: 1px solid #aaa;
    z-index: 9999;
}

#vsol-calculator-ui .custom-style-select.open .options {
    display: block;
}
```

## Заключение

### Как работает селектор стиля:

1. **Создается** в каждой строке таблицы составов (`orders-table-home`/`orders-table-away`)
2. **Позволяет выбрать** стиль игрока из 7 вариантов (norm, sp, bb, brazil, tiki, kat, brit)
3. **Сохраняет** выбранный стиль в `slotApi.customStyleValue`
4. **Кэширует** стиль для каждого игрока
5. **Загружает** стиль из кэша при повторном выборе игрока

### Связь с Chemistry системой:

- **НЕ связан напрямую** - Chemistry использует `hidden_style` из данных игрока
- **Возможна интеграция** - можно модифицировать Chemistry для учета `customStyleValue`
- **Требует решения** - определить приоритет между `hidden_style` и `customStyleValue`

### Элементы DOM:

- **Таблица:** `#orders-table-home` / `#orders-table-away`
- **Селектор:** `.custom-style-select` в каждой строке
- **API:** Доступен через `slotApi.customStyleValue` для каждого слота