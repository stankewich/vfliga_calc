# Анализ API формы отправки заявки

## Дата: 2026-02-08
## Ветка: feature/order-sending

## Endpoint

```
POST https://www.virtualsoccer.ru/ajax/get_user_orders.php
```

## Авторизация

### Механизм: Session-based через Cookie

Из curl запроса видно, что авторизация работает через **cookies**. Сервер проверяет наличие и валидность сессионных cookies при каждом запросе.

```
Cookie: virtualsoccer_main=c6510av5uhmoe0p1prfe5v0703; 
        phpbb3_vsol_u=166825; 
        phpbb3_vsol_k=; 
        phpbb3_vsol_sid=8d5008851e84ceb8c97263d04967277e; 
        VSOL=6625940;
```

### Ключевые cookies для авторизации:

1. **`virtualsoccer_main`** - основная сессия PHP
   - Значение: `c6510av5uhmoe0p1prfe5v0703`
   - Тип: PHP session ID (PHPSESSID)
   - Назначение: идентификация сессии пользователя на сервере
   - **Критичность: ВЫСОКАЯ** - без этой cookie запрос будет отклонен

2. **`phpbb3_vsol_u`** - ID пользователя phpBB
   - Значение: `166825`
   - Тип: User ID
   - Назначение: идентификация пользователя в системе форума phpBB
   - **Критичность: ВЫСОКАЯ** - используется для проверки прав доступа

3. **`phpbb3_vsol_sid`** - Session ID phpBB
   - Значение: `8d5008851e84ceb8c97263d04967277e`
   - Тип: Session ID
   - Назначение: сессия форума phpBB (дополнительная проверка)
   - **Критичность: СРЕДНЯЯ** - может требоваться для некоторых операций

4. **`VSOL`** - дополнительный идентификатор
   - Значение: `6625940`
   - Тип: возможно User ID или Team ID
   - Назначение: уточнить (вероятно, кэш последней выбранной команды)
   - **Критичность: НИЗКАЯ** - вспомогательная cookie

### Как работает авторизация:

1. **Пользователь логинится** на сайте через форму входа
2. **Сервер создает сессию** и устанавливает cookies в браузере
3. **Браузер автоматически отправляет cookies** при каждом запросе к домену `virtualsoccer.ru`
4. **Сервер проверяет cookies** и определяет авторизованного пользователя
5. **Если cookies валидны** - запрос обрабатывается, иначе - ошибка авторизации

### Важно для userscript:

**Cookies передаются автоматически!** 

Когда userscript работает на странице `virtualsoccer.ru`, браузер **автоматически** включает все cookies домена в запросы. Это означает:

- ✅ **Не нужно** вручную копировать cookies
- ✅ **Не нужно** передавать токены авторизации
- ✅ **Не нужно** реализовывать логин в скрипте
- ✅ Авторизация работает "из коробки" если пользователь залогинен на сайте

**Исключение:** При использовании `GM_xmlhttpRequest` для cross-origin запросов cookies также передаются автоматически (это особенность GM API)

### Другие cookies (аналитика, UI):

- `_ym_uid`, `_ym_d`, `_ym_isad`, `_ym_visorc` - Яндекс.Метрика
- `_ga`, `_ga_3S9LCMTM56`, `_gcl_au` - Google Analytics
- `top100_id`, `t3_sid_801281` - Top100
- `tmr_lvid`, `tmr_lvidTS`, `tmr_detect` - TopMail.ru
- `adtech_uid` - рекламная сеть
- `domain_sid` - доменная сессия
- `chatPosHeight`, `chatPosWidth`, etc. - позиция чата
- `notesPosHeight`, `notesPosWidth`, etc. - позиция заметок
- `chatClosed` - состояние чата

## Параметры запроса

```
team_id=122              // ID команды
sborn=0                  // Сборная? (0 = нет, 1 = да)
template_type=2          // Тип шаблона
template_id=25482        // ID шаблона
order_day=25482          // День заявки
matchtype=3              // Тип матча
step=1                   // Шаг процесса
ch1=1                    // Чекбокс 1
ch2=1                    // Чекбокс 2
ch3=1                    // Чекбокс 3
ch4=1                    // Чекбокс 4
```

## Заголовки запроса

### Обязательные:

```
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
```

### Рекомендуемые:

```
Accept: text/html, */*; q=0.01
Origin: https://www.virtualsoccer.ru
Referer: https://www.virtualsoccer.ru/mng_order.php?order_day=25482
```

## Использование в userscript

### Авторизация в userscript - автоматическая!

