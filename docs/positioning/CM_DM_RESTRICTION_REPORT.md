# Ограничение CM→DM при CM=2

## Требование
Добавить ограничение: если в составе ровно 2 CM, то CM с максимальным индексом не может стать DM.

## Анализ существующей логики

### До изменения
```javascript
let cmToDMAllowed = false;
if ((dmCount < 2) && cmCount > 2 && (rowIndex === cmMin1 || rowIndex === cmMin2)) cmToDMAllowed = true;
if ((dmCount < 2) && cmCount === 2 && rowIndex === cmMin1) cmToDMAllowed = true;  // ← Только первая CM
if ((dmCount < 2) && cmCount === 1) cmToDMAllowed = true;
```

**Проблема**: При `cmCount === 2` разрешалось только `cmMin1` (первой CM) стать DM, но это не соответствует требованию.

### После изменения
```javascript
let cmToDMAllowed = false;
if ((dmCount < 2) && cmCount > 2 && (rowIndex === cmMin1 || rowIndex === cmMin2)) cmToDMAllowed = true;
// НОВОЕ ОГРАНИЧЕНИЕ: Если CM = 2, то CM с максимальным индексом НЕ может быть DM
if ((dmCount < 2) && cmCount === 2 && rowIndex !== cmMax) cmToDMAllowed = true;
if ((dmCount < 2) && cmCount === 1) cmToDMAllowed = true;
```

**Решение**: При `cmCount === 2` разрешается любой CM стать DM, **кроме** CM с максимальным индексом (`rowIndex !== cmMax`).

## Логика работы

### Определение индексов CM
```javascript
const cmIdxs = (counts.indexes && counts.indexes['CM']) || [];
const cmSorted = [...cmIdxs].sort((a, b) => a - b);
const cmMin1 = cmSorted[0] ?? null;           // Первая CM
const cmMin2 = cmSorted[1] ?? null;           // Вторая CM  
const cmMax = cmSorted[cmSorted.length - 1];  // Последняя CM
```

### Примеры работы

#### Пример 1: Формация 4-4-2
Позиции: `['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CF', 'CF']`
- CM позиции: индексы 6, 7
- `cmMin1 = 6`, `cmMax = 7`
- **CM на индексе 6**: может стать DM ✅ (`rowIndex !== cmMax`)
- **CM на индексе 7**: НЕ может стать DM ❌ (`rowIndex === cmMax`)

#### Пример 2: Формация 4-3-3  
Позиции: `['GK', 'LD', 'CD', 'CD', 'RD', 'CM', 'CM', 'CM', 'LW', 'CF', 'RW']`
- CM позиции: индексы 5, 6, 7
- `cmCount = 3` → правило не действует, используется стандартная логика
- **Любая CM**: может стать DM согласно стандартным правилам

#### Пример 3: Формация 4-1-4-1
Позиции: `['GK', 'LD', 'CD', 'CD', 'RD', 'CM', 'LM', 'AM', 'RM', 'CF', 'ST']`
- CM позиции: индекс 5
- `cmCount = 1` → единственная CM может стать DM ✅

## Внесенные изменения

### 1. Обновлена логика CM→DM (calc.user.js:3856-3868)
```javascript
// НОВОЕ ОГРАНИЧЕНИЕ: Если CM = 2, то CM с максимальным индексом НЕ может быть DM
if ((dmCount < 2) && cmCount === 2 && rowIndex !== cmMax) cmToDMAllowed = true;
```

### 2. Добавлено логирование (calc.user.js:3864-3868)
```javascript
console.log(`[PositionLogic] CM→DM проверка для позиции ${rowIndex}:`, {
    dmCount, cmCount, cmMin1, cmMax, 
    isMaxCM: rowIndex === cmMax,
    canBecomeDM: cmToDMAllowed
});
```

## Тестирование
Создан тест `test-cm-dm-restriction.html` для проверки всех сценариев:
- ✅ CM=2, первая CM → может стать DM
- ✅ CM=2, вторая CM → НЕ может стать DM  
- ✅ CM=3, любая CM → стандартные правила
- ✅ CM=1, единственная CM → может стать DM

## Статус: ✅ РЕАЛИЗОВАНО
Ограничение "CM с максимальным индексом не может быть DM при CM=2" успешно добавлено в логику `getAllowedMiniOptions`.