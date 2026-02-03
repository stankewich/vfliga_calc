# Style Knowledge System - Система изученности стилей

**Дата:** 3 февраля 2026  
**Версия:** 0.936  
**Статус:** ✅ Реализовано

## Концепция

**Style Knowledge** - это модификатор игрока, который применяется к итоговому результату Chemistry расчетов. Он отражает насколько хорошо игрок изучил свой стиль игры.

### Ключевые принципы:

1. **Модификатор к итоговому результату** - применяется после расчета базового Chemistry
2. **Диапазон:** от 0.0 (0%) до 1.0 (100%)
3. **По умолчанию:** 1.0 (100% изученности)
4. **Формула:** `FinalChemistry = BaseChemistry * StyleKnowledge`

## Формула расчета

### Пример расчета для GK:

```
GK связан с 3 игроками:
1) Линия с LD: +5% (одинаковая национальность)
2) Линия с CD: +12.5% (одинаковый стиль)  
3) Линия с RD: 0% (разные нац, разные стили)

Шаг 1: Базовый Chemistry = (5 + 12.5 + 0) / 3 = 5.83%
Шаг 2: Style Knowledge GK = 80% = 0.8
Шаг 3: Итоговый Chemistry = 5.83% * 0.8 = 4.67%
```

### Различные уровни изученности:

| Style Knowledge | Модификатор | Пример (базовый 5.83%) |
|----------------|-------------|-------------------------|
| 20% | 0.2 | 5.83% * 0.2 = 1.17% |
| 40% | 0.4 | 5.83% * 0.4 = 2.33% |
| 60% | 0.6 | 5.83% * 0.6 = 3.50% |
| 80% | 0.8 | 5.83% * 0.8 = 4.67% |
| 100% | 1.0 | 5.83% * 1.0 = 5.83% |

## Имплементация

### 1. Структура данных игрока

```javascript
const player = {
    id: 12345,
    name: "Иван Иванов",
    nat_id: 142,
    nat: "Россия",
    hidden_style: "norm",
    styleKnowledge: 1.0,  // ← Новое поле (по умолчанию 100%)
    // ... остальные поля
};
```

### 2. Функция расчета

```javascript
function calculatePlayerChemistryModifier(player, lineup, positions) {
    // ... расчет базового Chemistry ...
    
    // Рассчитываем базовый Chemistry (среднее арифметическое модификаторов всех линий)
    const baseChemistry = connectionCount > 0 ? totalModifier / connectionCount : 0;
    
    // Применяем модификатор изученности стиля игрока
    const styleKnowledge = player.styleKnowledge || 1.0; // По умолчанию 100%
    const finalChemistry = baseChemistry * styleKnowledge;
    
    return finalChemistry;
}
```

### 3. Извлечение данных

```javascript
function extractPlayersFromPlrdat(plrdat) {
    return plrdat.map(p => ({
        // ... существующие поля ...
        styleKnowledge: 1.0, // По умолчанию 100% изученности
        // ... остальные поля ...
    }));
}
```

## Тестирование

### Функция testChemistry()

Обновленная функция `testChemistry()` теперь включает тест Style Knowledge:

```javascript
=== ТЕСТ STYLE KNOWLEDGE ===
Тестируем игрока: Иван Иванов
Style Knowledge 20%: Chemistry = 1.2%
Style Knowledge 40%: Chemistry = 2.3%
Style Knowledge 60%: Chemistry = 3.5%
Style Knowledge 80%: Chemistry = 4.7%
Style Knowledge 100%: Chemistry = 5.8%
```

### Логирование

```javascript
[CHEMISTRY] Иван Иванов: +4.7% {
    nat_id: 142,
    nat: "Россия",
    hidden_style: "norm",
    styleKnowledge: 0.8,
    modifier: 0.047
}
```

## Примеры использования

### Пример 1: Полностью изученный стиль

```javascript
const player = {
    name: "Профи",
    styleKnowledge: 1.0,  // 100%
    // базовый Chemistry = 6%
};
// Итоговый Chemistry = 6% * 1.0 = 6%
```

### Пример 2: Частично изученный стиль

```javascript
const player = {
    name: "Новичок", 
    styleKnowledge: 0.4,  // 40%
    // базовый Chemistry = 6%
};
// Итоговый Chemistry = 6% * 0.4 = 2.4%
```

### Пример 3: Неизученный стиль

```javascript
const player = {
    name: "Дебютант",
    styleKnowledge: 0.0,  // 0%
    // базовый Chemistry = 6%
};
// Итоговый Chemistry = 6% * 0.0 = 0%
```

## Интеграция с существующей системой

### Обратная совместимость

- Если `styleKnowledge` не задан, используется значение `1.0` (100%)
- Существующие расчеты остаются неизменными
- Новая логика применяется только к итоговому результату

### Влияние на силу команды

Style Knowledge влияет на итоговую силу игрока через Chemistry бонус:

```javascript
// В функции computeTeamStrength:
const chemistryBonus = getChemistryBonus(player, inLineupPlayers, teamStyleId);
// chemistryBonus уже учитывает styleKnowledge

const finalStrength = baseStrength * (1 + chemistryBonus + otherBonuses);
```

## Будущие улучшения

### 1. Извлечение реальных данных

В будущем можно добавить извлечение реального значения `styleKnowledge` из:
- HTML страницы игрока
- API данных
- Дополнительных полей в `plrdat`

### 2. Динамическое изменение

```javascript
// Пример функции для изменения изученности
function setPlayerStyleKnowledge(playerId, knowledgePercent) {
    const player = findPlayerById(playerId);
    if (player) {
        player.styleKnowledge = knowledgePercent / 100; // Конвертируем % в коэффициент
    }
}
```

### 3. UI интеграция

- Отображение уровня изученности в интерфейсе
- Слайдеры для тестирования разных уровней
- Визуализация влияния на Chemistry

## Заключение

Style Knowledge система реализована как модификатор к итоговому Chemistry результату. Это позволяет:

- ✅ Гибко управлять влиянием Chemistry на силу игрока
- ✅ Сохранить обратную совместимость
- ✅ Легко тестировать разные сценарии
- ✅ Подготовить основу для будущих улучшений

Система готова к использованию с версии 0.936.