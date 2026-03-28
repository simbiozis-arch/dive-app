# DIVE PWA — Полный технический и продуктовый аудит

**Дата аудита:** 28 марта 2026
**Версия:** DIVE v2.0
**Аудитор:** Claude Sonnet 4.6
**Объём:** 3 725 строк, 211 198 байт (index.html) + 13 MB аудио (44 файла)

---

# ЧАСТЬ 1: АРХИТЕКТУРА

## 1.1 Стек

### Зависимости (CDN, нет package.json)
Проект не имеет `package.json` — все зависимости подключаются через CDN:

| Зависимость | Версия | Способ подключения |
|---|---|---|
| React | 18 (development build) | `https://unpkg.com/react@18/umd/react.development.js` |
| ReactDOM | 18 (development build) | `https://unpkg.com/react-dom@18/umd/react-dom.development.js` |
| Babel Standalone | latest | `https://unpkg.com/@babel/standalone/babel.min.js` |
| Tailwind CSS | latest (CDN Play) | `https://cdn.tailwindcss.com` |
| DM Sans | 200–600 | Google Fonts |
| JetBrains Mono | 300–400 | Google Fonts |

**Критические наблюдения:**
- Используется **development-сборка React** (не production). Это ~30% overhead по размеру и скорости; в prodaction нужно `react.production.min.js`.
- **Babel Standalone** транспилирует JSX прямо в браузере при каждой загрузке. Это добавляет 1–3 секунды к Time-to-Interactive на слабых устройствах.
- **Tailwind CDN Play** генерирует стили на лету — не оптимизирован, весит ~350 KB.
- Нет **build tool** вообще. Нет Vite, Webpack, esbuild.
- Язык: **JavaScript** (не TypeScript). Строгой типизации нет.
- State management: **useState / useRef** (нет Redux, Zustand, Context API для глобального стейта — всё в одном компоненте App).
- CSS: гибрид **inline styles + Tailwind utility classes + CSS-in-`<style>` блок**.

### Итог
> Стек оправдан для MVP/прототипа, но для production — критические проблемы с производительностью и сопровождаемостью кода.

---

## 1.2 Файловая структура

```
/
├── index.html          (211 KB, 3725 строк) — вся логика приложения
├── manifest.json       (485 B) — PWA манифест
├── .gitignore          (18 B)
├── audio/              (13 MB, 44 файла) — все MP3-аудиофайлы
│   ├── intro_*.mp3     — онбординг голос (7 клипов)
│   ├── box_*.mp3       — Box Breathing (5 клипов)
│   ├── bodyscan_*.mp3  — Body Scan (3 клипа)
│   ├── session_end*.mp3— завершение сессии (2 клипа)
│   ├── diaphragmatic_*.mp3 (2 клипа)
│   ├── segmented_*.mp3 (5 клипов)
│   ├── ujjayi_*.mp3    (3 клипа)
│   ├── recovery_*.mp3  (3 клипа)
│   ├── sigh_*.mp3      (3 клипа)
│   ├── tidal_*.mp3     (3 клипа)
│   ├── vis_*.mp3       (4 клипа — визуализации)
│   ├── dive_intro_ambient.mp3 (986 KB)
│   └── dive_underwater.mp3    (2.2 MB)
├── .vercel/            — Vercel deployment config
│   └── project.json
└── .claude/            — Claude Code workspace config
    └── launch.json
```

**Назначение папок:**
- `audio/` — 44 MP3-файла; хранят весь голос-гид и амбиент; 13 MB суммарно
- Нет `src/`, `components/`, `hooks/` — всё в одном `index.html`

**Dead code (неиспользуемый):**
- `audio/box_intro.mp3`, `audio/diaphragmatic_cue.mp3` и ряд других файлов упомянуты в директории, но **не присутствуют** в `AUDIO_MAP` (константа в коде). Они загружаются браузером только при прямом обращении, иначе занимают место.
- Константа `vis_memory_calm` закомментирована в `AUDIO_MAP` (`// vis_memory_calm removed`), но файл `audio/vis_memory_calm.mp3` всё ещё существует на диске — 409 KB мёртвого груза.
- `WORLDS` содержит только `ocean` — комментарий `// space world removed — ocean only` подтверждает удалённый функционал, но остатки логики для нескольких миров (`world === 'ocean'` везде) — мёртвый код.
- Функция `renderCategory()` и переменная `selectedCat` существуют, но экран `category` недостижим через текущую навигацию (нет перехода `setScreen('category')` нигде в render-логике).

**Entry points:**
- Единственная точка входа: `index.html`, строка 3718–3722: `ReactDOM.createRoot(...).render(<App />)`

---

## 1.3 PWA-конфигурация

### manifest.json — полный разбор
```json
{
  "name": "DIVE — Breathe Like a Freediver",
  "short_name": "DIVE",
  "start_url": "index.html",
  "display": "standalone",
  "background_color": "#051225",
  "theme_color": "#051225",
  "description": "Anti-stress breathing techniques from freedivers",
  "icons": [
    {
      "src": "data:image/svg+xml,...<text y='80' font-size='80'>🫧</text>...",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ]
}
```

**Проблемы манифеста:**
- Иконка — `data:` URI прямо в JSON. Это **нестандартно** и большинство браузеров/ОС её игнорируют при установке PWA.
- Нет `purpose: "any maskable"` — иконка не будет корректно отображаться на Android (обрезается без padding).
- Нет иконок PNG 192×192 и 512×512 — обязательно для Chrome PWA install prompt.
- Нет `screenshots` — Chrome 119+ показывает скриншоты в install dialog.
- Нет `categories`, `shortcuts`, `share_target`.
- `start_url: "index.html"` — должно быть `/` или `./`.
- Нет `orientation: "portrait"`.

### Service Worker
**Service Worker отсутствует полностью.** Нет файла `sw.js` и нет регистрации `navigator.serviceWorker.register(...)` в коде.

**Следствия:**
- Нет кэширования — каждая загрузка = полный сетевой запрос
- Нет офлайн-поддержки
- PWA не проходит Lighthouse `installable` checklist полностью
- 44 аудиофайла грузятся каждый раз заново (нет кэша)

### Оценка Lighthouse PWA (из кода, без запуска)

