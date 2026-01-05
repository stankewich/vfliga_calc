# Анализ системы подсказок из sending form

## Обзор

Анализ системы подсказок (tooltips) из sending form для возможного использования в UI калькулятора силы команд.

## Структура системы подсказок

### HTML-структура кнопки
```html
<button class="btn-help" 
        onclick="hintpos($(this), 13, 'Бонус сыгранности', 450, 'right top', 'left bottom'); return false" 
        style="margin:0 2px 0 1px">
</button>
```

### Параметры функции `hintpos()`
```javascript
hintpos(element, hintId, title, width, position, alignment)
```

**Параметры:**
- `element` - jQuery элемент кнопки `$(this)`
- `hintId` - ID подсказки (число, например: 13)
- `title` - Заголовок подсказки (строка, например: 'Бонус сыгранности')
- `width` - Ширина подсказки в пикселях (число, например: 450)
- `position` - Позиция относительно кнопки ('right top', 'left top', 'center bottom')
- `alignment` - Выравнивание подсказки ('left bottom', 'right bottom', 'center top')

### Примеры использования из sending form

#### 1. Формация
```html
<button class="btn-help" 
        onclick="hintpos($(this), 3, 'Формация', 350, 'left top', 'right bottom'); return false">
</button>
```

#### 2. Тактика
```html
<button class="btn-help" 
        onclick="hintpos($(this), 2, 'Тактика', 450, 'right+70 top+3', 'left bottom'); return false">
</button>
```

#### 3. Стиль игры
```html
<button class="btn-help" 
        onclick="hintpos($(this), 4, 'Стиль игры', 450, 'right+70 top+3', 'left bottom'); return false">
</button>
```

#### 4. Бонус сыгранности
```html
<button class="btn-help" 
        onclick="hintpos($(this), 13, 'Бонус сыгранности', 450, 'right top', 'left bottom'); return false">
</button>
```

#### 5. Рейтинг силы состава
```html
<button class="btn-help" 
        onclick="hintpos($(this), 92, 'Рейтинг силы выбранного состава', 450, 'right top', 'left bottom'); return false">
</button>
```

## CSS-классы кнопок

### Основные классы
- `.btn-help` - Стандартная кнопка подсказки
- `.btn-help-red` - Красная кнопка подсказки (для предупреждений)
- `.btn-whelp` - Белая кнопка подсказки

### Стилизация
Кнопки подсказок имеют характерный внешний вид:
- Маленький размер (обычно квадратные)
- Иконка знака вопроса или информации
- Различные цветовые схемы в зависимости от типа

## Зависимости

### JavaScript библиотеки
Система подсказок зависит от:
- **jQuery** - для работы с DOM и событиями
- **jQuery UI** - для позиционирования и анимации
- **Собственная библиотека** - функция `hintpos()` определена в одном из подключаемых файлов

### Подключаемые файлы
```html
<script src="jquery-3.4.1.min.js"></script>
<script src="jquery.ui-vfl.1.2.7.js"></script>
<script src="init-1.3.0.min.js"></script> <!-- Возможно содержит hintpos() -->
```

### CSS файлы
```html
<link rel="stylesheet" href="vsolmain-3.1.4.min.css"> <!-- Содержит стили .btn-help -->
<link rel="stylesheet" href="jquery.ui-vfl.1.2.8.css">
<link rel="stylesheet" href="jquery.theme.ui-vfl.1.2.1.css">
```

## Возможности интеграции в калькулятор

### ✅ Что можно скопировать

#### 1. HTML-структуру кнопок
```html
<button class="vs-help-btn" 
        onclick="showCalculatorHint(this, 'synergy', 'Бонус сыгранности', 400); return false"
        style="margin:0 2px 0 1px">
</button>
```

#### 2. CSS-стили (адаптированные)
```css
.vs-help-btn {
    width: 16px;
    height: 16px;
    border: 1px solid #ccc;
    background: #f8f8f8 url('help-icon.png') center no-repeat;
    cursor: pointer;
    display: inline-block;
    vertical-align: middle;
}

.vs-help-btn:hover {
    background-color: #e8e8e8;
    border-color: #999;
}
```

#### 3. Позиционирование
Можно использовать аналогичную логику позиционирования:
- `'right top'` - справа сверху от кнопки
- `'left bottom'` - слева снизу от кнопки
- `'center bottom'` - по центру снизу

### ❌ Что нельзя скопировать напрямую

#### 1. Функция `hintpos()`
- Не доступна в исходном коде
- Зависит от внутренних библиотек ВСОЛ
- Требует адаптации под наш интерфейс

#### 2. Система ID подсказок
- ID подсказок привязаны к серверной базе данных
- Содержимое подсказок загружается с сервера
- Нужна собственная система контента

#### 3. CSS-стили кнопок
- Используют спрайты и ресурсы ВСОЛ
- Требуют адаптации под наш дизайн

## Рекомендуемая реализация

### 1. Упрощенная система подсказок

