-- Тестовая форма "Паспорт БД" — создаёт ObjectType и все FieldDefinition
-- по образцу исходного шаблона (паспорт_БД.docx: 10 разделов, включая
-- 1 повторяющуюся таблицу — "Автоматизированные SQL-скрипты / задания").
--
-- Как и в seed-kis-passport-type.sql, без \gset — везде используется
-- заранее сгенерированный фиксированный UUID, обычный SQL без
-- backslash-команд psql, безопасно вставлять как есть в открытую сессию.
--
-- Оригинальные пункты в докс-файле были пронумерованы вперемешку из
-- какого-то более старого шаблона (1.6, 10.1, 7.3 и т.д. — не совпадает
-- с текущей нумерацией разделов 1–10) — эта нумерация не перенесена в
-- подписи полей, только сам текст вопроса, чтобы не путать в интерфейсе.
--
-- Раздел "3. Автоматизированные процессы" в исходнике — не чистая
-- таблица: там одна настоящая повторяющаяся таблица (задания/скрипты:
-- наименование, расписание, тип, назначение) и ещё 4 отдельных вопроса,
-- визуально оформленных как объединённые строки той же Word-таблицы.
-- Здесь это разделено на 1 поле TABLE + 4 обычных LONG_TEXT-поля в том
-- же разделе — конструктор форм это поддерживает (раздел — это просто
-- группировка, в нём может быть сколько угодно полей любых типов).
--
-- Как запустить: docker compose exec db psql -U postgres -d postgres
-- и вставить содержимое этого файла целиком в открывшуюся сессию.

BEGIN;

INSERT INTO object_types (id, name, code, description)
VALUES (
  '8d3104fa-d0c6-469d-adba-5ca537a553a9',
  'Паспорт БД',
  'db_passport',
  'Тестовая форма, создана по образцу исходного шаблона паспорт_БД.docx.'
);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required, options, table_columns)
VALUES
-- 1. Общая информация
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'db_name_purpose', 'Наименование и назначение БД', 'LONG_TEXT', 1, true, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'dba_contacts', 'Контакты администраторов БД', 'TEXT', 2, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'server_admin_contacts', 'Контакты администраторов серверов (Linux, Windows, VMware)', 'TEXT', 3, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'dbms_support_contacts', 'Контакты техподдержки СУБД (Oracle Support, партнеры, внутренние команды)', 'TEXT', 4, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'developer_contacts', 'Контакты разработчиков, работающих с БД', 'TEXT', 5, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'responsibility_level', 'Уровень ответственности (кто выполняет патчи, backup, мониторинг, обновления)', 'LONG_TEXT', 6, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'ip_address', 'IP адрес в сети', 'TEXT', 7, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'os_name_version', 'Полное название и версия ОС', 'TEXT', 8, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'dbms_version', 'Полная версия СУБД', 'TEXT', 9, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'sid', 'SID', 'TEXT', 10, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'db_port', 'Порт СУБД', 'TEXT', 11, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'db_size', 'Объем БД', 'TEXT', 12, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'active_users_count', 'Количество активных пользователей БД', 'TEXT', 13, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'db_environment', 'Используемые базы данных', 'SELECT', 14, false,
  '["Production","Standby","Test","Dev","UAT"]'::jsonb, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '1. Общая информация', 'connection_method', 'Метод подключения пользователей', 'SELECT', 15, false,
  '["Локально","VPN","Web","Клиентские приложения"]'::jsonb, NULL),

-- 2. Архитектура
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '2. Архитектура', 'fault_tolerance_level', 'Уровень отказоустойчивости', 'SELECT', 16, false,
  '["Standalone","RAC","Data Guard","GoldenGate","Streams","Sharding"]'::jsonb, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '2. Архитектура', 'file_manager', 'Используемый файловый менеджер', 'SELECT', 17, false,
  '["ASM","FS","NFS","Другое"]'::jsonb, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '2. Архитектура', 'hardware_config', 'Конфигурация железа (CPU, RAM, дисковая подсистема: SSD, HDD, NVMe, SAN)', 'LONG_TEXT', 18, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '2. Архитектура', 'avg_server_load', 'Средняя нагрузка на сервер (CPU, RAM, Disk I/O)', 'TEXT', 19, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '2. Архитектура', 'log_archive_mode', 'Используемый режим архивации логов', 'SELECT', 20, false,
  '["ARCHIVELOG","NONARCHIVELOG"]'::jsonb, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '2. Архитектура', 'infrastructure_type', 'Описание инфраструктуры', 'SELECT', 21, false,
  '["Cloud","On-Prem","Hybrid"]'::jsonb, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '2. Архитектура', 'server_type', 'Тип сервера', 'SELECT', 22, false,
  '["Виртуальный","Физический","Контейнеризированный"]'::jsonb, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '2. Архитектура', 'physical_server_location', 'Адрес расположения физического сервера (если не в облаке)', 'TEXT', 23, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '2. Архитектура', 'load_balancing', 'Используется ли кластеризация и балансировка нагрузки', 'BOOLEAN', 24, false, NULL, NULL),

