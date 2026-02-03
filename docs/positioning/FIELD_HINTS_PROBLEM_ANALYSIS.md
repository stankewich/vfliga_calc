# Анализ проблемы с подсказками для футболок

## Дата анализа
25 января 2026, 11:26

## Проблема
Подсказки не работают на реальном сайте virtualsoccer.ru/previewmatch.php при клике на футболки.

## Анализ логов

### ✅ Что работает:

1. **displayShirtsOnField вызывается**
   ```
   [FieldHints] displayShirtsOnField вызвана
   ```

2. **homeLineup и awayLineup передаются**
   ```
   [FieldHints] homeLineup: Array(11) [ {…}, {…}, ... ]
   [FieldHints] awayLineup: Array(11) [ {…}, {…}, ... ]
   ```

3. **Футболки создаются**
   ```
   [FieldHints] Создание футболки: ID=shirt-home-GK-2b5upuflq, позиция=GK, команда=home, игрок=null, есть данные=false
   [FieldHints] Создание футболки: ID=shirt-home-LD-knczqaaxu, позиция=LD, команда=home, игрок=null, есть данные=false
   ... (всего 22 футболки для обеих команд)
   ```

### ❌ Что НЕ работает:

1. **Все игроки не выбраны**
   ```
   [FieldHints] Домашняя команда - позиция GK: игрок не выбран (playerId: )
   [FieldHints] Домашняя команда - позиция LD: игрок не выбран (playerId: )
   ... (все 22 позиции)
   ```
   
   **Причина:** `playerId` пустой для всех позиций, потому что `homeLineup[idx].getValue()` возвращает пустую строку.

2. **Нет логов о кликах по футболкам**
   - В логе отсутствуют сообщения `[FieldHints] Клик по футболке:`
   - Это значит, что либо пользователь не кликал на футболки, либо обработчик клика не сработал

## Причины проблемы

### Причина 1: Игроки не выбраны в селекторах

**Код проверки:**
```javascript
if (homeLineup && homeLineup[idx]) {
    const playerId = homeLineup[idx].getValue && homeLineup[idx].getValue();
    if (playerId && homeLineup[idx].selectedPlayer) {
        playerName = homeLineup[idx].selectedPlayer.name;
        playerData = {
            player: homeLineup[idx].selectedPlayer,
            matchPosition: position,
            physicalFormId: homeLineup[idx].physicalFormId || 'normal',
            playerIndex: idx
        };
    } else {
        console.log(`[FieldHints] Домашняя команда - позиция ${position}: игрок не выбран (playerId: ${playerId})`);
    }
}
```

**Что происходит:**
- `homeLineup[idx].getValue()` возвращает `""` (пустую строку)
- Условие `if (playerId && homeLineup[idx].selectedPlayer)` не выполняется
- `playerData` остается `null`
- Футболка создается без данных игрока

**Вывод:** Это **нормальное поведение**! Если игроки не выбраны в селекторах, то подсказки должны показывать только информацию о позиции (без данных игрока).

### Причина 2: Пользователь не кликал на футболки (или обработчик не сработал)

**Возможные причины:**
1. Пользователь просто не кликал на футболки
2. Элемент футболки перекрыт другим элементом (z-index проблема)
3. CSS свойство `pointer-events: none` блокирует клики
4. Обработчик события не добавлен к элементу

## Тестирование

### Тест 1: Проверка обработчика клика

**Инструкция для пользователя:**
1. Откройте страницу virtualsoccer.ru/previewmatch.php
2. Откройте консоль браузера (F12 → Console)
3. **Кликните на любую футболку на поле**
4. Проверьте, появляется ли в консоли сообщение:
   ```
   [FieldHints] Клик по футболке: shirt-home-GK-..., позиция: GK, команда: home
   ```

**Ожидаемый результат:**
- ✅ Если сообщение появляется → обработчик работает, подсказка должна показаться
- ❌ Если сообщения нет → обработчик не срабатывает, нужно проверить CSS и z-index

### Тест 2: Проверка с выбранными игроками