```javascript
/**
 * Показывает подсказку для элемента калькулятора
 * @param {HTMLElement} button - Кнопка подсказки
 * @param {string} type - Тип подсказки ('synergy', 'leadership', 'weather')
 * @param {string} title - Заголовок подсказки
 * @param {number} width - Ширина подсказки
 */
function showCalculatorHint(button, type, title, width = 400) {
    // Удаляем существующие подсказки
    removeExistingHints();
    
    // Создаем контейнер подсказки
    const hint = document.createElement('div');
    hint.className = 'vs-calculator-hint';
    hint.style.cssText = `
        position: absolute;
        width: ${width}px;
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        z-index: 10000;
        padding: 12px;
        font-size: 11px;
        line-height: 1.4;
    `;
    
    // Добавляем заголовок
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: bold; margin-bottom: 8px; color: #333;';
    header.textContent = title;
    hint.appendChild(header);
    
    // Добавляем содержимое
    const content = document.createElement('div');
    content.innerHTML = getHintContent(type);
    hint.appendChild(content);
    
    // Добавляем кнопку закрытия
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 4px;
        right: 6px;
        border: none;
        background: none;
        font-size: 16px;
        cursor: pointer;
        color: #999;
    `;
    closeBtn.onclick = () => hint.remove();
    hint.appendChild(closeBtn);
    
    // Позиционируем подсказку
    document.body.appendChild(hint);
    positionHint(hint, button, 'right top');
    
    // Автоматическое закрытие при клике вне подсказки
    setTimeout(() => {
        document.addEventListener('click', function closeOnOutsideClick(e) {
            if (!hint.contains(e.target) && e.target !== button) {
                hint.remove();
                document.removeEventListener('click', closeOnOutsideClick);
            }
        });
    }, 100);
}
```

### 2. Контент подсказок

```javascript
/**
 * Возвращает HTML-контент для подсказки
 * @param {string} type - Тип подсказки
 * @returns {string} HTML-контент
 */
function getHintContent(type) {
    const hints = {
        synergy: `
            <p><strong>Бонус сыгранности</strong> рассчитывается на основе последних 25 матчей команды.</p>
            <p><strong>Правила начисления:</strong></p>
            <ul style="margin: 8px 0; padding-left: 16px;">
                <li>6 игроков из состава: +0.10%</li>
                <li>7 игроков из состава: +0.25%</li>
                <li>8 игроков из состава: +0.50%</li>
                <li>9 игроков из состава: +0.75%</li>
                <li>10 игроков из состава: +1.00%</li>
                <li>11+ игроков из состава: +1.25%</li>
            </ul>
            <p><em>Товарищеские матчи не учитываются.</em></p>
        `,
        
        leadership: `
            <p><strong>Бонусы лидеров</strong> применяются к игрокам соответствующих линий.</p>
            <p><strong>Типы лидерства:</strong></p>
            <ul style="margin: 8px 0; padding-left: 16px;">
                <li><strong>Защита:</strong> влияет на защитников</li>
                <li><strong>Полузащита:</strong> влияет на полузащитников</li>
                <li><strong>Атака:</strong> влияет на нападающих</li>
            </ul>
            <p>Бонус рассчитывается автоматически на основе лидерских качеств игроков в составе.</p>
        `,
        
        weather: `
            <p><strong>Влияние погоды</strong> на силу игроков зависит от их адаптации к климатическим условиям.</p>
            <p><strong>Факторы:</strong></p>
            <ul style="margin: 8px 0; padding-left: 16px;">
                <li>Температура воздуха</li>
                <li>Погодные условия</li>
                <li>Происхождение игрока</li>
                <li>Базовая сила игрока</li>
            </ul>
            <p>Используется интерполяция для точного расчета влияния.</p>
        `,
        
        collision: `
            <p><strong>Коллизии стилей</strong> - взаимодействие между стилями игры команд.</p>
            <p><strong>Примеры коллизий:</strong></p>
            <ul style="margin: 8px 0; padding-left: 16px;">
                <li>Спартаковский vs Британский: +38%</li>
                <li>Бей-беги vs Спартаковский: +42%</li>
                <li>Бразильский vs Бей-беги: +34%</li>
                <li>Тики-така vs Катеначчо: +36%</li>
            </ul>
            <p>Бонус применяется к выигрывающей стороне коллизии.</p>
        `
    };
    
    return hints[type] || '<p>Информация недоступна.</p>';
}
```

### 3. Позиционирование подсказки

```javascript
/**
 * Позиционирует подсказку относительно кнопки
 * @param {HTMLElement} hint - Элемент подсказки
 * @param {HTMLElement} button - Кнопка-триггер
 * @param {string} position - Позиция ('right top', 'left bottom', etc.)
 */
