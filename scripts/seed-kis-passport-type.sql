-- Тестовая форма "Паспорт КИС" — создаёт ObjectType и все FieldDefinition
-- по образцу исходного шаблона (паспорт_КИС.docx: 10 разделов, включая
-- 3 повторяющиеся таблицы — "Состав системы", "Интеграция со смежными
-- системами", "Лицензии и ПО").
--
-- v2: без \gset. Первая версия использовала psql-переменную (\gset) для
-- передачи id созданного object_type в последующие INSERT — при вставке
-- большого многострочного скрипта прямо в интерактивную сессию psql это
-- иногда ломается (терминал не всегда доносит переносы строк так, как
-- ожидает парсер backslash-команд psql). Эта версия использует заранее
-- сгенерированный фиксированный UUID вместо \gset — обычный SQL без
-- backslash-команд, безопасно вставлять как угодно.
--
-- Как запустить (на сервере, там же где раньше правили passport_role_id):
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком в открывшуюся сессию.
--
-- После выполнения тип "Паспорт КИС" появится в /object-types (у Passport
-- Admin) и будет доступен для выбора при создании нового паспорта в
-- /passports/new (у Passport Admin/Manager). Все поля видны всем ролям
-- (visible_to_all = true по умолчанию) — при необходимости видимость
-- отдельных полей можно ограничить потом через конструктор форм в UI.

BEGIN;

INSERT INTO object_types (id, name, code, description)
VALUES (
  'bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9',
  'Паспорт КИС',
  'kis_passport',
  'Тестовая форма, создана по образцу исходного шаблона паспорт_КИС.docx.'
);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required, options, table_columns)
VALUES
-- 1. Общая информация
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'system_name', 'Наименование ИС', 'TEXT', 1, true, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'short_description', 'Краткое описание', 'LONG_TEXT', 2, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'platform_type', 'Тип платформы / Категория', 'TEXT', 3, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'business_owner', 'Владелец (бизнес)', 'TEXT', 4, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'tech_owner', 'Технический владелец (ИТ)', 'TEXT', 5, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'responsible_department', 'Ответственное подразделение', 'TEXT', 6, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'tech_support', 'Техническая поддержка', 'TEXT', 7, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'commissioning_date', 'Дата ввода в эксплуатацию', 'DATE', 8, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'lifecycle_stage', 'Жизненный цикл', 'SELECT', 9, false,
  '["Разработка","Тест","Внедрение","Опытная эксплуатация","Промышленная эксплуатация","Архив"]'::jsonb, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'documentation_link', 'Документация (ссылка на Confluence)', 'LINK', 10, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'sla_availability', 'SLA уровень доступности', 'TEXT', 11, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '1. Общая информация', 'support_hours', 'Время поддержки', 'TEXT', 12, false, NULL, NULL),

-- 2. Архитектура
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '2. Архитектура', 'architecture_type', 'Тип архитектуры', 'SELECT', 13, false,
  '["Монолит","Микросервисная","Гибрид"]'::jsonb, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '2. Архитектура', 'deployment_environment', 'Среда размещения', 'SELECT', 14, false,
  '["VMware","Bare Metal","Cloud","Kubernetes"]'::jsonb, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '2. Архитектура', 'integration_scheme', 'Схема взаимодействия (интеграции)', 'LONG_TEXT', 15, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '2. Архитектура', 'protocols_used', 'Используемые протоколы (HTTP, HTTPS, TCP, REST, SOAP и т.д.)', 'TEXT', 16, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '2. Архитектура', 'clustering', 'Кластеризация', 'BOOLEAN', 17, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '2. Архитектура', 'geo_redundancy', 'Георезервирование', 'BOOLEAN', 18, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '2. Архитектура', 'server_type', 'Тип сервера', 'SELECT', 19, false,
  '["Виртуальный","Физический","Контейнеризированный"]'::jsonb, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '2. Архитектура', 'physical_server_location', 'Адрес расположения физического сервера (если не в облаке)', 'TEXT', 20, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '2. Архитектура', 'load_balancing', 'Используется ли кластеризация и балансировка нагрузки', 'BOOLEAN', 21, false, NULL, NULL),

-- 3. Состав системы (Компоненты) — таблица
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '3. Состав системы (Компоненты)', 'system_components', 'Состав системы (Компоненты)', 'TABLE', 22, false, NULL,
  '[
     {"key":"component","label":"Компонент","type":"TEXT"},
     {"key":"comp_type","label":"Тип","type":"TEXT"},
     {"key":"host_ip","label":"Хост / IP","type":"TEXT"},
     {"key":"hostname","label":"Hostname","type":"TEXT"},
     {"key":"description","label":"Описание","type":"TEXT"}
   ]'::jsonb),

-- 4. Интеграция со смежными системами — таблица
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '4. Интеграция со смежными системами', 'system_integrations', 'Интеграция со смежными системами', 'TABLE', 23, false, NULL,
  '[
     {"key":"system_purpose","label":"Система / Назначение","type":"TEXT"},
     {"key":"type_architecture","label":"Тип / архитектура","type":"TEXT"},
     {"key":"protocol","label":"Протокол","type":"TEXT"},
     {"key":"channel","label":"Канал","type":"TEXT"},
     {"key":"direction","label":"Направление","type":"TEXT"}
   ]'::jsonb),

