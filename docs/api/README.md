# API Documentation

Документация по программным интерфейсам и функциям Virtual Soccer Strength Analyzer.

## Содержание

### Lineup Functions API
- **[LINEUP_FUNCTIONS_API.md](LINEUP_FUNCTIONS_API.md)** - API функций для работы с составами команд
  - Функции проверки и загрузки составов
  - Интеграция с формами отправки состава
  - Применение загруженных составов

### Shirts System API  
- **[SHIRTS_SYSTEM_API.md](SHIRTS_SYSTEM_API.md)** - API системы отображения футболок
  - Функции загрузки футболок команд
  - Кэширование и управление футболками
  - Интеграция с визуализацией поля

## Общие принципы API

### Соглашения об именовании
- Функции используют camelCase: `loadLineupFromOrder()`
- Константы используют UPPER_CASE: `FIELD_LAYOUT`
- Приватные функции начинаются с подчеркивания: `_internalFunction()`

### Обработка ошибок
- Все асинхронные функции возвращают Promise
- Ошибки логируются в консоль с префиксами
- Graceful degradation при недоступности данных

### Логирование
- Используются структурированные префиксы: `[LineupLoad]`, `[Shirts]`
- Разные уровни логирования: info, warn, error
- Отладочная информация доступна в development режиме

## Примеры использования

### Загрузка состава
```javascript
const orderDay = getOrderDayFromCurrentPage();
const lineup = await loadLineupFromOrder(orderDay);
if (lineup) {
    applyLoadedLineup(lineup, homePlayers);
}
```

### Работа с футболками
```javascript
const homeShirts = await getTeamShirts(homeTeamId);
const awayShirts = await getTeamShirts(awayTeamId);
displayShirtsOnField(fieldCol, homeShirts, awayShirts, homeFormation, awayFormation);
```

## Интеграция с основными системами

### Chemistry System
API функции интегрированы с системой Chemistry для получения данных игроков с полями `nat_id`, `nat`, `hidden_style`.

### Positioning System  
API поддерживает получение позиций игроков для корректного расчета связей в Chemistry системе.

### Synergy System
API функции используются для загрузки данных сыгранности и интеграции с формами отправки состава.