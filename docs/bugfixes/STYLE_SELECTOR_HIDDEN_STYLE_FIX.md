# Исправление: Подстановка hidden_style в селектор стилей

## Проблема

Селектор стилей не подставлял автоматически `hidden_style` игрока при его выборе. Все игроки показывали `custom_style: "norm"` вместо их реальных стилей.

## Причина

**Несоответствие типов данных:**
- `hidden_style` в данных игрока: **числовые значения** (0, 1, 2, 3, 4, 5, 6)
- Селектор стилей ожидает: **строковые значения** ('norm', 'sp', 'brazil', 'tiki', 'bb', 'kat', 'brit')

## Код до исправления

```javascript
// НЕПРАВИЛЬНО: числовое значение передается как строка
const playerHiddenStyle = player.hidden_style || 'norm';
const effectiveStyle = cachedStyle || playerHiddenStyle;
```

## Решение

### 1. Добавлено обратное соответствие в CONFIG

```javascript
const CONFIG = {
    STYLES: {
        VALUES: {
            'sp': 1, 'brazil': 3, 'tiki': 4, 'bb': 2, 'kat': 5, 'brit': 6, 'norm': 0
        },
        // ← ДОБАВЛЕНО: Обратное соответствие
        NUMERIC_TO_STRING: {
            0: 'norm',   // Норм
            1: 'sp',     // СП
            2: 'bb',     // ББ
            3: 'brazil', // Бразилия
            4: 'tiki',   // Тики-така
            5: 'kat',    // Катеначчо
            6: 'brit'    // Британский
        }
    }
};
```

### 2. Создана функция преобразования

```javascript
/**
 * Преобразует числовой стиль из hidden_style в строковое значение для селектора
 * @param {number} numericStyle - Числовой стиль (0-6)
 * @returns {string} - Строковое значение стиля
 */
function convertNumericStyleToString(numericStyle) {
    return CONFIG.STYLES.NUMERIC_TO_STRING[numericStyle] || 'norm';
}
```

### 3. Исправлен код установки стиля

```javascript
// ПРАВИЛЬНО: преобразуем числовой стиль в строковый
const playerHiddenStyleNumeric = player.hidden_style;
const playerHiddenStyle = convertNumericStyleToString(playerHiddenStyleNumeric);

console.log(`[STYLE_SELECTOR] Игрок ${player.name}: hidden_style=${playerHiddenStyleNumeric} → ${playerHiddenStyle}`);

const cachedStyle = getPlayerStyleFromCache(v);
const effectiveStyle = cachedStyle || playerHiddenStyle;
```

## Преимущества централизованной конфигурации

✅ **Единый источник истины**: Все соответствия стилей в одном месте  
✅ **Переиспользование**: CONFIG используется во всей системе  
✅ **Консистентность**: Исключены ошибки дублирования  
✅ **Легкость поддержки**: Изменения в одном месте  

## Соответствие стилей

| Числовой (hidden_style) | Строковый (селектор) | Название |
|------------------------|---------------------|----------|
| 0 | 'norm' | Норм |
| 1 | 'sp' | СП |
| 2 | 'bb' | ББ |
| 3 | 'brazil' | Бразилия |
| 4 | 'tiki' | Тики-така |
| 5 | 'kat' | Катеначчо |
| 6 | 'brit' | Британский |

## Ожидаемый результат

После исправления:
1. ✅ При выборе игрока селектор автоматически покажет его реальный стиль
2. ✅ Логи покажут преобразование: `hidden_style=3 → brazil`
3. ✅ Chemistry система будет использовать правильные стили
4. ✅ Пользователи смогут видеть и изменять реальные стили игроков

## Тестирование

### До исправления:
```
[CHEMISTRY] Хакон Эвьен: 12.5% 
Object { 
  original_style: 3,        // Числовое значение
  effective_style: "norm",   // Всегда norm
  custom_style: "norm"       // Всегда norm
}
```

### После исправления (ожидается):
```
[STYLE_SELECTOR] Игрок Хакон Эвьен: hidden_style=3 → brazil

[CHEMISTRY] Хакон Эвьен: 12.5% 
Object { 
  original_style: 3,        // Числовое значение
  effective_style: "brazil", // Правильный стиль!
  custom_style: "brazil"     // Правильный стиль!
}
```

## Файлы изменены

- `calc.user.js`: 
  - Добавлено `CONFIG.STYLES.NUMERIC_TO_STRING`
  - Добавлена функция `convertNumericStyleToString()`
  - Исправлен код установки стиля
- Версия обновлена до **0.939**

---
*Исправление выполнено: February 3, 2026*
*Версия: 0.939*