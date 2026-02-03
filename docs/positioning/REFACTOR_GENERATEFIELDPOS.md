# Рефакторинг функции генерации позиций на поле

**Дата**: 25 января 2026  
**Версия**: 0.933  
**Статус**: ✅ Завершено

## Проблема

В коде существовали две функции для генерации позиций игроков на поле:
1. `generateFieldPositions()` - старая функция (строки 510-647)
2. `generateFieldPositionsWithFlankPreservation()` - новая функция с улучшенной логикой

### Анализ использования

При проверке кода обнаружено:
- `generateFieldPositions()` - **мёртвый код**, нигде не вызывается
- `generateFieldPositionsWithFlankPreservation()` - используется в `displayShirtsOnField()` (строки 7288-7289)

## Решение

### 1. Удаление мёртвого кода
Удалена функция `generateFieldPositions()` (строки 510-647), так как она не используется.

### 2. Переименование функции
`generateFieldPositionsWithFlankPreservation()` → `generateFieldPos()`

**Причины переименования:**
- Короткое и понятное имя
- Отражает суть функции без избыточных деталей
- Соответствует стилю именования других функций

### 3. Обновление вызовов

**Файл**: `calc.user.js`, строки 7288-7289

**Было:**
```javascript
const homeCoords = generateFieldPositionsWithFlankPreservation(homePositions, 'home');
const awayCoords = generateFieldPositionsWithFlankPreservation(awayPositions, 'away');
```

**Стало:**
```javascript
const homeCoords = generateFieldPos(homePositions, 'home');
const awayCoords = generateFieldPos(awayPositions, 'away');
```

## Сигнатура функции

```javascript
function generateFieldPos(positions, team)
```

**Параметры:**
- `positions` - массив позиций игроков (например, `['GK', 'DL', 'DC', 'DR', 'ML', 'MC', 'MR', 'AL', 'AC', 'AR']`)
- `team` - команда: `'home'` или `'away'`

**Возвращает:**
- Объект с координатами для каждой позиции: `{ GK: {x, y}, DL: {x, y}, ... }`

## Особенности функции

### Фланговая привязка
Функция сохраняет фланговую привязку игроков:
- Левые позиции (L) → левая часть поля
- Центральные позиции (C) → центр поля
- Правые позиции (R) → правая часть поля

### Зоны позиционирования

**Домашняя команда (внизу):**
```javascript
gk: 549, def: 499, semidef: 475, mid: 449, semiatt: 424, att: 339
```

**Гостевая команда (вверху):**
```javascript
gk: 67, def: 127, semidef: 157, mid: 202, semiatt: 232, att: 277
```

### Константы позиционирования

Функция использует `FIELD_LAYOUT` для всех расчетов:
```javascript
const FIELD_LAYOUT = {
    CONTAINER_PADDING: 0,
    FIELD_WIDTH: 400,
    FIELD_HEIGHT: 566,
    SHIRT_WIDTH: 40,
    SHIRT_HEIGHT: 34,
    MIN_SPACING: 20,
    LINE_SPACING: 17
};
```

## Результат

- ✅ Удалён мёртвый код (137 строк)
- ✅ Функция переименована в `generateFieldPos`
- ✅ Обновлены все вызовы функции
- ✅ Версия обновлена до 0.933
- ✅ Код стал чище и понятнее

## Связанные документы

- `FIELD_COORDINATES_FINAL.md` - финальные координаты зон
- `REMOVE_CONTAINER_PADDING.md` - удаление отступов контейнера
- `REFACTOR_FIELD_LAYOUT_CONSTANTS.md` - централизация констант позиционирования