function positionHint(hint, button, position = 'right top') {
    const buttonRect = button.getBoundingClientRect();
    const hintRect = hint.getBoundingClientRect();
    const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
    };
    
    let left, top;
    
    switch (position) {
        case 'right top':
            left = buttonRect.right + 8;
            top = buttonRect.top;
            break;
        case 'left bottom':
            left = buttonRect.left - hintRect.width - 8;
            top = buttonRect.bottom + 8;
            break;
        case 'center bottom':
            left = buttonRect.left + (buttonRect.width - hintRect.width) / 2;
            top = buttonRect.bottom + 8;
            break;
        default:
            left = buttonRect.right + 8;
            top = buttonRect.top;
    }
    
    // Корректируем позицию, чтобы подсказка не выходила за границы экрана
    if (left + hintRect.width > viewport.width) {
        left = buttonRect.left - hintRect.width - 8;
    }
    if (left < 0) {
        left = 8;
    }
    if (top + hintRect.height > viewport.height) {
        top = buttonRect.top - hintRect.height - 8;
    }
    if (top < 0) {
        top = 8;
    }
    
    hint.style.left = left + window.scrollX + 'px';
    hint.style.top = top + window.scrollY + 'px';
}
```

### 4. Интеграция в UI калькулятора

```javascript
/**
 * Добавляет кнопку подсказки к элементу
 * @param {HTMLElement} container - Контейнер для кнопки
 * @param {string} type - Тип подсказки
 * @param {string} title - Заголовок подсказки
 */
function addHelpButton(container, type, title) {
    const helpBtn = document.createElement('button');
    helpBtn.className = 'vs-help-btn';
    helpBtn.title = 'Показать подсказку';
    helpBtn.onclick = (e) => {
        e.preventDefault();
        showCalculatorHint(helpBtn, type, title);
        return false;
    };
    
    // Стили кнопки
    helpBtn.style.cssText = `
        width: 16px;
        height: 16px;
        border: 1px solid #aaa;
        background: #f8f8f8;
        cursor: pointer;
        display: inline-block;
        vertical-align: middle;
        margin: 0 2px 0 4px;
        border-radius: 2px;
        font-size: 10px;
        color: #666;
        text-align: center;
        line-height: 14px;
    `;
    helpBtn.textContent = '?';
    
    // Hover эффект
    helpBtn.onmouseover = () => {
        helpBtn.style.backgroundColor = '#e8e8e8';
        helpBtn.style.borderColor = '#999';
    };
    helpBtn.onmouseout = () => {
        helpBtn.style.backgroundColor = '#f8f8f8';
        helpBtn.style.borderColor = '#aaa';
    };
    
    container.appendChild(helpBtn);
}
```

## Применение в калькуляторе

### Места для добавления подсказок

1. **Бонус сыгранности** - рядом с полем отображения сыгранности
2. **Бонусы лидеров** - рядом с отображением лидерских бонусов  
3. **Влияние погоды** - рядом с настройками погоды
4. **Коллизии стилей** - рядом с выбором стиля игры
5. **Рейтинг силы** - рядом с итоговыми показателями
6. **Формации** - рядом с выбором формации
7. **Физическая форма** - рядом с настройками турнира

### Пример интеграции

```javascript
// В функции создания UI сыгранности
function createSynergyUI() {
    const container = document.createElement('div');
    container.innerHTML = `
        <span>Бонус сыгранности: <strong id="vs_synergy_home">0%</strong></span>
    `;
    
    // Добавляем кнопку подсказки
    addHelpButton(container, 'synergy', 'Бонус сыгранности');
    
    return container;
}
```

## Преимущества решения

### ✅ Функциональность
- **Знакомый интерфейс** - пользователи ВСОЛ привыкли к таким подсказкам
- **Информативность** - подробные объяснения сложных механик
- **Удобство** - не загромождает интерфейс, показывается по требованию
- **Адаптивность** - автоматическое позиционирование в зависимости от места на экране

### ✅ Техническая реализация
- **Независимость** - не требует внешних библиотек ВСОЛ
- **Легковесность** - минимальный код, быстрая работа
- **Расширяемость** - легко добавлять новые типы подсказок
- **Совместимость** - работает во всех современных браузерах

## Ограничения

### ⚠️ Технические
- **Собственная реализация** - нужно написать систему с нуля
- **Контент подсказок** - требует создания и поддержки текстового контента
- **Стилизация** - нужно адаптировать под дизайн калькулятора

### ⚠️ Пользовательские
- **Дополнительные элементы** - увеличивает сложность интерфейса
- **Обучение** - пользователи должны понять назначение кнопок

## Заключение

**Система подсказок из sending form может быть успешно адаптирована для калькулятора.**

**Рекомендуемый подход:**
1. ✅ Скопировать концепцию и структуру кнопок
2. ✅ Создать собственную упрощенную реализацию `showCalculatorHint()`
3. ✅ Адаптировать стили под дизайн калькулятора
4. ✅ Создать контент подсказок для основных функций

**Приоритет реализации: СРЕДНИЙ**
- Полезная функция для новых пользователей
- Улучшает понимание сложных механик
- Не критична для основного функционала
- Можно добавить поэтапно

**Первоочередные подсказки:**
1. Бонус сыгранности
2. Бонусы лидеров  
3. Коллизии стилей
4. Влияние погоды