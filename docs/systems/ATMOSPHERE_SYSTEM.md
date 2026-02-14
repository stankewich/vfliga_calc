# Система атмосферы

## Обзор
Система автоматически извлекает значение атмосферы команды со страницы состава и применяет соответствующий бонус к силе игроков.

## Источник данных

### Функция `loadTeamAtmosphere(teamId)`

**Назначение**: Загружает значение атмосферы команды со страницы `roster_s.php`.

**Алгоритм**:
1. Загружает HTML страницу `roster_s.php?num={teamId}`
2. Парсит DOM документ
3. Ищет строку таблицы с текстом "Атмосфера в команде:"
4. Извлекает значение в формате `"+2%"`, `"-1%"`, `"0%"`
5. Конвертирует в десятичное число (делит на 100)
   - `+2%` → `0.02`
   - `-3%` → `-0.03`
   - `0%` → `0`
6. Возвращает число или `0` при ошибке

**Логирование**:
- `[Atmosphere] Parsed for team X : Y` - успешно извлечено
- `[Atmosphere] Not found for team X, using default 0` - не найдено
- `[Atmosphere] Failed to load roster_s for team X` - ошибка загрузки
- `[Atmosphere] Parse error for team X` - ошибка парсинга

## Применение бонуса

### Функция `getAtmosphereBonus(contribBase, atmosphereValue)`

**Формула**: `contribBase * atmosphereValue`

**Параметры**:
- `contribBase` - базовый вклад игрока (calculatedRealStr * denom)
- `atmosphereValue` - значение атмосферы (например, 0.02 для +2%)

**Возвращает**: Бонус атмосферы для игрока

### Применение в расчете силы

В функции `computeTeamStrength()`:

```javascript
const atmosphereBonusForPlayer = getAtmosphereBonus(contribBase, atmosphereValue);
totalAtmosphereBonus += atmosphereBonusForPlayer;

const contribution = contribWithIndividualBonuses +
    captainBonusForPlayer +
    collisionWinBonusForPlayer +
    chemistryBonusForPlayer +
    homeBonusForPlayer +
    leadershipBonusForPlayer +
    synergyBonusForPlayer +
    roughBonusForPlayer +
    defenceTypeBonusForPlayer +
    positionBonusForPlayer +
    moraleBonusForPlayer +
    atmosphereBonusForPlayer +  // ← Добавляется здесь
    teamIBonusForPlayer;
```

## Отображение в UI

### Элемент отображения
- ID: `vs_atmosphere_home` (хозяева), `vs_atmosphere_away` (гости)
- Формат: `{процент}% ({общий_бонус})`
- Пример: `2% (+15.43)`

### Функция `updateAtmosphereDisplay(sideLabel, atmosphereValue, totalAtmosphereBonus)`

**Параметры**:
- `sideLabel` - 'home' или 'away'
- `atmosphereValue` - значение атмосферы (0.02 для +2%)
- `totalAtmosphereBonus` - суммарный бонус для всей команды

**Цвета**:
- Положительная атмосфера: зеленый `rgb(0, 102, 0)`
- Отрицательная атмосфера: красный `rgb(204, 0, 0)`
- Нулевая атмосфера: серый `rgb(68, 68, 68)`

## Интеграция с калькулятором

### Загрузка данных
```javascript
const [homePlayers, awayPlayers, homeAtmosphere, awayAtmosphere] = await Promise.all([
    loadTeamRoster(homeTeamId, tournamentType),
    loadTeamRoster(awayTeamId, tournamentType),
    loadTeamAtmosphere(homeTeamId),
    loadTeamAtmosphere(awayTeamId)
]);
```

### Передача в расчет
```javascript
const [homeStrength, awayStrength] = await Promise.all([
    computeTeamStrength(homeLineupBlock.lineup, homePlayers, homeTeamStyleId,
        'home', awayTeamStyleId, homeAttendancePercent, userSynergyHome, homeAtmosphere),
    computeTeamStrength(awayLineupBlock.lineup, awayPlayers, awayTeamStyleId,
        'away', homeTeamStyleId, -1, userSynergyAway, awayAtmosphere)
]);
```

## Особенности

### Атмосфера в field hints
Атмосфера **НЕ** учитывается в подсказках при наведении на игроков (field hints).

Причина: Field hints показывают упрощенную информацию об игроке, а атмосфера - это командный бонус, который рассчитывается только в основном расчете силы команды.

### Кэширование
Атмосфера **НЕ** сохраняется в localStorage. Значение загружается заново при каждой инициализации калькулятора.

Причина: Атмосфера может меняться между матчами, поэтому всегда берется актуальное значение с сервера.

## Примеры значений

| Атмосфера на сайте | Значение в коде | Бонус для игрока с contribBase=100 |
|-------------------|-----------------|-------------------------------------|
| +5%               | 0.05            | +5.00                               |
| +2%               | 0.02            | +2.00                               |
| 0%                | 0               | 0                                   |
| -1%               | -0.01           | -1.00                               |
| -3%               | -0.03           | -3.00                               |

## Отладка

Для отладки системы атмосферы:

1. Проверьте консоль на наличие логов `[Atmosphere]`
2. Убедитесь, что значение загружено: `console.log(homeAtmosphere, awayAtmosphere)`
3. Проверьте отображение в UI: элементы `vs_atmosphere_home` и `vs_atmosphere_away`
4. Проверьте применение бонуса в логах расчета силы

## История изменений

### v0.946 (2026-02-14)
- Удален устаревший код поиска несуществующего элемента `vs-home-atmosphere`
- Уточнена документация о том, что атмосфера не учитывается в field hints
- Добавлена документация системы атмосферы