-- 3. Автоматизированные процессы
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '3. Автоматизированные процессы', 'automated_jobs', 'Автоматизированные SQL-скрипты / задания', 'TABLE', 25, false, NULL,
  '[
     {"key":"job_name","label":"Наименование скрипта / задания","type":"TEXT"},
     {"key":"schedule","label":"Расписание","type":"TEXT"},
     {"key":"job_type","label":"Тип (PL/SQL Jobs / DBMS_SCHEDULER / CRON)","type":"TEXT"},
     {"key":"purpose","label":"Назначение","type":"TEXT"}
   ]'::jsonb),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '3. Автоматизированные процессы', 'cleanup_archiving_procedures', 'Автоматические процедуры очистки и архивации данных', 'LONG_TEXT', 26, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '3. Автоматизированные процессы', 'external_integrations', 'Взаимодействие БД с внешними сервисами (ETL, API, BI-инструменты)', 'LONG_TEXT', 27, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '3. Автоматизированные процессы', 'custom_triggers', 'Наличие триггеров в СУБД, разработанных не централизованно, и их назначение', 'LONG_TEXT', 28, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '3. Автоматизированные процессы', 'os_scheduled_tasks', 'Список и назначение автоматически выполняемых заданий на ОС (Планировщик заданий, CRON)', 'LONG_TEXT', 29, false, NULL, NULL),

-- 4. Безопасность и доступ
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '4. Безопасность и доступ', 'audit_enabled', 'Включен ли аудит действий пользователей (Fine-Grained Auditing, Unified Auditing)', 'BOOLEAN', 30, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '4. Безопасность и доступ', 'audit_log_retention_policy', 'Политика хранения логов аудита (сколько хранятся, где хранятся)', 'TEXT', 31, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '4. Безопасность и доступ', 'auth_mechanism', 'Механизмы аутентификации', 'SELECT', 32, false,
  '["LDAP","Kerberos","Локальные учётные записи","Другое"]'::jsonb, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '4. Безопасность и доступ', 'encryption_used', 'Используется ли шифрование данных (TDE, SSL/TLS для соединений, Data Redaction)', 'TEXT', 33, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '4. Безопасность и доступ', 'dlp_configured', 'Настроены ли DLP-механизмы для защиты чувствительных данных', 'BOOLEAN', 34, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '4. Безопасность и доступ', 'access_control_roles', 'Контроль прав пользователей — кто имеет DBA-доступ, какие роли используются', 'LONG_TEXT', 35, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '4. Безопасность и доступ', 'last_security_review', 'Последняя проверка безопасности (PenTest, аудит прав доступа, сканирование уязвимостей)', 'TEXT', 36, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '4. Безопасность и доступ', 'firewall_settings', 'Настройки firewall и доступ к БД (разрешенные IP-адреса, ACL)', 'LONG_TEXT', 37, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '4. Безопасность и доступ', 'password_policy', 'Политика смены паролей (частота обновления, сложность, MFA)', 'TEXT', 38, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '4. Безопасность и доступ', 'role_based_access_control', 'Контроль доступа по ролям и схемам (RBAC, ABAC, row-level security)', 'TEXT', 39, false, NULL, NULL),

-- 5. Мониторинг и оповещения
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '5. Мониторинг и оповещения', 'monitoring_system', 'Используемая система мониторинга (Zabbix, Nagios, Oracle Enterprise Manager, Prometheus и т.д.)', 'TEXT', 40, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '5. Мониторинг и оповещения', 'key_metrics', 'Ключевые метрики (CPU, RAM, tablespace usage, long-running queries, alert log, deadlocks, wait events)', 'LONG_TEXT', 41, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '5. Мониторинг и оповещения', 'notification_channels', 'Оповещения (email, Telegram, SMS, ITSM-интеграция)', 'TEXT', 42, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '5. Мониторинг и оповещения', 'auto_incident_response', 'Автоматическая реакция на аварии (self-healing scripts, автоматические рестарты)', 'TEXT', 43, false, NULL, NULL),