| Критерий | Статус | Комментарий |
|---|---|---|
| Installable | ⚠️ Частично | Манифест есть, HTTPS нужен, нет SW |
| Offline capable | ❌ Нет | Service Worker отсутствует |
| HTTPS ready | ✅ (Vercel) | Vercel добавит HTTPS автоматически |
| Responsive | ✅ Да | `max-scale=1`, `dvh`, safe-area-inset |
| Splash screen | ⚠️ Частично | `background_color` есть, иконка нерабочая |
| theme-color | ✅ Да | `<meta name="theme-color" content="#070c15">` |
| Apple PWA meta | ✅ Да | `apple-mobile-web-app-capable`, status-bar-style |

### Размер бандла (оценка)
| Ресурс | Размер |
|---|---|
| index.html | 211 KB |
| react.development.js | ~1.1 MB |
| react-dom.development.js | ~3.7 MB |
| babel.min.js | ~1.2 MB |
| tailwind CDN | ~350 KB |
| Google Fonts | ~80 KB |
| **Итого JS/CSS при загрузке** | **~6.6 MB** |
| Аудио (ленивая загрузка) | 13 MB |

> Это критически много для мобильного приложения. Для сравнения, production-сборка React + React DOM = ~150 KB gzipped.

---

# ЧАСТЬ 2: КОНТЕНТ И ДАННЫЕ

## 2.1 Дыхательные упражнения

### Техники (7 штук)
Хранятся в константе `TECHNIQUES` (строки 382–390):

| Ключ | Название | Фазы | Паттерн (сек) | Множитель сложности |
|---|---|---|---|---|
| `tidal` | Tidal | inhale / exhale / pause | 4–6–2 | 1.0 |
| `diaphragmatic` | Diaphragmatic | inhale / exhale | 5–10 | 1.2 |
| `box` | Box Breathing | inhale / holdIn / exhale / holdOut | 4–4–4–4 | 1.5 |
| `segmented` | Segmented | belly / ribs / chest / exhale | 3–3–3–8 | 1.5 |
| `ujjayi` | Ocean Breath | inhale / exhale | 5–8 | 2.0 |
| `recovery` | Recovery | inhale / holdIn / exhale | 3–1–2 | 1.0 |
| `physiological_sigh` | Physiological Sigh | inhale1 / inhale2 / exhale | 2–1–7 | 1.8 |

### Сценарии (20 штук)
Хранятся в константе `SCENARIOS` (строки 393–414):

| Ключ | Категория | Free | Длительности |
|---|---|---|---|
| `meeting` | focus | ✅ | 5, 10 min |
| `presentation` | focus | ❌ | 5 min |
| `call` | focus | ❌ | 3 min |
| `cant_focus` | focus | ❌ | 5 min |
| `decision` | focus | ❌ | 5 min |
| `hard_day` | stress | ✅ | 3, 5, 10 min |
| `conflict` | stress | ❌ | 5 min |
| `traffic` | stress | ❌ | 5 min |
| `deadline` | stress | ❌ | 3 min |
| `overload` | stress | ❌ | 5 min |
| `morning` | energy | ✅ | 3, 5 min |
| `afternoon` | energy | ❌ | 3 min |
| `pre_workout` | energy | ❌ | 5 min |
| `quick_reset` | energy | ❌ | 3 min |
| `post_workout` | recovery | ❌ | 5 min |
| `insomnia` | recovery | ✅ | 5, 10 min |
| `anxious_wake` | recovery | ❌ | 5 min |
| `between` | recovery | ❌ | 3 min |
| `just_relax` | deep | ✅ | 5, 10 min |
| `deep_dive` | deep | ❌ | 10 min |

**Бесплатных сценариев:** 5 из 20 (25%). Все 10-минутные версии — premium.

### Хранение данных упражнений
- Техники и сценарии: **hardcoded JS-константы** в index.html
- Контент сессий: функция `getSessionContent(t, world)` возвращает объект с массивами сегментов — тоже hardcoded
- **Добавить новое упражнение без изменения кода невозможно** — нет CMS, JSON-конфига или API

### Дополнительный контент
- Программы: 3 программы × 5–7 дней (тоже hardcoded в `PROGRAMS`)
- Stress SOS: 3 экспресс-сессии (90s, 3min, 5min)
- Первая сессия: отдельный флоу `FIRST_SESSION`

---

## 2.2 Аудио

### Полный список файлов

| Файл | Размер | Назначение |
|---|---|---|
| `dive_intro_ambient.mp3` | 986 KB | Фоновый амбиент онбординга |
| `dive_underwater.mp3` | 2.2 MB | Звук погружения (breath hold test) |
| `intro_01_welcome.mp3` | 94 KB | Голос: приветствие |
| `intro_02_freediver.mp3` | 119 KB | Голос: про фридайверов |
| `intro_03_follow.mp3` | 180 KB | Голос: следуй за дыханием |
| `intro_04_good.mp3` | 70 KB | Голос: "хорошо" |
| `intro_05_onemore.mp3` | 128 KB | Голос: ещё один раз |
| `intro_06_calming.mp3` | 77 KB | Голос: успокаивающее |
| `intro_07_ready.mp3` | 94 KB | Голос: ты готов |
| `intro_sit.mp3` | 172 KB | Голос: сядьте удобно |
| `intro_hands.mp3` | 166 KB | Голос: положи руки |
| `bodyscan_short.mp3` | 405 KB | Боди-скан короткий |
| `bodyscan_full.mp3` | 882 KB | Боди-скан полный |
| `bodyscan_sleep.mp3` | 1.0 MB | Боди-скан для сна |
| `session_end.mp3` | 80 KB | Конец сессии |
| `session_end_sleep.mp3` | 144 KB | Конец сессии (сон) |
| `box_intro.mp3` | 259 KB | Голос: box breathing intro |
| `box_cue_inhale.mp3` | 257 KB | Голос: вдох |
| `box_cue_hold.mp3` | 213 KB | Голос: задержка |
| `box_cue_exhale.mp3` | 236 KB | Голос: выдох |
| `box_cue_pause.mp3` | 266 KB | Голос: пауза |
| `diaphragmatic_cue.mp3` | 295 KB | Голос: диафрагма cue |
| `diaphragmatic_exhale.mp3` | 322 KB | Голос: диафрагма выдох |
| `segmented_intro.mp3` | 348 KB | Голос: сегментированное |
| `segmented_belly.mp3` | 72 KB | Голос: живот |
| `segmented_ribs.mp3` | 72 KB | Голос: рёбра |
| `segmented_chest.mp3` | 70 KB | Голос: грудь |
| `segmented_exhale.mp3` | 185 KB | Голос: выдох |
| `ujjayi_intro.mp3` | 257 KB | Голос: ujjayi intro |
| `ujjayi_cue.mp3` | 249 KB | Голос: ujjayi cue |
| `ujjayi_exhale.mp3` | 194 KB | Голос: ujjayi выдох |
| `recovery_intro.mp3` | 104 KB | Голос: recovery intro |
| `recovery_cue.mp3` | 202 KB | Голос: recovery cue |
| `recovery_exhale.mp3` | 122 KB | Голос: recovery выдох |
| `sigh_intro.mp3` | 206 KB | Голос: sigh intro |
| `sigh_cue.mp3` | 193 KB | Голос: sigh cue |
| `sigh_exhale.mp3` | 230 KB | Голос: sigh выдох |
| `tidal_intro.mp3` | 146 KB | Голос: tidal intro |
| `tidal_cue.mp3` | 237 KB | Голос: tidal cue |
| `tidal_exhale.mp3` | 162 KB | Голос: tidal выдох |
| `vis_ocean_calm.mp3` | 360 KB | Голос: визуализация океан |
| `vis_ocean_focus.mp3` | 339 KB | Голос: визуализация фокус |
| `vis_space_calm.mp3` | 453 KB | Голос: визуализация космос (мёртвый файл) |
| `vis_memory_calm.mp3` | 409 KB | Голос: визуализация память (мёртвый файл) |

