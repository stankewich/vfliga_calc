# Position Restrictions System - Система ограничений позиций

## Обзор

Система правил и ограничений для выбора мини-позиций в селекторах. Определяет, какие мини-позиции доступны для каждого игрока в зависимости от его позиции и состава команды.

## Основная функция

```javascript
function getAllowedMiniOptions(position, index, positions)
```

**Параметры:**
- `position` - текущая позиция игрока (GK, LD, CD, CM и т.д.)
- `index` - индекс игрока в составе (0-10)
- `positions` - массив всех позиций в составе

**Возвращает:** Массив доступных мини-позиций

## Правила для защитников

### LD (Left Defender)

**Базовая позиция:** LD  
**Доступные мини-позиции:** LD, LB

```javascript
// Пример
positions = ['GK', 'LD', 'CD', 'CD', 'RD', ...]
getAllowedMiniOptions('LD', 1, positions) // → ['LD', 'LB']
```

**Правила:**
- Всегда может стать LB (левый крайний защитник)
- Нет дополнительных ограничений

### RD (Right Defender)

**Базовая позиция:** RD  
**Доступные мини-позиции:** RD, RB

```javascript
// Пример
positions = ['GK', 'LD', 'CD', 'CD', 'RD', ...]
getAllowedMiniOptions('RD', 4, positions) // → ['RD', 'RB']
```

**Правила:**
- Всегда может стать RB (правый крайний защитник)
- Нет дополнительных ограничений

### CD (Central Defender)

**Базовая позиция:** CD  
**Доступные мини-позиции:** CD, SW (с ограничениями)

```javascript
// Пример 1: Первый CD может стать SW
positions = ['GK', 'LD', 'CD', 'CD', 'RD', ...]
getAllowedMiniOptions('CD', 2, positions) // → ['CD', 'SW']

// Пример 2: Второй CD не может (SW уже есть)
positions = ['GK', 'LD', 'SW', 'CD', 'RD', ...]
getAllowedMiniOptions('CD', 3, positions) // → ['CD']
```

**Правила:**
1. **Ограничение SW:** Только один SW в составе
2. **Приоритет:** Первый CD (минимальный индекс) имеет приоритет на SW
3. **Проверка:** Если SW уже есть в составе, другие CD не могут стать SW

**Логика:**
```javascript
// Подсчёт CD и SW
const cdCount = positions.filter(p => p === 'CD').length;
const swCount = positions.filter(p => p === 'SW').length;

// Индексы всех CD
const cdIndices = positions.map((p, i) => p === 'CD' ? i : -1).filter(i => i !== -1);
const minCdIndex = Math.min(...cdIndices);

// SW доступен только если:
// 1. Это минимальный CD (первый)
// 2. SW ещё нет в составе
const canBecomeSW = (index === minCdIndex) && (swCount === 0);
```

## Правила для полузащитников

### LM (Left Midfielder)

**Базовая позиция:** LM  
**Доступные мини-позиции:** LM, LW (с ограничениями)

```javascript
// Пример 1: Может стать LW (нет AM)
positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CF', 'CF']
getAllowedMiniOptions('LM', 4, positions) // → ['LM', 'LW']

// Пример 2: Не может стать LW (есть AM)
positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'CM', 'AM', 'RM', 'CF', 'CF']
getAllowedMiniOptions('LM', 4, positions) // → ['LM']
```

**Правила:**
1. **Условие для LW:** AM отсутствует в составе
2. **Исключение 4-2-4:** В схеме 4-2-4 LW недоступен
3. **Проверка LW:** LW ещё нет в составе

**Логика:**
```javascript
const amAbsent = !positions.includes('AM');
const hasLW = positions.includes('LW');
const is424 = (positions.filter(p => ['LM', 'RM', 'LW', 'RW'].includes(p)).length === 2) &&
              (positions.filter(p => ['CF', 'ST', 'LF', 'RF'].includes(p)).length === 4);

const canBecomeLW = amAbsent && !hasLW && !is424;
```

### RM (Right Midfielder)

**Базовая позиция:** RM  
**Доступные мини-позиции:** RM, RW (с ограничениями)

Правила аналогичны LM → LW.

### CM (Central Midfielder)

**Базовая позиция:** CM  
**Доступные мини-позиции:** CM, DM, AM, FR (с ограничениями)

