-- Учёт сетевых портов/интерфейсов и физических соединений порт-к-порту
-- (см. docs/it-passports-design.md, раздел 8.17). Заводит один новый тип
-- паспорта — «Порт/Интерфейс» — и требует новую миграцию
-- 20260903100000_add_object_reference_unique_target (столбец
-- object_reference_unique_target на field_definitions), но НЕ требует
-- никакой новой таблицы: связь порт-к-порту — обычный `OBJECT_REFERENCE`,
-- нацеленный на этот же новый тип, с новым флагом «строго один-к-одному»
-- на поле «Связанный порт».
--
-- Это осознанное развитие решения фазы 5 (раздел 8.8) — тогда патч-корды
-- были заведены табличным полем с текстовым портом на другом конце («порт-
-- к-порту через отдельную сущность» был явно рассмотрен и отклонён ради
-- скорости). Сейчас, когда понадобился настоящий учёт портов как таковых
-- (свободен/занят/неисправен, адресуемая связь порт-к-порту, создание
-- портов коммутатора по отдельности), сделан более строгий вариант, но уже
-- существующее поле «Патч-корды» намеренно не тронуто и продолжает
-- работать как раньше — оба механизма сосуществуют, каждый для своего
-- уровня строгости.
--
-- Поля «Порт/Интерфейс»:
--   * «Оборудование» (OBJECT_REFERENCE, обязательное) — цель «любой тип
--     объекта» (тот же приём, что у патч-кордов и бизнес-сервиса — порт
--     может принадлежать серверу, коммутатору или другому оборудованию),
--     relationshipType = CONTAINMENT («порт входит в состав оборудования»).
--   * «Имя/номер порта» (TEXT, обязательное) — например «GE0/1», «eth0».
--   * «Тип» (SELECT, обязательное) — Физический / Виртуальный.
--   * «Статус» (SELECT, обязательное) — Свободен / Занят / Неисправен /
--     Зарезервирован. Это статус доступности порта для целей CMDB-учёта
--     (свободен ли он для нового подключения), не «поднят/опущен» в
--     реальном времени — это задача системы мониторинга, не CMDB.
--     Заполняется и поддерживается вручную, независимо от поля «Связанный
--     порт» ниже — приложение не выводит статус автоматически из наличия
--     связи, чтобы не плодить скрытую логику ради одного поля.
--   * «Связанный порт» (OBJECT_REFERENCE, необязательное) — цель строго
--     тип «Порт/Интерфейс» (не «любой тип», в отличие от поля выше),
--     relationshipType = ASSOCIATION (физическая связь, не подразумевающая
--     отказоустойчивую зависимость — тот же смысл, что и у патч-кордов).
--     Флаг object_reference_unique_target = true — по явному решению
--     пользователя: один и тот же порт нельзя одновременно указать как
--     «Связанный порт» у двух разных паспортов порта (физически в порт
--     нельзя воткнуть два кабеля одновременно). Заполняется один раз с
--     любой стороны кабеля — на карточке порта на другом конце связь будет
--     видна через уже существующий механизм обратных ссылок (фаза 6),
--     дублировать вручную с обеих сторон не нужно.
--
-- Как запустить — тем же способом, что и остальные сидеры этой папки:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком.
--
-- Требует уже применённой миграции
-- 20260903100000_add_object_reference_unique_target.

BEGIN;

INSERT INTO object_types (id, name, code, description)
VALUES
  ('f7b0c7d1-9b64-406c-b888-852fa721f1e2', 'Порт/Интерфейс', 'network_port',
   'Сетевой порт или интерфейс на оборудовании (физический или виртуальный) — со статусом доступности и, при подключении, ссылкой на порт на другом конце кабеля.');

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required,
   reference_target_kind, reference_object_type_id, relationship_type)
VALUES
  ('f7b0c7d1-9b64-406c-b888-852fa721f1e2', 'Общая информация', 'equipment', 'Оборудование', 'OBJECT_REFERENCE', 1, true,
   'OBJECT_TYPE', NULL, 'CONTAINMENT');

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required)
VALUES
  ('f7b0c7d1-9b64-406c-b888-852fa721f1e2', 'Общая информация', 'port_name', 'Имя/номер порта', 'TEXT', 2, true);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required, options)
VALUES
  ('f7b0c7d1-9b64-406c-b888-852fa721f1e2', 'Общая информация', 'port_type', 'Тип', 'SELECT', 3, true,
   '["Физический", "Виртуальный"]'::jsonb);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required, options)
VALUES
  ('f7b0c7d1-9b64-406c-b888-852fa721f1e2', 'Общая информация', 'status', 'Статус', 'SELECT', 4, true,
   '["Свободен", "Занят", "Неисправен", "Зарезервирован"]'::jsonb);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required,
   reference_target_kind, reference_object_type_id, relationship_type, object_reference_unique_target)
VALUES
  ('f7b0c7d1-9b64-406c-b888-852fa721f1e2', 'Общая информация', 'connected_port', 'Связанный порт', 'OBJECT_REFERENCE', 5, false,
   'OBJECT_TYPE', 'f7b0c7d1-9b64-406c-b888-852fa721f1e2', 'ASSOCIATION', true);

COMMIT;

-- Проверка результата:
-- SELECT key, label, type, required, reference_object_type_id, relationship_type, object_reference_unique_target, options
--   FROM field_definitions
--   WHERE object_type_id = 'f7b0c7d1-9b64-406c-b888-852fa721f1e2'
--   ORDER BY "order";
