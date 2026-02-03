# Система фланговой привязки позиций (Flank Positioning System)

## Обзор

Система фланговой привязки позиций обеспечивает сохранение фланговой принадлежности игроков при смене позиций в UI калькулятора. Основная цель - предотвратить нежелательное смещение фланговых игроков к центру поля при изменении их позиций.

## Проблема

**До внедрения системы:**
- При смене позиции LD → LB игрок перемещался в центр поля (x = 166)
- Фланговые игроки теряли свою фланговую принадлежность
- Визуальное представление не соответствовало тактической логике

**После внедрения системы:**
- LD → LB: игрок остается на левом фланге (x ≈ 43)
- RD → RB: игрок остается на правом фланге (x ≈ 289)
- Сохраняется тактическая логика расстановки

## Архитектура системы

### 1. Определение фланговой принадлежности

#### Константа `POSITION_FLANKS`
```javascript
const POSITION_FLANKS = {
    // Левый фланг
    'LD': 'left', 'LB': 'left', 'LM': 'left', 'LW': 'left', 'LF': 'left',
    
    // Правый фланг  
    'RD': 'right', 'RB': 'right', 'RM': 'right', 'RW': 'right', 'RF': 'right',
    
    // Центр
    'GK': 'center', 'SW': 'center', 'CD': 'center', 'DM': 'center', 
    'CM': 'center', 'AM': 'center', 'FR': 'center', 'CF': 'center', 'ST': 'center'
};
```

**Назначение:** Определяет фланговую принадлежность каждой позиции.

**Категории флангов:**
- `left` - левый фланг поля
- `right` - правый фланг поля  
- `center` - центральная зона поля

#### Функция `getPositionFlank(position)`
```javascript
function getPositionFlank(position) {
    return POSITION_FLANKS[position] || 'center';
}
```

**Параметры:**
- `position` (string) - код позиции игрока (например, 'LD', 'RB', 'CM')

**Возвращает:** 
- (string) - фланговая принадлежность: 'left', 'right' или 'center'

**Назначение:** Получение фланговой принадлежности для конкретной позиции.

### 2. Определение линий позиций

#### Функция `getPositionLine(position)`
```javascript
function getPositionLine(position) {
    if (position === 'GK') return 'gk';
    if (['LD', 'CD', 'RD', 'SW'].includes(position)) return 'def';
    if (['DM', 'LB', 'RB'].includes(position)) return 'semidef';
    if (['LM', 'CM', 'RM'].includes(position)) return 'mid';
    if (['AM', 'FR', 'RW', 'LW'].includes(position)) return 'semiatt';
    if (['LF', 'CF', 'RF', 'ST'].includes(position)) return 'att';
    return 'unknown';
}
```

**Параметры:**
- `position` (string) - код позиции игрока

**Возвращает:**
- (string) - линия позиции: 'gk', 'def', 'semidef', 'mid', 'semiatt', 'att'

**Назначение:** Определение тактической линии для позиции (используется для будущей системы стабильности).

**Линии позиций:**
- `gk` - вратарь
- `def` - защитная линия (LD, CD, RD, SW)
- `semidef` - полузащитная линия (DM, LB, RB)
- `mid` - средняя линия (LM, CM, RM)
- `semiatt` - полуатакующая линия (AM, FR, RW, LW)
- `att` - атакующая линия (LF, CF, RF, ST)

### 3. Основная функция генерации позиций

#### Функция `generateFieldPositionsWithFlankPreservation(formation, side, previousFormation)`

**Параметры:**
- `formation` (Array) - массив позиций текущей формации
- `side` (string) - сторона команды: 'home' или 'away'
- `previousFormation` (Array, optional) - предыдущая формация для анализа изменений

**Возвращает:**
- (Array) - массив объектов с координатами позиций: `[{position, top, left}, ...]`

**Основные этапы работы:**

1. **Инициализация параметров поля**
   ```javascript
   const fieldWidth = 332;
   const fieldHeight = 498;
   const isHome = side === 'home';
   ```