**Инструкция для пользователя:**
1. Выберите игроков в селекторах для нескольких позиций
2. Кликните на футболку выбранного игрока
3. Проверьте, показывается ли подсказка с данными игрока

**Ожидаемый результат:**
- ✅ Подсказка должна показать полную информацию: имя игрока, силу, бонусы, модификаторы

## Решение

### Решение 1: Проверка CSS свойств футболки

Добавим дополнительное логирование для проверки CSS свойств:

```javascript
function createShirtElement(position, shirtUrl, top, left, playerName = null, team = null, playerData = null) {
    const div = document.createElement('div');
    
    // ... существующий код ...
    
    // Добавляем логирование CSS свойств
    console.log(`[FieldHints] CSS свойства футболки ${uniqueId}:`, {
        cursor: div.style.cursor,
        pointerEvents: window.getComputedStyle(div).pointerEvents,
        zIndex: window.getComputedStyle(div).zIndex,
        display: window.getComputedStyle(div).display
    });
    
    return div;
}
```

### Решение 2: Принудительная установка CSS свойств

Убедимся, что футболки кликабельны:

```javascript
div.style.cssText = `
    position: absolute;
    width: 40px;
    height: 34px;
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
    line-height: 34px;
    text-shadow: 0 0 3px black, 0 0 3px black, 0 0 3px black;
    cursor: pointer;
    pointer-events: auto;  /* ← ДОБАВИТЬ */
    z-index: 10;           /* ← ПРОВЕРИТЬ */
    transition: transform 0.2s ease, box-shadow 0.2s ease;
`;
```

### Решение 3: Проверка контейнера футболок

Проверим, не блокирует ли контейнер клики:

```javascript
function displayShirtsOnField(fieldCol, homeShirts, awayShirts, homeFormation, awayFormation, homeLineup = null, awayLineup = null) {
    // ... существующий код ...
    
    if (!shirtsContainer) {
        shirtsContainer = document.createElement('div');
        shirtsContainer.className = 'shirts-container';
        shirtsContainer.style.cssText = 'position: absolute; top: 34px; left: 34px; right: 34px; bottom: 34px; pointer-events: none;';  /* ← pointer-events: none для контейнера */
        fieldCol.appendChild(shirtsContainer);
    }
    
    // ... остальной код ...
}
```

**Важно:** Контейнер должен иметь `pointer-events: none`, чтобы не блокировать клики, а сами футболки - `pointer-events: auto`.

## Выводы

1. **Система подсказок работает корректно** - все функции вызываются, футболки создаются
2. **Игроки не выбраны** - это нормально, подсказки должны показывать информацию о позиции
3. **Нет логов о кликах** - нужно проверить:
   - Кликал ли пользователь на футболки
   - Не блокируются ли клики CSS свойствами
   - Не перекрыты ли футболки другими элементами

## Следующие шаги

1. **Попросить пользователя кликнуть на футболку** и проверить логи
2. **Если логов нет** - добавить проверку CSS свойств (Решение 1)
3. **Если CSS проблема** - применить Решение 2 и 3
4. **Если все работает** - подсказки будут показываться для выбранных игроков

## Дополнительная информация

### Структура данных lineup

```javascript
lineup[idx] = {
    rowIndex: number,
    posValue: string,  // "GK", "LD", "CD", etc.
    getValue: () => string,  // ID игрока или ""
    setValue: (v, label) => void,
    selectedPlayer: Player | null,  // Данные игрока
    physicalFormId: string | null,  // ID физической формы
    customStyleValue: string  // Стиль игры
}
```

### Когда показываются подсказки

1. **С данными игрока** (если `playerData && playerData.player`):
   - Имя игрока
   - Базовая и расчетная сила
   - Модификаторы (форма, усталость, позиция, реальность)
   - Вклад в команду (капитан, синергия, химия, настрой и т.д.)

2. **Только позиция** (если `!playerData || !playerData.player`):
   - Название позиции
   - Линия (вратарская, защита, полузащита, нападение)
   - Описание позиции
   - Сообщение "Игрок не выбран"