Это самая сложная позиция с множеством правил.

#### CM → DM (Defensive Midfielder)

```javascript
// Пример 1: Минимальный CM может стать DM
positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CF', 'CF']
getAllowedMiniOptions('CM', 5, positions) // → ['CM', 'DM', 'FR']

// Пример 2: Максимальный CM НЕ может стать DM (при 2 CM)
positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CF', 'CF']
getAllowedMiniOptions('CM', 6, positions) // → ['CM', 'AM', 'FR']
```

**Правила:**
1. **Блокировка максимального:** При 2 CM максимальный (ближе к атаке) не может стать DM
2. **Проверка DM:** DM ещё нет в составе
3. **Минимальный CM:** Только минимальный CM может стать DM

**Логика:**
```javascript
const dmCount = positions.filter(p => p === 'DM').length;
const cmCount = positions.filter(p => p === 'CM').length;
const amCount = positions.filter(p => p === 'AM').length;

// Индексы CM
const cmIndices = positions.map((p, i) => p === 'CM' ? i : -1).filter(i => i !== -1);
const cmMin = Math.min(...cmIndices);
const cmMax = Math.max(...cmIndices);

const isMinCM = (index === cmMin);
const isMaxCM = (index === cmMax);

// Блокировка: максимальный CM при 2 CM не может стать DM
if (isMaxCM && cmCount === 2 && amCount === 0) {
    canBecomeDM = false;
} else {
    canBecomeDM = isMinCM && dmCount === 0;
}
```

#### CM → AM (Attacking Midfielder)

```javascript
// Пример 1: Максимальный CM может стать AM
positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CF', 'CF']
getAllowedMiniOptions('CM', 6, positions) // → ['CM', 'AM', 'FR']

// Пример 2: Не может стать AM (есть LW/RW)
positions = ['GK', 'LD', 'CD', 'RD', 'LW', 'CM', 'CM', 'RW', 'CF', 'CF']
getAllowedMiniOptions('CM', 6, positions) // → ['CM', 'FR']
```

**Правила:**
1. **Условие:** Должен быть максимальным полузащитником (ближе к атаке)
2. **Блокировка:** LW или RW в составе блокируют AM
3. **Проверка AM:** AM ещё нет в составе
4. **Исключение 4-2-4:** В схеме 4-2-4 AM недоступен

**Логика:**
```javascript
const hasLW = positions.includes('LW');
const hasRW = positions.includes('RW');
const amAbsent = !positions.includes('AM');

// Индексы всех полузащитников
const midfielderIndices = positions.map((p, i) => 
    ['LM', 'CM', 'DM', 'AM', 'FR', 'RM', 'LW', 'RW'].includes(p) ? i : -1
).filter(i => i !== -1);

const maxMidfielderIndex = Math.max(...midfielderIndices);
const isMaxMidfielder = (index === maxMidfielderIndex);

const canBecomeAM = isMaxMidfielder && amAbsent && !hasLW && !hasRW && !is424;
```

**Специальное правило для 3 полузащитников:**

```javascript
// При 3 полузащитниках средний CM может стать AM
const totalMidfielders = midfielderIndices.length;
if (totalMidfielders === 3) {
    const sortedIndices = [...midfielderIndices].sort((a, b) => a - b);
    const middleIndex = sortedIndices[1];
    
    if (index === middleIndex && position === 'CM') {
        canBecomeAM = amAbsent && !hasLW && !hasRW;
    }
}
```

#### CM → FR (Free Role)

```javascript
// Пример: CM может стать FR
positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CF', 'CF']
getAllowedMiniOptions('CM', 5, positions) // → ['CM', 'DM', 'FR']
```

**Правила:**
1. **Условие:** FR ещё нет в составе
2. **Ограничение:** Только для центральных полевых игроков (CM, DM, AM)

**Логика:**
```javascript
const frCount = positions.filter(p => p === 'FR').length;
const centralFieldPlayers = positions.filter(p => 
    ['CM', 'DM', 'AM', 'FR'].includes(p)
).length;

const canBecomeFR = (frCount === 0) && (centralFieldPlayers > 0);
```

## Правила для нападающих

### CF (Central Forward)

**Базовая позиция:** CF  
**Доступные мини-позиции:** CF, ST