2. **Определение зон по вертикали**
   ```javascript
   const zones = isHome ? {
       gk: 497, def: 450, semidef: 400, 
       mid: 355, semiatt: 310, att: 265
   } : {
       gk: 1, def: 50, semidef: 100,
       mid: 145, semiatt: 190, att: 235
   };
   ```

3. **Группировка игроков по линиям с фланговой информацией**
   ```javascript
   formation.forEach((pos, idx) => {
       const flank = getPositionFlank(pos);
       const playerInfo = { pos, idx, flank };
       // Распределение по линиям...
   });
   ```

4. **Генерация координат для каждой линии**

### 4. Система распределения по горизонтали

#### Функция `distributeHorizontallyWithStability(playersInfo, lineType)`

**Параметры:**
- `playersInfo` (Array) - массив объектов игроков: `[{pos, idx, flank}, ...]`
- `lineType` (string) - тип линии: 'def', 'mid', 'att' и т.д.

**Возвращает:**
- (Array) - массив объектов: `[{player, x}, ...]`

**Назначение:** Делегирует распределение функции `distributeByFlanks()`.

#### Функция `distributeByFlanks(playersInfo)`

**Параметры:**
- `playersInfo` (Array) - массив объектов игроков с фланговой информацией

**Возвращает:**
- (Array) - массив объектов с координатами: `[{player, x}, ...]`

**Логика распределения:**

1. **Сортировка по флангам**
   ```javascript
   const sortedPlayers = [...playersInfo].sort((a, b) => {
       const flankOrder = { 'left': 0, 'center': 1, 'right': 2 };
       return flankOrder[a.flank] - flankOrder[b.flank];
   });
   ```

2. **Распределение координат по количеству игроков:**

   **Один игрок:**
   ```javascript
   if (count === 1) {
       const player = sortedPlayers[0];
       if (player.flank === 'left') {
           positions.push(margin + usableWidth * 0.1); // x ≈ 43
       } else if (player.flank === 'right') {
           positions.push(margin + usableWidth * 0.9); // x ≈ 300
       } else {
           positions.push(fieldWidth / 2); // x = 166
       }
   }
   ```

   **Два игрока:**
   ```javascript
   if (count === 2) {
       const hasLeft = sortedPlayers.some(p => p.flank === 'left');
       const hasRight = sortedPlayers.some(p => p.flank === 'right');
       
       if (hasLeft && hasRight) {
           // Фланговые позиции: 10% и 90%
           positions.push(margin + usableWidth * 0.1, margin + usableWidth * 0.9);
       } else {
           // Обычное распределение: 25% и 75%
           positions.push(margin + usableWidth * 0.25, margin + usableWidth * 0.75);
       }
   }
   ```

   **Три игрока:**
   ```javascript
   if (count === 3) {
       // Левый фланг, центр, правый фланг
       positions.push(margin, fieldWidth / 2, fieldWidth - margin);
   }
   ```

   **Четыре и более игроков:**
   ```javascript
   for (let i = 0; i < count; i++) {
       positions.push(margin + (usableWidth / (count - 1)) * i);
   }
   ```

### 5. Финальная обработка координат

#### Зеркалирование для гостевой команды
```javascript
positionsWithPlayers.forEach(({ player, x }) => {
    // Зеркалируем координаты для гостевой команды
    const finalX = isHome ? x : (fieldWidth - x);
    
    positions[player.idx] = { 
        position: player.pos, 
        top: zone, 
        left: finalX
    };
});
```

**Логика зеркалирования:**
- Домашняя команда: координаты остаются как есть
- Гостевая команда: `finalX = fieldWidth - x` (зеркалирование по горизонтали)

## Интеграция в систему

### Точка входа

Функция вызывается из системы отображения футболок:

```javascript
// В функции отображения футболок
const homeCoords = generateFieldPositionsWithFlankPreservation(homePositions, 'home');
const awayCoords = generateFieldPositionsWithFlankPreservation(awayPositions, 'away');
```

### Замена старой системы

Новая функция заменяет стандартную `generateFieldPositions()`:

```javascript
// Старый вызов
const coords = generateFieldPositions(formation, side);

// Новый вызов  
const coords = generateFieldPositionsWithFlankPreservation(formation, side);
```