**Мёртвые аудиофайлы (не используются в AUDIO_MAP):**
- `vis_space_calm.mp3` (453 KB) — космический мир удалён
- `vis_memory_calm.mp3` (409 KB) — закомментирован в AUDIO_MAP
- `box_cue_inhale/hold/exhale/pause.mp3` — не используются (комментарий: `NO breathing phase cues`)
- `diaphragmatic_cue.mp3`, `diaphragmatic_exhale.mp3` — не в AUDIO_MAP
- `intro_06_calming.mp3`, `intro_07_ready.mp3` — не в `INTRO_EVENTS` онбординга
- `box_intro.mp3`, `segmented_intro.mp3`, `ujjayi_intro.mp3`, `recovery_intro.mp3`, `sigh_intro.mp3`, `tidal_intro.mp3` — не в AUDIO_MAP

Итого: **~3–4 MB мёртвых аудиофайлов** (~30% от общего аудио).

### Загрузка аудио
- **Нет предзагрузки (no preload)**. Все файлы загружаются `new Audio(src)` в момент необходимости — lazy, по событию.
- Отсутствует кэширование (нет SW) → каждое новое открытие = повторная загрузка.
- `vis_ocean_focus.mp3` существует в директории, но **не используется** ни в одном сценарии (AUDIO_MAP использует только `vis_ocean_calm`).

### Audio API
- **Амбиент:** Web Audio API (`AudioContext`, `OscillatorNode`, `BiquadFilterNode`, `BufferSourceNode`) — синтезированный звук (не файл)
- **Голос:** HTML5 Audio (`new Audio(src)`) — простой, без управления буферизацией
- **Нет AudioSession API** (только iOS Safari) — фоновое воспроизведение не гарантировано
- Нет `visibilitychange` обработчика → при сворачивании приложения аудио может прерваться или остановиться браузером
- Функция `audioDebug()` вызывается при каждом запуске (строка 2564) — HEAD-запросы к 7 файлам при каждой загрузке; это лишний сетевой трафик в production

---

## 2.3 Визуальные ассеты

### Иконки
- **Все иконки — инлайн SVG**, генерируемые функцией `I(paths, size)` (строка 313)
- Константа `ICONS` содержит ~35 иконок — paths для stroke SVG
- Стиль: линейные (stroke-based), strokeWidth=1.5, единый дизайн-язык ✅
- Нет внешних иконочных шрифтов

### Изображения
- **Изображений нет** — ни PNG, ни WebP, ни JPEG
- Нет оптимизации изображений (нечего оптимизировать)

### Анимации
Все анимации — CSS keyframes + JavaScript-driven:

**CSS-анимации (в `<style>`):**
| Имя | Назначение |
|---|---|
| `fade-in` | Появление экранов |
| `deblur` | Расфокусировка-фокусировка текста |
| `rays-appear` | Лучи на экране завершения |
| `count-up` | Счётчики на экране завершения |
| `drift` | Восходящие пузырьки (Y) |
| `drift-h` | Горизонтальный дрейф |
| `twinkle` | Мерцание звёзд (осталось от space world) |
| `bokeh-drift` | Боке-дрейф |
| `caustic-drift` | Каустика (анимация X) |
| `causticsWave` | Каустика (background-position) |
| `tentacle-sway` | Покачивание (осталось от удалённого UI) |
| `light-emerge` | Появление светового круга |
| `text-emerge` | Появление текста |
| `bg-emerge` | Смена фона при онбординге |
| `hold-counter-pulse` | Пульсация таймера задержки |
| `tap-pulse` | Пульсация подсказки |
| `bubbleRise` | Пузырьки в сессии |
| `slowRotate` | Медленное вращение |
| `surfaceUp` | Анимация всплытия |
| `surfaceBgLighten` | Осветление фона при всплытии |

**JS-анимации:**
- Дыхательный пузырь: `requestAnimationFrame` loop в `SessionEngine._tick()` + `FirstBreathScreen` — прямая манипуляция DOM через refs (60fps без React ре-рендера)
- Cosine easing: `0.5 - 0.5 * Math.cos(t * Math.PI)` — плавный старт/стоп
- `AnimatedNumber` компонент: RAF-анимация чисел с cubic easing

---

## 2.4 Локализация

**Формальная i18n система:** Существует — константа `LANG` с объектом `en` (~200+ ключей). Функция `t = LANG.en` используется везде.

**Реальное состояние:**
- `currentLang` жёстко задан: `const currentLang = 'en'` (строка 2513). **Переключение языка невозможно.**
- В `LANG` есть только `en` блок — нет `ru`, нет других языков
- В UI есть строки `t.chooseLanguage` и поле `language` в настройках — UI-артефакты без функциональности
- Примерно 15–20% строк — hardcoded прямо в JSX (не через ключи `t`), например: `"Breathe now"`, `"Video from coach — coming soon"`, `"Hold & Start"`, `"tap anywhere to surface"`, `"Good. Keep going."`, `"PREPARE · BREATHE · DIVE"`