В userscript (Tampermonkey/Greasemonkey) **cookies автоматически передаются** браузером при использовании:
- `GM_xmlhttpRequest` - **всегда** передает cookies (даже cross-origin)
- `fetch` - передает cookies если домен совпадает и указан `credentials: 'include'`
- `XMLHttpRequest` - передает cookies если домен совпадает

**Вывод:** Если пользователь авторизован на сайте, userscript автоматически получает доступ к API без дополнительных действий.

### Схема работы авторизации

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Пользователь логинится на virtualsoccer.ru              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Сервер устанавливает cookies в браузере:                │
│    - virtualsoccer_main=c6510av5uhmoe0p1prfe5v0703         │
│    - phpbb3_vsol_u=166825                                   │
│    - phpbb3_vsol_sid=8d5008851e84ceb8c97263d04967277e      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Userscript делает запрос к API                          │
│    fetch('/ajax/get_user_orders.php', {...})               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Браузер АВТОМАТИЧЕСКИ добавляет cookies к запросу       │
│    Cookie: virtualsoccer_main=...; phpbb3_vsol_u=...       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Сервер проверяет cookies и авторизует запрос            │
│    ✅ Cookies валидны → обрабатывает запрос                 │
│    ❌ Cookies невалидны → ошибка авторизации                │
└─────────────────────────────────────────────────────────────┘
```

### Почему curl запрос требует авторизацию?

Когда вы выполняете curl запрос **вне браузера**, cookies не передаются автоматически. Поэтому:

1. **curl без cookies** → сервер видит неавторизованный запрос → ошибка "требует авторизацию"
2. **curl с cookies** (как в вашем примере) → сервер видит авторизованного пользователя → успех
3. **userscript в браузере** → браузер автоматически добавляет cookies → успех (если пользователь залогинен)

### Решение 1: GM_xmlhttpRequest (рекомендуется)

```javascript
GM_xmlhttpRequest({
    method: "POST",
    url: "https://www.virtualsoccer.ru/ajax/get_user_orders.php",
    headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
    },
    data: new URLSearchParams({
        team_id: 122,
        sborn: 0,
        template_type: 2,
        template_id: 25482,
        order_day: 25482,
        matchtype: 3,
        step: 1,
        ch1: 1,
        ch2: 1,
        ch3: 1,
        ch4: 1
    }).toString(),
    onload: function(response) {
        console.log('Response:', response.responseText);
        // Обработка ответа
    },
    onerror: function(error) {
        console.error('Error:', error);
    }
});
```

**Преимущества:**
- ✅ Автоматически передает cookies
- ✅ Работает cross-origin
- ✅ Не блокируется CORS
- ✅ Поддерживается всеми userscript менеджерами

### Решение 2: fetch (если на том же домене)

```javascript
fetch('https://www.virtualsoccer.ru/ajax/get_user_orders.php', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
    },
    body: new URLSearchParams({
        team_id: 122,
        sborn: 0,
        template_type: 2,
        template_id: 25482,
        order_day: 25482,
        matchtype: 3,
        step: 1,
        ch1: 1,
        ch2: 1,
        ch3: 1,
        ch4: 1
    }),
    credentials: 'include' // ВАЖНО: включает cookies
})
.then(response => response.text())
.then(data => {
    console.log('Response:', data);
})
.catch(error => {
    console.error('Error:', error);
});
```

**Преимущества:**
- ✅ Современный API
- ✅ Promise-based
- ✅ Автоматически передает cookies (с `credentials: 'include'`)

**Недостатки:**
- ❌ Может блокироваться CORS
- ❌ Требует `credentials: 'include'`

## Проверка авторизации

### Способ 1: Проверить наличие cookies

```javascript
function isUserAuthorized() {
    // Проверяем наличие ключевых cookies
    const cookies = document.cookie;
    
    const hasMainSession = cookies.includes('virtualsoccer_main=');
    const hasUserId = cookies.includes('phpbb3_vsol_u=');
    const hasSessionId = cookies.includes('phpbb3_vsol_sid=');
    
    return hasMainSession && hasUserId && hasSessionId;
}

if (!isUserAuthorized()) {
    console.error('[SendingForm] User not authorized');
    alert('Необходимо авторизоваться');
    return;
}
```

### Способ 2: Получить User ID из cookie

```javascript
function getUserId() {
    const cookies = document.cookie.split(';');
    
    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'phpbb3_vsol_u') {
            return parseInt(value, 10);
        }
    }
    
    return null;
}

