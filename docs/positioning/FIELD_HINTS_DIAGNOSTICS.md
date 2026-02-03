# Диагностика системы подсказок для футболок

## Проблема
Подсказки не работают на реальном сайте virtualsoccer.ru/previewmatch.php при клике на футболки.

## Добавленное логирование

Для диагностики проблемы добавлено подробное логирование в следующие функции:

### 1. `displayShirtsOnField()`
```javascript
console.log('[FieldHints] displayShirtsOnField вызвана');
console.log('[FieldHints] homeLineup:', homeLineup);
console.log('[FieldHints] awayLineup:', awayLineup);
```

**Проверяет:**
- Вызывается ли функция вообще
- Передаются ли данные составов (homeLineup, awayLineup)

### 2. Цикл создания футболок (для каждой команды)
```javascript
// Для домашней команды
console.log(`[FieldHints] Домашняя команда - позиция ${position}: игрок ${playerName}, данные:`, playerData);
console.log(`[FieldHints] Домашняя команда - позиция ${position}: игрок не выбран (playerId: ${playerId})`);
console.log(`[FieldHints] Домашняя команда - позиция ${position}: homeLineup[${idx}] отсутствует`);

// Для гостевой команды
console.log(`[FieldHints] Гостевая команда - позиция ${position}: игрок ${playerName}, данные:`, playerData);
console.log(`[FieldHints] Гостевая команда - позиция ${position}: игрок не выбран (playerId: ${playerId})`);
console.log(`[FieldHints] Гостевая команда - позиция ${position}: awayLineup[${idx}] отсутствует`);
```

**Проверяет:**
- Для каждой позиции: есть ли данные игрока
- Выбран ли игрок в селекторе
- Доступен ли элемент lineup для данной позиции

### 3. `createShirtElement()`
```javascript
console.log(`[FieldHints] Создание футболки: ID=${uniqueId}, позиция=${position}, команда=${team}, игрок=${playerName}, есть данные=${!!playerData}`);
```

**Проверяет:**
- Создается ли элемент футболки
- Передаются ли данные игрока при создании

### 4. Обработчик клика по футболке
```javascript
console.log(`[FieldHints] Клик по футболке: ${uniqueId}, позиция: ${position}, команда: ${team}`);

if (playerData && playerData.player) {
    console.log(`[FieldHints] Показываем подсказку для игрока: ${playerData.player.name}`);
} else {
    console.log(`[FieldHints] Показываем подсказку только для позиции: ${position}`);
}
```

**Проверяет:**
- Срабатывает ли обработчик клика
- Есть ли данные игрока при клике

### 5. `showFieldPlayerHint()`
```javascript
console.log('[FieldHints] showFieldPlayerHint вызвана');
console.log('[FieldHints] position:', position);
console.log('[FieldHints] team:', team);
console.log('[FieldHints] playerData:', playerData);
console.log('[FieldHints] shirtElement:', shirtElement);
```

**Проверяет:**
- Вызывается ли функция показа подсказки
- Какие данные передаются в функцию

## Инструкции по диагностике

### Шаг 1: Откройте консоль браузера
1. Перейдите на страницу virtualsoccer.ru/previewmatch.php
2. Откройте консоль разработчика (F12)
3. Перейдите на вкладку "Console"

### Шаг 2: Проверьте инициализацию
Найдите в консоли сообщения:
```
[FieldHints] displayShirtsOnField вызвана
[FieldHints] homeLineup: [...]
[FieldHints] awayLineup: [...]
```

**Если сообщений нет:**
- ❌ Функция `displayShirtsOnField` не вызывается
- Проблема: система футболок не инициализируется
- Решение: проверить вызов `initializeShirtsSystem`

**Если homeLineup/awayLineup = null:**
- ❌ Данные составов не передаются
- Проблема: `homeLineupBlock` и `awayLineupBlock` не передаются в функцию
- Решение: проверить передачу параметров в `initializeShirtsSystem`