---

# ЧАСТЬ 3: ЛОГИКА ПРИЛОЖЕНИЯ

## 3.1 User Flow

### Полная карта переходов

```
[Первый запуск]
     ↓
[first_breath screen]
     ↓ text_sequence (8 карточек, ~18 сек)
     ↓ cinematic (дыхательный пузырь + голос, ~50 сек) [можно tap to skip]
     ↓ feeling screen (как вы себя чувствуете? 6 вариантов)
     ↓ holdTest screen (intro → holding → result)
     ↓ goal screen (что вас привело? 4 варианта)
     ↓ [onboarded = true]
     ↓
[home screen] ← ← ← ← ← ← ← ← ←
     │                              ↑
     ├─ [Daily Recommendation] → [Session Player] → [Surfacing] → [Completion]
     ├─ [Breathe Now] → [Session Player] (без pre-mood)
     ├─ [Stress SOS] → mood → choice → [Session Player]
     ├─ [Program Card] → [program_view screen]
     │       └─ [Day N] → [Session Player]
     ├─ [Quick Dive scenario] → (paywall check) → [Session Player]
     └─ Tab: Profile → [profile screen]
                └─ [Replay intro] → [first_breath screen]

[Session Player] внутри:
  text → breathing → bodyscan/visualization → text → ...
  + pause overlay + exit confirm overlay

[Completion] шаги:
  stats → (mood post) → (safety check если интенсивная) → (reminder) → done
```

### Onboarding
Онбординг (`first_breath`) — полноценный кинематографический флоу:
1. Текстовая последовательность (8 карточек на чёрном фоне)
2. Кинематографическая дыхательная сессия с голосом
3. Вопрос "Как вы себя чувствуете?"
4. Тест задержки дыхания (breath hold test) — определяет "starting depth"
5. Вопрос "Что вас привело?" (цель пользователя)

### Paywall
- Существует. Показывается при попытке открыть premium-сценарий/программу.
- Блокирует: 15 из 20 сценариев, 10-минутные версии, все программы (кроме Day 1 first_dive).
- Pricing: $9.99/mo или $49.99/yr (Save 58%). 7-day free trial.
- **КРИТИЧНО:** кнопка "Unlock for demo" (`demoUnlock`) прямо в PaywallModal устанавливает `isPremium: true`. Это задумано как демо, но **фактически любой пользователь может разблокировать всё бесплатно одним тапом**. Нет реальной платёжной интеграции (Stripe, RevenueCat и т.д.).

---

## 3.2 State Management

### Глобальный стейт (все в компоненте App через `useState`)

| Стейт | Тип | Назначение |
|---|---|---|
| `stats` | Object | Весь персистентный стейт пользователя |
| `screen` | String | Текущий экран (`'home'`, `'first_breath'`, `'category'`, `'program_view'`) |
| `tab` | String | Активная вкладка (`'home'`, `'profile'`) |
| `activeSession` | Object/null | Данные активной сессии |
| `showPaywall` | Boolean | Видимость пейволла |
| `showCompletion` | Boolean | Экран завершения |
| `completionData` | Object/null | Данные завершённой сессии |
| `completionStep` | String | Шаг экрана завершения |
| `showSurfaceBreath` | Boolean | Оверлей сохранения streak |
| `showRetestPrompt` | Boolean | Запрос повторного breath test |
| `showStressChoice` | Boolean | Stress SOS оверлей |
| `showWeekly` | Boolean | Еженедельный итог |
| `currentMood` | `{pre, post}` | Настроение до/после сессии |
| И ещё ~10 вспомогательных | — | — |

### Персистентное хранилище (localStorage)

**Единственный ключ:** `dive_app_data` (строка 937)

Весь объект `stats` сериализуется в JSON и сохраняется при каждом изменении через `useEffect(() => { saveData(stats); }, [stats])`.

**Поля объекта stats:**

| Поле | Тип | Описание |
|---|---|---|
| `totalSessions` | Number | Всего сессий |
| `streak` | Number | Текущий стрик (дней) |
| `longestStreak` | Number | Рекордный стрик |
| `lastSessionDate` | String (ISO date) | Дата последней сессии |
| `totalDepth` | Number | Суммарная "глубина" (метры) |
| `totalMinutes` | Number | Суммарно минут практики |
| `techniquesUsed` | Array\<String\> | Использованные техники |
| `categoriesUsed` | Array\<String\> | Использованные категории |
| `nightSessions` | Number | Ночных сессий |
| `morningSessions` | Number | Утренних сессий |
| `programsCompleted` | Number | Завершённых программ |
| `history` | Array (max 100) | История сессий (scenario, duration, date, preMood, postMood) |
| `world` | String | Выбранный мир (всегда `'ocean'`) |
| `onboarded` | Boolean | Завершён ли онбординг |
| `isPremium` | Boolean | Статус подписки |
| `programProgress` | Object | Прогресс по программам |
| `soundEnabled` | Boolean | Амбиент вкл/выкл |
| `vibrateEnabled` | Boolean | Вибрация вкл/выкл |
| `voiceEnabled` | Boolean | Голос вкл/выкл |
| `hapticEnabled` | Boolean | Хаптика вкл/выкл |
| `firstFeeling` | String/null | Первое ощущение (онбординг) |
| `lastFeeling` | Number/null | Последнее настроение (1–5) |
| `reminderTime` | String/null | `'morning'` / `'evening'` / null |
| `lastWeeklySummary` | String (ISO) | Дата последнего weekly |
| `userGoal` | String/null | Цель пользователя |
| `initialHoldTime` | Number/null | Результат первого breath test |
| `initialDepth` | Number/null | Глубина из breath test |
| `shownInsightIds` | Array\<String\> | Показанные научные факты |
| `techniqueStats` | Object | Счётчик использования техник |
| `breathTests` | Array | История breath tests |
| `safetyFlag` | Object/null | Флаг головокружения |
| `introSeen` | Boolean | Видел ли пользователь intro |
| `depthExplained` | Boolean | Видел ли tooltip про глубину |