-- 6. Резервное копирование и восстановление
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '6. Резервное копирование и восстановление', 'backup_method', 'Метод и описание выполнения резервного копирования («горячего», «холодного»)', 'TEXT', 44, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '6. Резервное копирование и восстановление', 'backup_storage_location', 'Место хранения резервных копий', 'TEXT', 45, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '6. Резервное копирование и восстановление', 'backup_schedule', 'График проведения работ', 'TEXT', 46, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '6. Резервное копирование и восстановление', 'backup_retention_period', 'Срок хранения резервных копий (недели, месяцы, годы)', 'TEXT', 47, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '6. Резервное копирование и восстановление', 'rpo_rto', 'Политика восстановления БД (RTO/RPO) — допустимое время восстановления и потеря данных', 'TEXT', 48, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '6. Резервное копирование и восстановление', 'backup_integrity_check', 'Автоматическая проверка резервных копий на целостность (RMAN VALIDATE, Test Restore, Block Corruption Check)', 'TEXT', 49, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '6. Резервное копирование и восстановление', 'backup_tools', 'Инструменты для бэкапа (RMAN, Data Pump, ZDLRA, Veeam, NetBackup и др.)', 'TEXT', 50, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '6. Резервное копирование и восстановление', 'backup_history', 'История успешных и неудачных бэкапов за последние 6 месяцев', 'LONG_TEXT', 51, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '6. Резервное копирование и восстановление', 'test_restore_info', 'Информация о тестовом восстановлении (дата последнего теста)', 'TEXT', 52, false, NULL, NULL),

-- 7. Производительность и оптимизация
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '7. Производительность и оптимизация', 'index_stats_query_analysis', 'Статистика индексов и анализ производительности запросов (AWR, ASH, SQL Plan Baselines)', 'LONG_TEXT', 53, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '7. Производительность и оптимизация', 'optimization_mechanisms', 'Механизмы оптимизации (Partitioning, Materialized Views, Indexing, Hints)', 'TEXT', 54, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '7. Производительность и оптимизация', 'lock_wait_issues', 'Проблемы с блокировками и ожиданиями (Locks, Wait Events, Deadlocks)', 'LONG_TEXT', 55, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '7. Производительность и оптимизация', 'resource_manager_used', 'Используется ли автоматическое перераспределение ресурсов (Resource Manager)', 'BOOLEAN', 56, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '7. Производительность и оптимизация', 'custom_software_modules', 'Наличие локального самописного ПО в СУБД, модулей, разработанных не централизованно, и их назначение', 'LONG_TEXT', 57, false, NULL, NULL),

-- 8. Поддержка, обновления и патчи
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '8. Поддержка, обновления и патчи', 'last_update_date', 'Дата последнего обновления СУБД и ОС', 'DATE', 58, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '8. Поддержка, обновления и патчи', 'config_management_system', 'Система управления конфигурациями', 'SELECT', 59, false,
  '["Ansible","Puppet","Chef","Другое"]'::jsonb, NULL),

-- 9. Документация и инструкции
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '9. Документация и инструкции', 'user_policy_description', 'Описание политик работы пользователей с БД (график проведения РНР по СУБД на год)', 'LONG_TEXT', 60, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '9. Документация и инструкции', 'recovery_instructions_link', 'Пошаговые инструкции по восстановлению БД в случае сбоя', 'LINK', 61, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '9. Документация и инструкции', 'recovery_responsible_contacts', 'Контакты ответственных за восстановление БД в нештатных ситуациях', 'TEXT', 62, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '9. Документация и инструкции', 'failover_instructions_link', 'Инструкция по аварийному переключению на Standby (если используется Data Guard)', 'LINK', 63, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '9. Документация и инструкции', 'maintenance_schedule', 'График и регламент проведения технических работ на БД', 'TEXT', 64, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '9. Документация и инструкции', 'month_close_open_staff', 'Сотрудники, выполняющие процедуры «открытие месяца» и «закрытие месяца»', 'TEXT', 65, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '9. Документация и инструкции', 'month_close_open_instructions', 'Пошаговая инструкция по процедурам «открытие месяца» и «закрытие месяца» (дни и время)', 'LONG_TEXT', 66, false, NULL, NULL),

-- 10. Критические риски и рекомендации
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '10. Критические риски и рекомендации', 'current_issues', 'Основные текущие проблемы с БД (производительность, ошибки, сбои)', 'LONG_TEXT', 67, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '10. Критические риски и рекомендации', 'legacy_tech_risks', 'Риски, связанные с устаревшими технологиями (конец поддержки версии)', 'LONG_TEXT', 68, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '10. Критические риски и рекомендации', 'bottlenecks_recommendations', 'Возможные узкие места и рекомендации по улучшению производительности', 'LONG_TEXT', 69, false, NULL, NULL),
('8d3104fa-d0c6-469d-adba-5ca537a553a9', '10. Критические риски и рекомендации', 'infrastructure_improvements', 'Необходимые улучшения инфраструктуры (обновление серверов, сетевого оборудования)', 'LONG_TEXT', 70, false, NULL, NULL);

COMMIT;

-- Проверка результата:
-- SELECT section_name, key, label, type FROM field_definitions
--   WHERE object_type_id = '8d3104fa-d0c6-469d-adba-5ca537a553a9'
--   ORDER BY "order";