### Шаг 3: Проверьте создание футболок
Найдите сообщения для каждой позиции:
```
[FieldHints] Создание футболки: ID=shirt-home-GK-..., позиция=GK, команда=home, игрок=Иван Иванов, есть данные=true
```

**Если "есть данные=false":**
- ⚠️ Футболки создаются, но без данных игроков
- Проблема: данные не извлекаются из lineup
- Решение: проверить структуру `homeLineup[idx]` и наличие `selectedPlayer`

### Шаг 4: Проверьте клик по футболке
Кликните на любую футболку и найдите:
```
[FieldHints] Клик по футболке: shirt-home-GK-..., позиция: GK, команда: home
[FieldHints] Показываем подсказку для игрока: Иван Иванов
[FieldHints] showFieldPlayerHint вызвана
```

**Если сообщения о клике нет:**
- ❌ Обработчик клика не срабатывает
- Проблема: элемент футболки не создан или перекрыт другим элементом
- Решение: проверить CSS свойства футболки (z-index, pointer-events)

**Если "Показываем подсказку только для позиции":**
- ⚠️ Клик работает, но данных игрока нет
- Показывается базовая подсказка о позиции
- Это нормально, если игрок не выбран в селекторе

### Шаг 5: Проверьте отображение подсказки
После клика должна появиться подсказка на экране.

**Если подсказка не появляется:**
- Проверьте, вызывается ли `showFieldPlayerHint`
- Проверьте, нет ли ошибок JavaScript в консоли
- Проверьте CSS стили подсказки (z-index, position, display)

## Возможные проблемы и решения

### Проблема 1: homeLineup/awayLineup = null
**Причина:** Параметры не передаются в `initializeShirtsSystem`

**Решение:**
```javascript
// В функции init() проверить:
const homeLineupBlock = window.homeLineupBlock;
const awayLineupBlock = window.awayLineupBlock;

initializeShirtsSystem(
    homeTeamId, 
    awayTeamId, 
    fieldCol, 
    homeFormationSelect, 
    awayFormationSelect, 
    homeLineupBlock,  // ← Должны передаваться
    awayLineupBlock   // ← Должны передаваться
);
```

### Проблема 2: selectedPlayer отсутствует
**Причина:** Игрок не выбран в селекторе или структура данных изменилась

**Решение:**
```javascript
// Проверить структуру lineup[idx]:
console.log('lineup[idx]:', homeLineup[idx]);
console.log('getValue:', homeLineup[idx].getValue);
console.log('selectedPlayer:', homeLineup[idx].selectedPlayer);
```

### Проблема 3: Клик не срабатывает
**Причина:** Элемент футболки перекрыт или имеет pointer-events: none

**Решение:**
```javascript
// В createShirtElement проверить:
div.style.cursor = 'pointer';
div.style.pointerEvents = 'auto';
div.style.zIndex = '10';
```

### Проблема 4: Подсказка не отображается
**Причина:** Ошибка в функции `showFieldPlayerHint` или `getPlayerFullData`

**Решение:**
- Проверить консоль на наличие ошибок JavaScript
- Проверить, существует ли функция `getPlayerFullData`
- Проверить, корректно ли работает `getPositionInfo`

## Следующие шаги

После сбора логов из консоли:

1. **Определить на каком этапе проблема:**
   - Инициализация (displayShirtsOnField не вызывается)
   - Передача данных (lineup = null)
   - Создание футболок (playerData = null)
   - Обработка клика (обработчик не срабатывает)
   - Отображение подсказки (функция не вызывается или ошибка)

2. **Применить соответствующее решение** из раздела "Возможные проблемы"

3. **Протестировать исправление** на реальном сайте

## Файлы с изменениями

- `calc.user.js` - добавлено логирование в функции:
  - `displayShirtsOnField()`
  - `createShirtElement()`
  - `showFieldPlayerHint()`
  - Циклы создания футболок для обеих команд