**IndexedDB:** Не используется.

**Нет шифрования данных.** Всё в открытом виде.

---

## 3.3 Геймификация

### Streaks
- ✅ Реализованы. Логика: если `lastSessionDate` вчера → streak+1, иначе streak=1.
- **Streak rescue:** Если пропущено 2+ дня — показывается оверлей "Surface Breath" для 1-минутной сессии-спасения стрика.
- `longestStreak` отслеживается.

### Progress / Depth
- **"Глубина"** — геймификационная метрика. Рассчитывается через `sessionDepth()`: duration в минутах × multiplier техники. Показывает прогресс-бар до следующего "milestone" (5m → 10m → 15m → 25m → 40m → 60m → 100m).
- История сессий хранится (max 100 записей).
- Еженедельный итог (weekly summary) — показывается если прошло 7+ дней и есть 2+ сессии за неделю.

### Achievements / Badges
- ✅ Реализованы. 12 бейджей:
  - `First Dive` (1 сессия), `Weekly Flow` (7-day streak), `Deep Habit` (30-day streak)
  - `Technique Master` (все 7 техник), `Explorer` (все 5 категорий)
  - `Deep Explorer` (50m total), `Record Depth` (130m total)
  - `Night Owl` (5 ночных), `Early Riser` (5 утренних)
  - `Course Graduate` (1 программа), `Dedicated` (10 сессий), `Freediver` (50 сессий)
- **Проблема:** бейджи отображаются только на экране профиля, нет push-уведомления при получении бейджа, нет анимации разблокировки.

### Техники Mastery
- Отслеживается счётчик использования каждой техники (`techniqueStats`)
- 3 уровня: Learning (1–5), Comfortable (6–15), Mastered (16+)

### Научные инсайты
- 60 уникальных фактов (20 наука, 15 фридайвинг, 15 прогресс, 10 здоровье)
- Показываются на экране завершения, не повторяются (`shownInsightIds`)

---

## 3.4 Аналитика

**Аналитика: полностью отсутствует.**

- Нет Google Analytics, Amplitude, Mixpanel, PostHog
- Нет Firebase Analytics
- Единственное "событие" — `audioDebug()` при запуске (console.log, не отправляется никуда)
- Данные о настроении, стриках, использованных техниках хранятся **только локально**

**Последствия для продукта:**
- Невозможно знать: сколько пользователей дошли до конца онбординга
- Невозможно знать: какие сценарии самые популярные
- Невозможно знать: где пользователи уходят (churn point)
- Невозможно измерить конверсию в premium
- Невозможно A/B тестировать

---

# ЧАСТЬ 4: КАЧЕСТВО КОДА

## 4.1 Паттерны

### Дублирование кода
Значительное:

1. **`renderQuickDive()` vs Quick Dives в `renderHome()`** — идентичный список сценариев по категориям с фильтрацией. Полное дублирование UI и логики (~60 строк).
2. **Paywall rendering** — `PaywallModal` определён как функция внутри `App()` (строка 2950), не как компонент. Нарушает React patterns, каждый ре-рендер App пересоздаёт функцию.
3. **Программы**: одинаковый маппинг `key → nameKey` повторяется в `renderHome`, `renderPrograms`, `renderProgramView` — 3 раза.
4. **Bubble timer logic** — похожая логика таймера в `SessionPlayer` (через `bubbleTimerRef`) и `FirstBreathScreen` (через `cinematicTimerRef`).
5. **Аудио fade-in** — паттерн `setInterval` для фейда громкости написан вручную 4–5 раз в разных местах вместо общей функции.

### Декомпозиция компонентов
Слабая. Всё приложение — фактически два компонента:
- `App` (~1000 строк) — God Component с 20+ состояниями
- `SessionPlayer` (~400 строк) — достаточно хорошо изолирован
- `FirstBreathScreen` (~460 строк) — самодостаточный, но большой
- `OceanParticles`, `OceanBubble`, `SessionText`, `MoodScale`, `AnimatedNumber` — хорошие атомарные компоненты

### Error handling
- `SessionEngine._tick()`: нет try/catch — необработанные исключения прервут RAF-цикл
- `audioDebug()`: корректные try/catch
- `VoicePlayer.play()`: `.play().catch(() => {})` — ошибки заглушены
- `AmbientEngine.init()`: `catch(e) { console.warn(...) }` — деградирует корректно
- **Нет Error Boundary** — если React-компонент выбросит ошибку, всё приложение упадёт (хотя на строке 3718–3722 есть глобальный try/catch при рендере)
- Нет fallback UI для сетевых ошибок (нет SW, нет offline обработки)

### Loading states
- Нет скелетонов
- Нет спиннеров
- Аудио начинает играть "когда готово" без индикации загрузки
- Нет состояния загрузки при первой инициализации

---

## 4.2 Производительность

### Тяжёлые вычисления в render
- `getSessionContent(t, world)` вызывается без мемоизации в нескольких местах (в `launchScenario`, в `renderHome` через `getDailyRecommendation`). Возвращает большой объект — пересоздаётся каждый раз.
- Weekly summary (строки 3658–3713): `techCounts` вычисляется прямо в render при каждом показе — нет `useMemo`.
- `getSessionInsight()` вызывается без мемоизации в `showCompletion` блоке.

### Потенциальные утечки памяти

1. **`controlFadeRef.current = setTimeout(...)` в SessionPlayer** — очищается при изменении зависимостей, но при быстром переключении сегментов может накапливаться.
2. **`holdIntervalRef.current = setInterval(...)` в FirstBreathScreen** — очищается в `useEffect` cleanup ✅
3. **`requestAnimationFrame` в `FirstBreathScreen`** — используется локальная переменная `running` для остановки. При повторном рендере (например, React StrictMode) может запустить двойной RAF. В production-сборке без StrictMode — ОК.
4. **`voiceClipsRef.current`** — массив Audio объектов, очищается в cleanup ✅
5. **`AmbientEngine`** создаётся единожды через `useRef(new AmbientEngine())` — не утечёт ✅
6. **SessionEngine._rafId** — очищается в `destroy()`, который вызывается в useEffect cleanup ✅

### Большие зависимости
- React development build: ~1.1 MB (должно быть ~45 KB production gzip)
- Babel Standalone: ~1.2 MB (в production не нужен вообще)
- Итого: ~6.6 MB at load time — для мобильного приложения неприемлемо

