РЕЗЮМЕ ПРОЕКТА
Essence: Изолированный фоновый процесс (Worker Thread) Session Miner для автоматизированного stealth-извлечения и сохранения токенов авторизации (Cookies, API Key, User-Agent) с платформы Airbnb.
Tech Stack: Node.js (pure ESM), worker_threads, playwright-extra, puppeteer-extra-plugin-stealth, PrismaClient, pino.
Architecture: Изолированный скрипт с поддержкой Graceful Shutdown (таймаут 30 сек, обработка сигнала от родителя), stealth-парсинг через перехват трафика, форматирование данных и их персистентность в БД через операцию upsert.

ПЛАН РАЗРАБОТКИ:
[ ] Шаг 1: Определение модели данных базы (Prisma Schema)

Тип: Изолированный компонент.

Требования: Создать схему для таблицы Session. Включить поля: id (String, Primary Key), cookies (Text/String), apiKey (String), userAgent (String), updatedAt (DateTime).

Включенные компоненты: Prisma Schema file (schema.prisma).

[ ] Шаг 2: [Smoke Test - Генерация схемы БД]

Критерий успеха: Команда npx prisma generate выполняется без ошибок, схема валидна.

Действие: Если работает — переход к следующему шагу без рефакторинга.

[ ] Шаг 3: Инициализация Worker'а, Логгера и Graceful Shutdown

Тип: Связанная группа.

Требования: Настроить точку входа worker_threads. Инициализировать логгер pino (строго логировать только статус, без вывода полных токенов в STDOUT). Создать инстанс PrismaClient. Реализовать механизм таймаута (30 секунд на весь процесс). Настроить слушатель parentPort.on('message') для обработки команды cancel. Создать глобальный блок try/finally для гарантированного вызова prisma.$disconnect() и process.exit(0).

Включенные компоненты: Worker Entrypoint, Logger Instance, Prisma Instance, Lifecycle & Timeout Handlers.

[ ] Шаг 4: [Smoke Test - Каркас Воркера]

Критерий успеха: При запуске скрипт успешно логирует старт, а при отправке сообщения cancel немедленно вызывает блок finally и завершает процесс (exit 0) без утечек памяти.

Действие: Если работает — переход к следующему шагу без рефакторинга.

[ ] Шаг 5: Браузерная Автоматизация и Экстракция Данных (Core)

Тип: Связанная группа.

Требования: Внутри try блока инициализировать playwright-extra с подключенным puppeteer-extra-plugin-stealth. Запустить Chromium в режиме headless: true (предусмотреть объект proxy в конфигурации запуска). Настроить слушатель page.on('request') для поиска и захвата заголовка x-airbnb-api-key. Осуществить навигацию (page.goto) на целевой URL (Listing ID: 858637964586872469) с ожиданием события networkidle. Извлечь User-Agent (через контекст или evaluation) и массив кук через context.cookies(). Гарантировать вызов browser.close() в существующем блоке finally.

Включенные компоненты: Stealth Browser Configurator, Request Interceptor, Page Navigator, Context Extractor.

[ ] Шаг 6: [Smoke Test - Stealth Захват]

Критерий успеха: Скрипт загружает страницу Airbnb, не блокируется WAF, успешно извлекает x-airbnb-api-key, User-Agent и массив кук. В логах отображается успешный захват (с маскировкой значений). Браузер корректно закрывается.

Действие: Если работает — переход к следующему шагу без рефакторинга.

[ ] Шаг 7: Трансформация Токенов и Запись в Базу Данных

Тип: Связанная группа.

Требования: Написать утилитарную логику склеивания полученного массива кук в единую HTTP-строку формата name1=value1; name2=value2. Вызвать метод prisma.session.upsert(). Использовать хардкод id === 'airbnb_main'. Обновить поля cookies, apiKey, userAgent и таймстемп. Обработать возможные ошибки записи.

Включенные компоненты: Data Formatter / Serializer, Prisma Upsert Executor.

[ ] Шаг 8: [Smoke Test - End-to-End Execution]

Критерий успеха: При вызове воркера процесс поднимает браузер, парсит Airbnb, форматирует куки и успешно записывает/обновляет строку airbnb_main в базе данных. Процесс автоматически завершается без зависаний, ресурсы (браузер и БД) корректно освобождаются.

Действие: Если работает — переход к следующему шагу без рефакторинга.