const userId = getUserId();
console.log('User ID:', userId); // 166825
```

### Способ 3: Тестовый запрос

```javascript
async function checkAuthorization() {
    try {
        const response = await fetch('/ajax/get_user_orders.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: 'team_id=0&step=1',
            credentials: 'include'
        });
        
        const text = await response.text();
        
        // Если ответ содержит "требует авторизацию" или подобное
        if (text.includes('auth') || text.includes('login')) {
            return false;
        }
        
        return true;
    } catch (e) {
        console.error('[Auth] Check failed:', e);
        return false;
    }
}
```

## Определение владения командой

### Проблема

Как определить, управляет ли пользователь командой с `team_id=122`?

### Решение 1: Парсинг меню команд

```javascript
function getUserTeamIds() {
    // Ищем ссылки на команды в меню
    const teamLinks = document.querySelectorAll('a[href*="roster.php?num="]');
    
    const teamIds = new Set();
    teamLinks.forEach(link => {
        const url = new URL(link.href, window.location.origin);
        const teamId = url.searchParams.get('num');
        if (teamId) {
            teamIds.add(teamId);
        }
    });
    
    return Array.from(teamIds);
}

function isTeamOwned(teamId) {
    const userTeams = getUserTeamIds();
    return userTeams.includes(String(teamId));
}
```

### Решение 2: Проверка через API

```javascript
async function checkTeamOwnership(teamId) {
    try {
        // Пробуем получить заявки для команды
        const response = await fetch('/ajax/get_user_orders.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: `team_id=${teamId}&step=1`,
            credentials: 'include'
        });
        
        const text = await response.text();
        
        // Если получили данные (не ошибку доступа)
        if (!text.includes('error') && !text.includes('access denied')) {
            return true;
        }
        
        return false;
    } catch (e) {
        console.error('[Ownership] Check failed:', e);
        return false;
    }
}
```

### Решение 3: Кэширование в localStorage

```javascript
function cacheUserTeams(teamIds) {
    localStorage.setItem('vs_user_teams', JSON.stringify(teamIds));
    localStorage.setItem('vs_user_teams_timestamp', Date.now());
}

function getCachedUserTeams() {
    const cached = localStorage.getItem('vs_user_teams');
    const timestamp = localStorage.getItem('vs_user_teams_timestamp');
    
    if (!cached || !timestamp) return null;
    
    // Кэш действителен 1 час
    const age = Date.now() - parseInt(timestamp, 10);
    if (age > 60 * 60 * 1000) {
        return null;
    }
    
    return JSON.parse(cached);
}

function getUserTeamIds() {
    // Сначала проверяем кэш
    const cached = getCachedUserTeams();
    if (cached) return cached;
    
    // Если нет кэша, парсим страницу
    const teamIds = parseTeamIdsFromPage();
    cacheUserTeams(teamIds);
    
    return teamIds;
}
```

## Формат ответа API

### Успешный ответ (предположительно):

```json
{
    "success": true,
    "orders": [
        {
            "player_id": 5490359,
            "position": "GK",
            "slot": 0
        },
        // ... остальные игроки
    ]
}
```

или HTML с данными заявки

### Ошибка авторизации:

```json
{
    "error": "требует авторизацию"
}
```

или HTML с сообщением об ошибке

## Рекомендации для реализации

1. **Использовать GM_xmlhttpRequest** для всех API запросов
2. **НЕ НУЖНО** вручную управлять cookies - браузер делает это автоматически
3. **Проверять авторизацию** перед отправкой запросов (проверить наличие cookies)
4. **Кэшировать список команд** пользователя
5. **Обрабатывать ошибки** авторизации и доступа
6. **Логировать все запросы** для отладки

## Краткий ответ на вопрос "Как работает авторизация?"

**Авторизация работает через session cookies:**

1. Пользователь логинится на сайте
2. Сервер устанавливает cookies (`virtualsoccer_main`, `phpbb3_vsol_u`, `phpbb3_vsol_sid`)
3. Браузер **автоматически** отправляет эти cookies при каждом запросе к `virtualsoccer.ru`
4. Сервер проверяет cookies и определяет авторизованного пользователя

**Для userscript это означает:**
- ✅ Cookies передаются автоматически
- ✅ Не нужно реализовывать логин
- ✅ Не нужно вручную копировать токены
- ✅ Просто делайте запросы - авторизация работает "из коробки"

**Почему curl требует cookies:**
- curl работает вне браузера
- Cookies не передаются автоматически
- Нужно явно указывать `-H 'Cookie: ...'`
- В userscript эта проблема не существует!

## Следующие шаги

1. Изучить формат ответа API (нужен реальный ответ)
2. Определить все необходимые параметры запроса
3. Реализовать функции для работы с API
4. Добавить обработку ошибок
5. Протестировать на реальных данных

## Связанные файлы

- `docs/todo/SENDING_FORM_LINEUP_INTEGRATION.md` - основной план интеграции
- `calc.user.js` - основной файл скрипта