### Оптимизации, которые есть
- ✅ Direct DOM manipulation для 60fps анимации (wrapperRef, glowTargetRef, etc.) — отлично
- ✅ `useMemo` для `bodyScanSentences` и `bgStyle`
- ✅ `useCallback` для `handleSegmentTransition`
- ✅ `willChange: 'transform'` на дыхательном пузыре
- ✅ Throttled React state update для diveProgress (`> 0.005` delta)
- ❌ `new Audio()` создаётся каждый раз при воспроизведении — нет пула
- ❌ Нет `React.memo` ни на одном компоненте
- ❌ Нет `lazy()` — всё загружается синхронно

---

## 4.3 Accessibility

| Критерий | Статус | Детали |
|---|---|---|
| ARIA labels | ❌ Практически нет | Кнопки без `aria-label`, иконки без описания |
| Keyboard navigation | ❌ Не проверено | Нет focus management, нет skip links |
| Screen reader | ❌ Плохо | Анимации без `aria-live`, числа без `aria-label` |
| Контраст текста | ⚠️ Частично | Основной текст: `rgba(220,225,235,0.92)` — ОК; вспомогательный: `rgba(220,225,235,0.35)` на тёмном — ~2.8:1, **не проходит WCAG AA (4.5:1)** |
| Focus управление | ❌ Нет | При открытии модалей фокус не перемещается |
| `prefers-reduced-motion` | ❌ Не реализовано | Все анимации запускаются независимо от настроек ОС |
| Семантика | ⚠️ Частично | Используются `<button>` где нужно, но `<div>` с onClick там, где должны быть интерактивные элементы |

**Конкретные WCAG AA нарушения:**
- `color:'rgba(220,225,235,0.35)'` на тёмном фоне ~`#070c15` = контраст ~1.9:1 (норма 4.5:1)
- `color:'var(--text-3)'` = `rgba(220,225,235,0.35)` — используется для подзаголовков, плейсхолдеров
- Кнопки 36×36px: рекомендуемый минимум — 44×44px по WCAG 2.5.5

---

## 4.4 Безопасность

### Чувствительные данные в localStorage
- `isPremium: boolean` — статус подписки хранится в localStorage в открытом виде. Пользователь может открыть DevTools и установить `isPremium: true` вручную, или нажать "Unlock for demo" в интерфейсе.
- Нет токена авторизации, нет платёжных данных — с точки зрения безопасности хранилища это приемлемо, но paywall не работает.

### XSS уязвимости
- **`dangerouslySetInnerHTML` не используется** ✅
- **`innerHTML` не используется** ✅
- Все строки вставляются как text content через React или `.textContent` ✅
- `confirm()` используется для подтверждения сброса данных (строка 3487): `confirm(t.resetConfirm)` — это нативный диалог, XSS невозможен ✅

### CSP (Content Security Policy)
- **Нет CSP заголовков** в HTML
- Vercel может настроить CSP через `vercel.json`, но такого файла нет в корне проекта
- Загрузка скриптов с unpkg.com и cdn.tailwindcss.com — без Subresource Integrity (SRI) хэшей
  - Риск: если CDN будет скомпрометирован, пользователи получат вредоносный код
  - Рекомендация: добавить `integrity="sha256-..."` атрибуты

### Прочее
- `eval()` не используется ✅ (Babel Standalone компилирует JSX, но не `eval`)
- Babel Standalone использует `new Function()` внутри — это обходит стандартный CSP `unsafe-eval`; в будущем при настройке CSP потребуется `unsafe-eval` или пре-компиляция

---

# ЧАСТЬ 5: СРАВНИТЕЛЬНАЯ МАТРИЦА

| Feature | Status in DIVE | Implementation | Quality (1–10) | Best Practice | Gap |
|---|---|---|---|---|---|
| **Breathing guide animation** | ✅ Реализовано | CSS cosine easing + direct DOM manipulation (60fps RAF) | **9** | requestAnimationFrame + will-change | Нет haptic sync с визуалом (только фаза) |
| **Breathing patterns library** | ✅ Реализовано | 7 техник hardcoded, 20 сценариев | **7** | JSON/CMS-driven content | Нельзя добавить технику без кода |
| **Audio engine** | ✅ Реализовано | Web Audio API (synthesized ambient) + HTML5 Audio (voice) | **7** | Web Audio API dual-engine | Нет аудио для фаз дыхания; ~30% мёртвых файлов |
| **Background audio** | ❌ Не работает | Нет visibilitychange handler, нет Audio Session | **2** | AudioSession API (iOS), MediaSession API | При сворачивании приложения — тишина |
| **Haptic feedback** | ✅ Реализовано | `navigator.vibrate()` с паттернами под каждую фазу | **8** | Ascending/descending patterns для вдоха/выдоха | iOS Safari не поддерживает Vibration API — работает только Android |
| **Offline mode** | ❌ Нет | Нет Service Worker | **1** | Workbox + cache-first для аудио | Без SW приложение не работает без интернета |
| **PWA installability** | ⚠️ Частично | manifest.json есть; иконка нерабочая, SW нет | **3** | SW + правильные иконки PNG | Нет 192/512 иконок, нет maskable |
| **Push notifications** | ❌ Нет | reminderTime хранится, но нет реальных уведомлений | **1** | Push API + Service Worker | Полностью отсутствует |
| **Onboarding flow** | ✅ Отличный | Кинематографический: текст → дыхание → голос → hold test → цель | **9** | Progressive onboarding с персонализацией | Нет A/B тестирования, нет аналитики конверсии |
| **Streak system** | ✅ Реализовано | Ежедневный streak + streak rescue (Surface Breath) | **8** | — | Нет push-уведомления при риске потери streak |
| **Session history / stats** | ✅ Базово | История (max 100), глубина, минуты, сессии | **6** | — | Нет графиков, нет export, нет trend analysis |
| **Mood tracking** | ✅ Реализовано | Pre/post mood (1–5 scale), delta отображается | **7** | — | Данные не визуализируются в профиле, нет истории mood |
| **Personalization / adaptive** | ⚠️ Частично | Рекомендация по времени суток, skip intro для опытных, safety mode | **6** | ML-based recommendations | Нет адаптации сложности к прогрессу; нет пользовательских паттернов |
| **Wearable integration** | ❌ Нет | — | **1** | Apple Watch / WearOS companion | — |
| **Social / community** | ❌ Нет | — | **1** | Shared achievements, leaderboards | — |
| **Accessibility (a11y)** | ❌ Плохо | Нет ARIA, нет reduced-motion, низкий контраст | **2** | WCAG AA, aria-labels, focus management | Критические нарушения WCAG |
| **Analytics events** | ❌ Нет | Нет трекинга | **1** | Amplitude / PostHog с funnel events | Слепое пятно: нет данных о поведении |
| **Error handling** | ⚠️ Частично | try/catch в аудио; нет Error Boundary | **4** | React Error Boundary + Sentry | Одна ошибка = белый экран |
| **Performance optimization** | ⚠️ Частично | Хорошая оптимизация сессии; плохой initial load | **5** | Vite build + production React | 6.6 MB начальная загрузка |
| **i18n / localization** | ⚠️ Заготовка | LANG.en структура есть; только английский | **3** | i18next + язык из браузера | currentLang hardcoded |
| **Dark/light theme** | ❌ Нет | Только тёмная тема, нет prefers-color-scheme | **2** | CSS variables + media query | — |
| **Settings / preferences** | ✅ Базово | Sound, Vibration, Voice toggles | **5** | — | Нет haptic preference отдельно; нет темпа дыхания; нет экспорта данных |