```javascript
// Пример
positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'CM', 'RM', 'CF', 'CF', 'CF']
getAllowedMiniOptions('CF', 7, positions) // → ['CF', 'ST']
```

**Правила:**
- Всегда может стать ST (центральный форвард)
- Нет дополнительных ограничений

### LF (Left Forward)

**Базовая позиция:** LF  
**Доступные мини-позиции:** LF

```javascript
// Пример
positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'CM', 'RM', 'LF', 'CF', 'RF']
getAllowedMiniOptions('LF', 7, positions) // → ['LF']
```

**Правила:**
- Нет дополнительных мини-позиций
- Всегда только LF

### RF (Right Forward)

**Базовая позиция:** RF  
**Доступные мини-позиции:** RF

Правила аналогичны LF.

## Специальные случаи

### Схема 4-2-4

В схеме 4-2-4 (4 защитника, 2 полузащитника, 4 нападающих):
- **AM недоступен** для CM
- **LW/RW недоступны** для LM/RM

**Определение схемы:**
```javascript
const is424 = (positions.filter(p => ['LM', 'RM', 'LW', 'RW'].includes(p)).length === 2) &&
              (positions.filter(p => ['CF', 'ST', 'LF', 'RF'].includes(p)).length === 4);
```

### 3 полузащитника

При 3 полузащитниках средний CM может стать AM:

```javascript
const midfielderIndices = [5, 6, 7]; // Индексы полузащитников
const sortedIndices = [5, 6, 7];
const middleIndex = 6; // Средний

if (index === 6 && position === 'CM') {
    // Может стать AM
}
```

## Примеры составов

### Пример 1: 4-4-2

```javascript
positions = ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CF', 'CF'];

getAllowedMiniOptions('LD', 1, positions)  // → ['LD', 'LB']
getAllowedMiniOptions('CD', 2, positions)  // → ['CD', 'SW']
getAllowedMiniOptions('CD', 3, positions)  // → ['CD']
getAllowedMiniOptions('LM', 5, positions)  // → ['LM', 'LW']
getAllowedMiniOptions('CM', 6, positions)  // → ['CM', 'DM', 'FR']
getAllowedMiniOptions('CM', 7, positions)  // → ['CM', 'AM', 'FR']
getAllowedMiniOptions('CF', 9, positions)  // → ['CF', 'ST']
```

### Пример 2: 4-3-3

```javascript
positions = ['GK', 'LD', 'CD', 'CD', 'RD', 'CM', 'CM', 'CM', 'LF', 'CF', 'RF'];

getAllowedMiniOptions('CM', 5, positions)  // → ['CM', 'DM', 'FR']
getAllowedMiniOptions('CM', 6, positions)  // → ['CM', 'AM', 'FR'] (средний)
getAllowedMiniOptions('CM', 7, positions)  // → ['CM', 'AM', 'FR']
```

### Пример 3: 5-3-2

```javascript
positions = ['GK', 'LD', 'CD', 'CD', 'CD', 'RD', 'LM', 'CM', 'RM', 'CF', 'CF'];

getAllowedMiniOptions('CD', 2, positions)  // → ['CD', 'SW']
getAllowedMiniOptions('CD', 3, positions)  // → ['CD']
getAllowedMiniOptions('CD', 4, positions)  // → ['CD']
```

## Отладка

Для отладки используется детальное логирование:

```javascript
console.log('[getAllowedMiniOptions] === НАЧАЛО ПРОВЕРКИ ===');
console.log('[getAllowedMiniOptions] Позиция:', position, '(индекс', index, ')');
console.log('[getAllowedMiniOptions] Формация:', positions.join('-'));
console.log('[getAllowedMiniOptions] Подсчет позиций:', positionCounts);
console.log('[getAllowedMiniOptions] === РЕЗУЛЬТАТ ===');
console.log('[getAllowedMiniOptions] Итоговые опции:', options);
console.log('[getAllowedMiniOptions] === КОНЕЦ ПРОВЕРКИ ===');
```

## Связанные документы

- [Field Positioning System](FIELD_POSITIONING_SYSTEM.md)
- [Flank Positioning System](FLANK_POSITIONING_SYSTEM.md)
- [Field Hints System](FIELD_HINTS_SYSTEM.md)