-- 5. Базы данных и хранилища
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '5. Базы данных и хранилища', 'db_type', 'Тип БД', 'SELECT', 24, false,
  '["Oracle","PostgreSQL","MSSQL","Другое"]'::jsonb, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '5. Базы данных и хранилища', 'db_connection_type', 'Тип подключения', 'SELECT', 25, false,
  '["JDBC","ODBC","Native"]'::jsonb, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '5. Базы данных и хранилища', 'db_replication', 'Репликация', 'BOOLEAN', 26, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '5. Базы данных и хранилища', 'db_clustering', 'Кластеризация', 'BOOLEAN', 27, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '5. Базы данных и хранилища', 'message_queues', 'Используемые очереди (RabbitMQ / Kafka)', 'TEXT', 28, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '5. Базы данных и хранилища', 'storage_used', 'Используемые хранилища (MinIO / NAS / SAN)', 'TEXT', 29, false, NULL, NULL),

-- 6. Доступы и безопасность
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '6. Доступы и безопасность', 'auth_type', 'Тип аутентификации (LDAP, AD, OAuth)', 'TEXT', 30, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '6. Доступы и безопасность', 'encryption_enabled', 'Наличие шифрования (SSL/TLS)', 'BOOLEAN', 31, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '6. Доступы и безопасность', 'secrets_storage', 'Хранение секретов (Vault / Keycloak / Local)', 'TEXT', 32, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '6. Доступы и безопасность', 'logging', 'Журналирование (логирование)', 'TEXT', 33, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '6. Доступы и безопасность', 'access_policies', 'Политики доступа', 'LONG_TEXT', 34, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '6. Доступы и безопасность', 'access_responsible', 'Ответственные за доступы', 'TEXT', 35, false, NULL, NULL),

-- 7. Мониторинг и алертинг
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '7. Мониторинг и алертинг', 'monitoring_system', 'Система мониторинга (Zabbix, Grafana и т.д., можно со ссылкой на дашборд)', 'TEXT', 36, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '7. Мониторинг и алертинг', 'availability_check', 'Проверка доступности (ICMP / HTTP / API)', 'TEXT', 37, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '7. Мониторинг и алертинг', 'monitored_metrics', 'Контролируемые метрики (CPU / RAM / Disk / Sessions / API)', 'TEXT', 38, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '7. Мониторинг и алертинг', 'alert_triggers', 'Триггеры / алерты', 'LONG_TEXT', 39, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '7. Мониторинг и алертинг', 'notification_channels', 'Каналы уведомлений (Remedy / Telegram / Email / SMS)', 'TEXT', 40, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '7. Мониторинг и алертинг', 'monitoring_responsible', 'Ответственные', 'TEXT', 41, false, NULL, NULL),

-- 8. Резервное копирование и восстановление
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '8. Резервное копирование и восстановление', 'backup_type', 'Тип бэкапа', 'SELECT', 42, false,
  '["Полный","Инкрементальный"]'::jsonb, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '8. Резервное копирование и восстановление', 'backup_frequency', 'Периодичность', 'TEXT', 43, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '8. Резервное копирование и восстановление', 'backup_retention', 'Срок хранения', 'TEXT', 44, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '8. Резервное копирование и восстановление', 'rpo_rto', 'RPO / RTO', 'TEXT', 45, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '8. Резервное копирование и восстановление', 'backup_responsible', 'Ответственные', 'TEXT', 46, false, NULL, NULL),

-- 9. Производительность
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '9. Производительность', 'user_count', 'Количество пользователей', 'TEXT', 47, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '9. Производительность', 'avg_load', 'Средняя нагрузка', 'TEXT', 48, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '9. Производительность', 'peak_load', 'Пиковая нагрузка', 'TEXT', 49, false, NULL, NULL),
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '9. Производительность', 'performance_limits', 'Ограничения производительности', 'LONG_TEXT', 50, false, NULL, NULL),

-- 10. Лицензии и программное обеспечение — таблица
('bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9', '10. Лицензии и программное обеспечение', 'licenses', 'Лицензии и программное обеспечение', 'TABLE', 51, false, NULL,
  '[
     {"key":"name","label":"Наименование","type":"TEXT"},
     {"key":"license_type","label":"Тип лицензии","type":"TEXT"},
     {"key":"quantity","label":"Количество","type":"TEXT"},
     {"key":"validity_period","label":"Срок действия","type":"TEXT"},
     {"key":"description","label":"Описание","type":"TEXT"}
   ]'::jsonb);

COMMIT;

-- Проверка результата:
-- SELECT section_name, key, label, type FROM field_definitions
--   WHERE object_type_id = 'bf532efa-bc6f-4fe2-b82c-fbe2d765c9b9'
--   ORDER BY "order";