---

# ЧАСТЬ 6: ПРИОРИТИЗИРОВАННЫЕ РЕКОМЕНДАЦИИ

## P0 — КРИТИЧНО (сломано или отсутствует базовая функциональность)

### P0.1 — Добавить Service Worker и кэширование
**Что:** Реализовать SW с Workbox или написать вручную. Стратегия: Cache-First для аудиофайлов, Network-First для HTML.
**Почему важно:** Без SW приложение требует интернет при каждом запуске; 13 MB аудио загружаются заново; PWA не installable; при плохом соединении сессии обрываются.
**Как:** Создать `sw.js` с кэшированием аудио и HTML, зарегистрировать в `index.html`. Workbox v7 упрощает до 20 строк конфига.
**Оценка:** 8–12 часов

---

### P0.2 — Перейти на production-сборку зависимостей
**Что:** Заменить CDN development React + Babel Standalone на production-сборку или настроить Vite/esbuild.
**Почему важно:** Текущий initial load ~6.6 MB — Babel компилирует JSX при каждом запуске, замедляя TtI на 1–3 секунды; development React на 30% медленнее; на 3G соединении приложение просто не откроется в разумное время.
**Как:** Минимальный вариант: заменить URLs на `react.production.min.js` и `react-dom.production.min.js` с `@babel/standalone` для pre-compilation. Правильный вариант: мигрировать на Vite (1–2 часа настройки).
**Оценка:** 4–16 часов (зависит от подхода: CDN swap = 1 час, Vite migration = 1–2 дня)

---

### P0.3 — Исправить paywall (убрать "Unlock for demo")
**Что:** Убрать или скрыть кнопку `demoUnlock` в `PaywallModal` или подключить реальную платёжную систему.
**Почему важно:** Любой пользователь может разблокировать весь premium-контент одним нажатием без оплаты. Монетизация не работает.
**Как:** Убрать кнопку `demoUnlock` + интегрировать Stripe, RevenueCat или Apple/Google In-App Purchases. Если это MVP — хотя бы убрать кнопку и хранить `isPremium` в серверной сессии, не в localStorage.
**Оценка:** 2 часа (убрать кнопку) / 40–80 часов (полная платёжная интеграция)

---

### P0.4 — Исправить PWA иконки
**Что:** Заменить `data:image/svg+xml` emoji-иконку на реальные PNG файлы 192×192 и 512×512 с maskable.
**Почему важно:** Без правильных иконок Chrome/Safari не показывают prompt "Установить на экран"; пользователи не могут установить приложение как PWA; иконка на домашнем экране не работает.
**Как:** Создать 2 файла PNG: `icon-192.png`, `icon-512.png` (с padding для maskable), обновить `manifest.json`.
**Оценка:** 1–2 часа

---

### P0.5 — Добавить базовую аналитику
**Что:** Интегрировать хотя бы PostHog (open source, GDPR) с ключевыми событиями: onboarding_complete, session_start, session_complete, paywall_shown, paywall_converted, streak_lost.
**Почему важно:** Без аналитики невозможно принимать продуктовые решения: неизвестна конверсия онбординга, churn point, популярность контента, retention. Это blind flying.
**Как:** `<script>` PostHog в head, ~10 событий в ключевых местах кода (endSession, paywall show, onboarding complete).
**Оценка:** 4–6 часов

---

## P1 — ВАЖНО (заметно влияет на retention)

### P1.1 — Фоновое воспроизведение аудио
**Что:** Обработать `document.visibilitychange` и `Page Visibility API`; использовать `MediaSession API` для контролов в шторе уведомлений.
**Почему важно:** Пользователь сворачивает приложение → аудио-гид обрывается → сессия испорчена. Это главный UX-баг для мобильного usage.
**Как:** `document.addEventListener('visibilitychange', () => { if (!document.hidden) ambientRef.current.ctx?.resume() })` + MediaSession API для метаданных.
**Оценка:** 4–6 часов

---

### P1.2 — Push-уведомления для привычки
**Что:** Реализовать настоящие push-уведомления через Push API + SW (пользователь выбирает morning/evening).
**Почему важно:** `reminderTime` хранится, но ни одного уведомления не отправляется. Ключевой retention механизм у конкурентов (Calm, Headspace) — ежедневный push.
**Как:** SW + Push API + бэкенд для отправки (или Vercel Cron + Web Push). Пользователь уже выражает намерение установить reminder — надо исполнить.
**Оценка:** 16–24 часа

---

### P1.3 — Убрать мёртвые аудиофайлы + восстановить голосовое сопровождение фаз
**Что:** Удалить неиспользуемые файлы (~4 MB). Использовать существующие `box_cue_inhale/exhale/hold.mp3`, `segmented_belly/ribs/chest.mp3` и т.д. как cue-звуки для фаз дыхания.
**Почему важно:** Эти файлы существуют, но закомментированы; 30% аудио-ассетов тратятся впустую; голосовые подсказки для каждой фазы — ключевой элемент техники дыхания.
**Как:** Расширить `AUDIO_MAP` фазными ключами (например `box_cue_inhale`), вызывать в `onPhaseChange` callback. Удалить мёртвые файлы.
**Оценка:** 6–8 часов