## Диагностика и отладка

### Логирование

Система включает подробное логирование для отладки:

```javascript
console.log(`[FlankPositioning] Генерация позиций для ${side}:`, formation);
console.log(`[FlankPositioning] Игрок ${idx}: ${pos} -> фланг: ${flank}`);
console.log(`[FlankPositioning] Линия ${lineType}:`, positionsWithPlayers.map(...));
console.log(`[FlankPositioning] Итоговые позиции для ${side}:`, positions);
```

### Формат логов

```
[FlankPositioning] Линия def: Array(4) [ 
    "LD(left) -> x:10 -> final:10", 
    "CD(center) -> x:114 -> final:114", 
    "CD(center) -> x:218 -> final:218", 
    "RD(right) -> x:322 -> final:322" 
]
```

## Координатная система

### Размеры поля
- **Ширина:** 332px
- **Высота:** 498px  
- **Отступы:** 10px с каждой стороны
- **Рабочая ширина:** 312px (332 - 20)

### Ключевые координаты X
- **Левый край:** 10px
- **Левый фланг (10%):** ~43px
- **Левый центр (25%):** ~88px  
- **Центр:** 166px
- **Правый центр (75%):** ~244px
- **Правый фланг (90%):** ~300px
- **Правый край:** 322px

### Координаты Y (зоны)
**Домашняя команда (снизу вверх):**
- gk: 497, def: 450, semidef: 400, mid: 355, semiatt: 310, att: 265

**Гостевая команда (сверху вниз):**
- gk: 1, def: 50, semidef: 100, mid: 145, semiatt: 190, att: 235

## Примеры работы

### Пример 1: Смена позиции LD → LB

**Исходная формация:** `['GK', 'LD', 'CD', 'CD', 'RD', ...]`
**Новая формация:** `['GK', 'LB', 'CD', 'CD', 'RD', ...]`

**Результат:**
- LD был на линии `def` с координатой x=10 (левый фланг)
- LB попадает на линию `semidef` с координатой x≈43 (левый фланг сохранен)
- Остальные игроки линии `def` остаются на своих местах

### Пример 2: Одиночный фланговый игрок

**Формация:** `['GK', 'LB', 'CD', 'CD', 'RD', ...]` (LB один на линии semidef)

**Результат:**
- LB получает координату x≈43 (левый фланг) вместо x=166 (центр)
- Фланговая принадлежность сохраняется даже при отсутствии других игроков на линии

## Будущие улучшения

### Система стабильности позиций (TODO)

Планируется реализация полной системы стабильности:

1. **Отслеживание изменений**
   - Сравнение предыдущей и текущей формации
   - Определение измененного игрока

2. **Сохранение позиций при смене линий**
   - LD → LB: остальные игроки линии `def` не двигаются
   - CM → DM: все игроки линии `mid` перераспределяются

3. **Глобальное состояние позиций**
   - Хранение предыдущих координат
   - Передача в функцию генерации

### Структура для будущей реализации

```javascript
// Анализ изменений (заготовка)
if (previousFormation) {
    const changedPlayerIndex = findChangedPlayer(formation, previousFormation);
    const changedPlayerLine = getPositionLine(formation[changedPlayerIndex]);
    const previousPlayerLine = getPositionLine(previousFormation[changedPlayerIndex]);
    
    if (changedPlayerLine !== previousPlayerLine) {
        // Игрок сменил линию - сохранить позиции остальных
    } else {
        // Игрок остался на линии - перераспределить всех
    }
}
```

## Заключение

Система фланговой привязки позиций обеспечивает:

1. **Сохранение тактической логики** - фланговые игроки остаются на флангах
2. **Улучшенное визуальное представление** - позиции соответствуют реальному футболу  
3. **Гибкость настройки** - легко добавлять новые позиции и правила
4. **Подготовку к расширению** - заложена основа для системы стабильности

Система успешно решает основную проблему смещения фланговых игроков к центру и создает основу для дальнейших улучшений позиционирования в UI калькулятора.