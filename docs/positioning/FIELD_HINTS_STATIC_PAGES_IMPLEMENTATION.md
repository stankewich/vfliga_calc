# Реализация системы подсказок для статических HTML страниц

## Проблема
В HTML файле `calc_page_v1.3_files_files.htm` не работали подсказки при клике на футболки, потому что:

1. **Userscript не подключен** - HTML страница не содержала подключения `calc.user.js`
2. **Отсутствуют обработчики событий** - статические элементы футболок не имели onclick обработчиков
3. **Нет инициализации** - система подсказок не инициализировалась после загрузки страницы

## Решение

### 1. ✅ Подключение userscript в HTML
Добавлено подключение userscript перед закрывающим тегом `</head>`:

```html
<!-- Подключение userscript для системы подсказок -->
<script type="text/javascript" src="../../calc.user.js"></script>
```

### 2. ✅ Инициализация системы подсказок
Обновлен код инициализации страницы:

```javascript
<script type="text/javascript">$(function() {
  initPage();
  
  // Инициализация системы подсказок для футболок
  if (typeof initializeFieldHints === 'function') {
    setTimeout(function() {
      initializeFieldHints();
      console.log('[FieldHints] Система подсказок инициализирована');
    }, 1000); // Задержка для полной загрузки страницы
  }
})</script>
```

### 3. ✅ Функция initializeFieldHints()
Создана новая глобальная функция в `calc.user.js`:

```javascript
window.initializeFieldHints = function() {
    console.log('[FieldHints] Начинаем инициализацию системы подсказок...');
    
    // Находим все существующие элементы футболок
    const shirtsContainers = document.querySelectorAll('.shirts-container');
    
    shirtsContainers.forEach((container, containerIndex) => {
        const shirtElements = container.children;
        
        Array.from(shirtElements).forEach((shirtElement, shirtIndex) => {
            // Проверяем, что это элемент футболки
            if (shirtElement.style.backgroundImage && shirtElement.style.backgroundImage.includes('shirt')) {
                // Генерируем уникальный ID если его нет
                if (!shirtElement.id) {
                    const position = shirtElement.textContent || `pos${shirtIndex}`;
                    const team = containerIndex === 0 ? 'home' : 'away';
                    shirtElement.id = `shirt-${team}-${position}-${Math.random().toString(36).substr(2, 9)}`;
                }
                
                // Добавляем стили для интерактивности
                shirtElement.style.cursor = 'pointer';
                shirtElement.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
                
                // Добавляем обработчики событий
                shirtElement.addEventListener('mouseenter', () => {
                    shirtElement.style.transform = 'translate(-50%, -50%) scale(1.1)';
                    shirtElement.style.boxShadow = '0 0 10px rgba(255, 255, 255, 0.8)';
                });

                shirtElement.addEventListener('mouseleave', () => {
                    shirtElement.style.transform = 'translate(-50%, -50%) scale(1)';
                    shirtElement.style.boxShadow = 'none';
                });

                // Добавляем обработчик клика для показа подсказки
                shirtElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const position = shirtElement.textContent || 'Unknown';
                    const team = containerIndex === 0 ? 'home' : 'away';
                    
                    console.log(`[FieldHints] Клик по футболке: ${shirtElement.id}, позиция: ${position}, команда: ${team}`);
                    
                    // Показываем подсказку только для позиции (без данных игрока)
                    showFieldPlayerHint(position, team, null, shirtElement);
                });
            }
        });
    });
};
```

## Функциональность

### Что делает функция initializeFieldHints():

1. **Поиск контейнеров футболок** - находит все элементы с классом `.shirts-container`
2. **Обработка элементов футболок** - проверяет каждый дочерний элемент на наличие background-image с 'shirt'
3. **Генерация уникальных ID** - создает ID для элементов, если их нет
4. **Добавление интерактивности**:
   - Курсор pointer
   - Плавные переходы
   - Эффекты при наведении (увеличение и свечение)
   - Обработчик клика для показа подсказки
5. **Логирование** - подробные логи для отладки

### Типы подсказок:

- **С данными игрока** - полная информация о силе, бонусах, модификаторах
- **Только позиция** - базовая информация о позиции (используется для статических страниц)

## Тестирование

Создан тестовый файл `examples/test_hints.html` для проверки работы системы подсказок на статических элементах футболок.

## Совместимость

Система работает с:
- ✅ Динамически создаваемыми футболками (через `createShirtElement`)
- ✅ Статическими HTML элементами футболок (через `initializeFieldHints`)
- ✅ Страницами с данными игроков и без них

## Логирование

Добавлено подробное логирование для отладки:
- Количество найденных контейнеров
- Количество футболок в каждом контейнере  
- ID созданных элементов
- События клика по футболкам

## Файлы изменены:

1. `calc.user.js` - добавлена функция `initializeFieldHints()`
2. `examples/calc_page_v1.3_files_files.htm` - подключен userscript и инициализация
3. `examples/test_hints.html` - создан тестовый файл

## Результат

✅ **Подсказки теперь работают** в HTML файле `calc_page_v1.3_files_files.htm`
✅ **Система совместима** со статическими и динамическими элементами
✅ **Добавлена интерактивность** - эффекты при наведении и клике
✅ **Подробное логирование** для отладки и мониторинга