---

### P1.4 — Добавить визуализацию истории настроений в Profile
**Что:** Отображать график pre/post mood по сессиям. Показывать average mood improvement.
**Почему важно:** Mood tracking собирается (есть pre/post в истории), но нигде не показывается пользователю. Видимый прогресс = ключевой фактор retention. "Ты стал на 1.2 балла спокойнее за 2 недели" — мощный мотиватор.
**Как:** Canvas-based chart или SVG line chart на экране Profile, используя `stats.history` с `preMood`/`postMood`.
**Оценка:** 8–12 часов

---

### P1.5 — Error Boundary + Sentry
**Что:** Добавить React Error Boundary с fallback UI; интегрировать Sentry для мониторинга ошибок в production.
**Почему важно:** Одна необработанная ошибка в React-компоненте = белый экран, потеря данных сессии. Без Sentry — ошибки у пользователей невидимы.
**Как:** `class ErrorBoundary extends React.Component` с fallback (кнопка "restart"), обернуть `<App />`. Sentry SDK через CDN.
**Оценка:** 3–4 часа

---

### P1.6 — Добавить `<noscript>` и graceful degradation
**Что:** Добавить fallback если JS заблокирован или Babel упал при компиляции.
**Почему важно:** Если Babel CDN недоступен — пустой экран без объяснений. Показывать хотя бы "Loading failed, please refresh".
**Как:** `<noscript>` тег + try/catch вокруг Babel compilation (уже есть на строке 3718, но без пользовательского сообщения об ошибке CDN).
**Оценка:** 1–2 часа

---

### P1.7 — Haptic на iOS (WebHaptics API)
**Что:** `navigator.vibrate()` не работает на iOS Safari. Добавить поддержку через WKWebView UIImpactFeedbackGenerator для iOS (если есть native wrapper).
**Почему важно:** Хаптика — ключевой элемент дыхательного гайда (ascending/descending паттерны). На iOS (доминирующая платформа для welness-приложений) она полностью не работает.
**Как:** Если Capacitor/Cordova wrapper — использовать Haptics plugin. Если pure web — добавить audio click-track как альтернативу haptic для iOS.
**Оценка:** 4–8 часов (зависит от наличия native wrapper)

---

## P2 — УЛУЧШЕНИЕ (polish и конкурентные функции)

### P2.1 — Migravate на Vite + TypeScript
**Что:** Вынести код из `index.html` в `src/` структуру, настроить Vite, добавить TypeScript.
**Почему важно:** При любом масштабировании команды или кодовой базы текущая архитектура "всё в одном файле" становится нечитаемой. TypeScript предотвратит класс runtime ошибок.
**Как:** `npm create vite@latest dive --template react-ts`, перенести код в компоненты.
**Оценка:** 16–24 часа

### P2.2 — Добавить `prefers-reduced-motion`
**Что:** CSS media query + отключение анимаций для пользователей с вестибулярными нарушениями.
**Как:** `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; } }`
**Оценка:** 1 час

### P2.3 — ARIA labels и keyboard navigation
**Что:** Добавить `aria-label` ко всем кнопкам без текста; `aria-live` для таймера; `role="dialog"` для модалей; `aria-hidden` для декоративных элементов.
**Оценка:** 6–8 часов

### P2.4 — Добавить SRI хэши для CDN ресурсов
**Что:** `<script integrity="sha256-...">` для React, Babel, Tailwind.
**Оценка:** 1–2 часа

### P2.5 — CMS для контента упражнений
**Что:** Вынести TECHNIQUES, SCENARIOS, PROGRAMS в JSON-файлы или headless CMS (Contentful, Sanity). Это позволит добавлять контент без деплоя.
**Оценка:** 16–24 часа

### P2.6 — Режим "Дыши со мной" (live sharing)
**Что:** Синхронная дыхательная сессия с другим пользователем через WebSocket.
**Оценка:** 40+ часов

### P2.7 — Apple Watch / WearOS companion
**Что:** Хаптика через Apple Watch без телефона; heart rate feedback.
**Оценка:** 80+ часов (требует native разработки)

### P2.8 — Customizable breathing patterns
**Что:** Дать пользователю возможность настраивать длительность фаз (например: box с 5-5-5-5 вместо 4-4-4-4).
**Оценка:** 8–12 часов

### P2.9 — Локализация (русский язык)
**Что:** Добавить `LANG.ru` блок, language detection из `navigator.language`, переключатель в настройках.
**Оценка:** 8–16 часов (перевод + код)

### P2.10 — Экспорт данных
**Что:** Кнопка "Export my data" — JSON или CSV с историей сессий, глубиной, настроениями.
**Как:** `JSON.stringify(stats)` → Blob → download link.
**Оценка:** 2–3 часа

---

# ИТОГОВАЯ ОЦЕНКА

## Сильные стороны
- **Уникальный брендинг** — freediving метафора, глубина как метрика, ocean palette — сильный и последовательный визуальный язык
- **Качество UX при онбординге** — кинематографический флоу с голосом, breath test, персонализация цели — мирового уровня
- **Дыхательный гайд** — прямая DOM-манипуляция на 60fps с cosine easing, haptic patterns, ambient sound synced to breath — технически отлично
- **Контент** — 7 научно-обоснованных техник, 20 сценариев, 60 научных инсайтов — достаточно богато для MVP
- **Геймификация** — streak rescue, depth progression, 12 badges, technique mastery — хорошо продумана

## Слабые стороны (критические)
1. Нет Service Worker → не PWA, не offline, не installable
2. Development-сборка React + Babel в браузере → 6.6 MB, 1–3s лишней загрузки
3. Paywall не работает (demo unlock button доступен всем)
4. Нет аналитики → продуктовая слепота
5. Фоновое аудио не работает на мобильных (нет visibilitychange)
6. ~30% аудио-ассетов мертво (занимают место, не используются)
7. Accessibility: WCAG AA нарушения, нет ARIA

## Оценка готовности к production: 5/10
Приложение в состоянии **работоспособного MVP**. Визуально и UX — на уровне premium app-store продуктов. Технически — требует значительной доработки перед масштабированием.
