# Анализ проблем позиционирования футболок на поле

## Исходные данные

- **Размер поля**: 400px × 566px
- **Размер футболки**: 40px × 34px
- **Контейнер**: `inset: 34px` (отступы со всех сторон)
- **Рабочая область**: 332px × 498px (400-68 × 566-68)
- **Центрирование**: `transform: translate(-50%, -50%)`

## Обнаруженные проблемы

### 1. ❌ Выход за верхнюю границу

**Гостевой GK:**
```
top: 1px, left: 166px
```

**Проблема:**
- Футболка 34px высотой с центрированием `translate(-50%, -50%)`
- Центр на 1px → верхний край на -16px (1 - 34/2 = -16)
- **Выходит за границу на 16px**

### 2. ❌ Выход за боковые границы

**Левый фланг (LM, LB, RW, RF):**
```
left: 41.2px
```

**Проблема:**
- Футболка 40px шириной с центрированием
- Центр на 41.2px → левый край на 21.2px (41.2 - 40/2 = 21.2)
- Контейнер начинается с 34px
- **Выходит за границу на ~13px** (34 - 21.2 = 12.8)

**Правый фланг (RM, RD, LW, LF):**
```
left: 290.8px
```

**Проблема:**
- Центр на 290.8px → правый край на 310.8px (290.8 + 40/2 = 310.8)
- Контейнер заканчивается на 332px (400 - 34 - 34 = 332)
- Пока в пределах, но близко к границе

### 3. ⚠️ Пересечения футболок

**Домашняя команда:**
- LB (top: 400, left: 41.2) и DM (top: 400, left: 166) - **на одной линии**
- CD (top: 450, left: 119.2) и CD (top: 450, left: 212.8) - близко друг к другу
- LM (top: 355, left: 41.2) и CM (top: 355, left: 166) - **на одной линии**

**Гостевая команда:**
- DM (top: 100, left: 166), LB (top: 100, left: 290.8), RB (top: 100, left: 41.2) - **три игрока на одной линии**
- CD (top: 50) - три защитника очень близко

## Решение

### Вариант 1: Увеличить минимальные отступы

**Текущие границы:**
```javascript
const MIN_X = 34;  // Левая граница контейнера
const MAX_X = 332; // Правая граница (400 - 34 - 34)
const MIN_Y = 34;  // Верхняя граница
const MAX_Y = 498; // Нижняя граница (566 - 34 - 34)
```

**Новые границы с учетом размера футболки:**
```javascript
const SHIRT_WIDTH = 40;
const SHIRT_HEIGHT = 34;
const SHIRT_HALF_WIDTH = SHIRT_WIDTH / 2;   // 20px
const SHIRT_HALF_HEIGHT = SHIRT_HEIGHT / 2; // 17px

// Минимальные координаты (центр футболки)
const MIN_X = 34 + SHIRT_HALF_WIDTH;  // 54px
const MAX_X = 332 - SHIRT_HALF_WIDTH; // 312px
const MIN_Y = 34 + SHIRT_HALF_HEIGHT; // 51px
const MAX_Y = 498 - SHIRT_HALF_HEIGHT; // 481px
```

### Вариант 2: Функция ограничения координат

```javascript
function clampShirtPosition(x, y) {
    const SHIRT_HALF_WIDTH = 20;
    const SHIRT_HALF_HEIGHT = 17;
    const CONTAINER_PADDING = 34;
    const FIELD_WIDTH = 400;
    const FIELD_HEIGHT = 566;
    
    const minX = CONTAINER_PADDING + SHIRT_HALF_WIDTH;
    const maxX = FIELD_WIDTH - CONTAINER_PADDING - SHIRT_HALF_WIDTH;
    const minY = CONTAINER_PADDING + SHIRT_HALF_HEIGHT;
    const maxY = FIELD_HEIGHT - CONTAINER_PADDING - SHIRT_HALF_HEIGHT;
    
    return {
        x: Math.max(minX, Math.min(maxX, x)),
        y: Math.max(minY, Math.min(maxY, y))
    };
}
```

### Вариант 3: Увеличить расстояние между линиями

**Текущие проблемные линии:**

Домашняя команда:
- Линия защиты: 400px, 450px (разница 50px)
- Линия полузащиты: 310px, 355px, 400px (разница 45px)
- Линия атаки: 265px

