# Исправление: selectedPlayer не устанавливался в lineup

## Проблема

При анализе логов обнаружено:
- ✅ Игроки БЫЛИ выбраны (есть калькуляция с игроком "Яннис Касиаккис")
- ❌ Но `getValue()` возвращал пустую строку при создании футболок
- ❌ `selectedPlayer` не устанавливался в `slotApi`

### Логи показывают:

```
[FieldHints] Домашняя команда - позиция GK: игрок не выбран (playerId: )
[FieldHints] Создание футболки: ID=shirt-home-GK-..., позиция=GK, команда=home, игрок=null, есть данные=false
```

Но позже:
```
[Calc] Player contribution 
Object { side: "home", name: "Яннис Касиаккис", baseStr: 174, ... }
```

## Причина

В коде `createTeamLineupBlock` объект `slotApi` **не содержал поле `selectedPlayer`**:

```javascript
const slotApi = {
    rowIndex: row,
    posValue: initialPos,
    // selectedPlayer: null,  ← ОТСУТСТВОВАЛО!
    getValue: () => orders.getValue(),
    setValue: (v, label) => { ... },
    ...
};
```

Поэтому при проверке в `displayShirtsOnField`:
```javascript
if (playerId && homeLineup[idx].selectedPlayer) {  // ← selectedPlayer всегда undefined!
    playerName = homeLineup[idx].selectedPlayer.name;
    playerData = { ... };
}
```

Условие **никогда не выполнялось**, даже когда игрок был выбран!

## Решение

### 1. Добавлено поле `selectedPlayer` в `slotApi`

```javascript
const slotApi = {
    rowIndex: row,
    posValue: initialPos,
    selectedPlayer: null,  // ← ДОБАВЛЕНО
    getValue: () => orders.getValue(),
    ...
};
```

### 2. Установка `selectedPlayer` в методе `setValue`

```javascript
setValue: (v, label) => {
    orders.setValue(v, label);
    if (v) {
        const player = players.find(p => String(p.id) === String(v));
        if (player) {
            // Сохраняем данные игрока в slotApi
            slotApi.selectedPlayer = player;  // ← ДОБАВЛЕНО
            
            // ... остальной код ...
        } else {
            // Игрок не найден - очищаем данные
            slotApi.selectedPlayer = null;  // ← ДОБАВЛЕНО
        }
    } else {
        // Игрок не выбран - очищаем данные
        slotApi.selectedPlayer = null;  // ← ДОБАВЛЕНО
    }
},
```

### 3. Установка `selectedPlayer` в обработчике `onChangePlayer`

```javascript
const onChangePlayer = (value) => {
    // ... существующий код ...
    
    const player = players.find(p => String(p.id) === value);
    if (player) {
        // Сохраняем данные игрока в slotApi
        slotApi.selectedPlayer = player;  // ← ДОБАВЛЕНО
        
        // ... остальной код ...
    } else {
        // Игрок не выбран - очищаем данные
        slotApi.selectedPlayer = null;  // ← ДОБАВЛЕНО
    }
};
```

## Результат

Теперь при выборе игрока:

1. **`slotApi.selectedPlayer` устанавливается** с данными игрока
2. **`displayShirtsOnField` получает данные** через `homeLineup[idx].selectedPlayer`
3. **Футболки создаются с `playerData`**:
   ```
   [FieldHints] Домашняя команда - позиция GK: игрок Яннис Касиаккис, данные: {...}
   [FieldHints] Создание футболки: ID=shirt-home-GK-..., позиция=GK, команда=home, игрок=Яннис Касиаккис, есть данные=true
   ```
4. **При клике показывается полная подсказка** с данными игрока

## Тестирование

### Ожидаемое поведение после исправления:

1. **Выберите игрока** в любом селекторе
2. **Проверьте консоль** - должно появиться:
   ```
   [FieldHints] displayShirtsOnField вызвана
   [FieldHints] Домашняя команда - позиция GK: игрок Иван Иванов, данные: Object { player: {...}, matchPosition: "GK", physicalFormId: "normal", playerIndex: 0 }
   [FieldHints] Создание футболки: ID=shirt-home-GK-..., позиция=GK, команда=home, игрок=Иван Иванов, есть данные=true
   ```
3. **Кликните на футболку** выбранного игрока
4. **Должна появиться подсказка** с полной информацией:
   - Имя игрока и возраст
   - Базовая и расчетная сила
   - Модификаторы (форма, усталость, позиция, реальность)
   - Вклад в команду (капитан, синергия, химия и т.д.)

## Файлы изменены

- `calc.user.js` - функция `createTeamLineupBlock`:
  - Добавлено поле `selectedPlayer` в `slotApi`
  - Добавлена установка `selectedPlayer` в методе `setValue`
  - Добавлена установка `selectedPlayer` в обработчике `onChangePlayer`
  - Добавлена очистка `selectedPlayer` когда игрок не выбран

## Связанные документы

- `docs/FIELD_HINTS_PROBLEM_ANALYSIS.md` - первоначальный анализ проблемы
- `docs/FIELD_HINTS_DIAGNOSTICS.md` - диагностика с логированием
- `docs/FIELD_HINTS_TESTING_INSTRUCTIONS.md` - инструкции по тестированию