Гостевая команда:
- Линия защиты: 50px, 100px (разница 50px)
- Линия полузащиты: 100px, 190px (разница 90px)
- Линия атаки: 235px

**Рекомендуемое минимальное расстояние:**
- Между линиями: **60-70px** (чтобы футболки 34px высотой не пересекались)
- Между игроками на одной линии: **80-100px** (чтобы футболки 40px шириной не пересекались)

### Вариант 4: Адаптивное масштабирование

Если формация слишком плотная, уменьшить размер футболок:

```javascript
function calculateShirtSize(formation) {
    const positions = FORMATIONS[formation];
    const lineCount = countLines(positions);
    
    // Если больше 4 линий, уменьшаем размер
    if (lineCount > 4) {
        return {
            width: 35,  // вместо 40
            height: 30  // вместо 34
        };
    }
    
    return {
        width: 40,
        height: 34
    };
}
```

## Рекомендуемое решение

### Шаг 1: Обновить функцию генерации координат

В файле `calc.user.js`, функция `generateFieldPositionsWithFlankPreservation`:

```javascript
function generateFieldPositionsWithFlankPreservation(positions, team) {
    const FIELD_HEIGHT = 498; // Высота рабочей области (566 - 34 - 34)
    const FIELD_WIDTH = 332;  // Ширина рабочей области (400 - 34 - 34)
    
    // Размеры футболки
    const SHIRT_HALF_WIDTH = 20;
    const SHIRT_HALF_HEIGHT = 17;
    
    // Безопасные границы (центр футболки)
    const MIN_X = SHIRT_HALF_WIDTH;
    const MAX_X = FIELD_WIDTH - SHIRT_HALF_WIDTH;
    const MIN_Y = SHIRT_HALF_HEIGHT;
    const MAX_Y = FIELD_HEIGHT - SHIRT_HALF_HEIGHT;
    
    // ... остальной код ...
    
    // Применяем ограничения к координатам
    coords.forEach(coord => {
        if (coord) {
            coord.left = Math.max(MIN_X, Math.min(MAX_X, coord.left));
            coord.top = Math.max(MIN_Y, Math.min(MAX_Y, coord.top));
        }
    });
    
    return coords;
}
```

### Шаг 2: Увеличить минимальное расстояние между линиями

```javascript
const MIN_LINE_SPACING = 60; // Минимум 60px между линиями

// При расчете Y координат
const lineSpacing = Math.max(MIN_LINE_SPACING, calculatedSpacing);
```

### Шаг 3: Добавить проверку пересечений

```javascript
function checkOverlap(coord1, coord2) {
    const SHIRT_WIDTH = 40;
    const SHIRT_HEIGHT = 34;
    const MIN_DISTANCE = 5; // Минимальный зазор
    
    const dx = Math.abs(coord1.left - coord2.left);
    const dy = Math.abs(coord1.top - coord2.top);
    
    return dx < (SHIRT_WIDTH + MIN_DISTANCE) && 
           dy < (SHIRT_HEIGHT + MIN_DISTANCE);
}
```

## Примеры исправленных координат

### Гостевой GK (было: top: 1px)
```javascript
// Было
top: 1px  // Выходит за границу

// Должно быть
top: 51px  // MIN_Y = 34 + 17 = 51px
```

### Фланговые игроки (было: left: 41.2px)
```javascript
// Было
left: 41.2px  // Выходит за границу

// Должно быть
left: 54px  // MIN_X = 34 + 20 = 54px
```

### Фланговые игроки (было: left: 290.8px)
```javascript
// Было
left: 290.8px  // Близко к границе

// Должно быть
left: 278px  // MAX_X = 332 - 20 = 312px (но 290.8 еще в пределах)
```

## Итоговые рекомендации

1. ✅ **Добавить функцию `clampShirtPosition`** для ограничения координат
2. ✅ **Увеличить MIN_Y до 51px** (34 + 17)
3. ✅ **Увеличить MIN_X до 54px** (34 + 20)
4. ✅ **Уменьшить MAX_X до 312px** (332 - 20)
5. ✅ **Уменьшить MAX_Y до 481px** (498 - 17)
6. ✅ **Увеличить минимальное расстояние между линиями до 60px**
7. ⚠️ **Рассмотреть уменьшение размера футболок** для плотных формаций (опционально)