-- Модель бизнес-сервисов / карта сервисов (см. docs/it-passports-design.md,
-- раздел 8.13) — верхний уровень над паспортами: "какой бизнес-сервис из
-- каких КЕ состоит", и, за счёт переиспользования уже готового
-- impact-анализа (фаза 6, раздел 8.9), "что затронет, если один из
-- компонентов сервиса откажет".
--
-- Заводит один новый тип паспорта — "Бизнес-сервис" — тем же способом,
-- что и предыдущие сидеры этой папки. Технически это ОБЫЧНЫЙ тип объекта,
-- как "Сервер" или "Коммутатор", без единой строчки нового кода
-- приложения и без миграции схемы:
--
--   * "Критичность" (SELECT) и "Описание" (LONG_TEXT) — обычные поля.
--   * "Владелец" отдельного поля не требует — уже покрыт существующим
--     назначением ответственных (ObjectInstanceResponsible), общим для
--     любого паспорта.
--   * "Состав сервиса" (TABLE) — один столбец "Компонент", тип
--     OBJECT_REFERENCE с целью "любой тип объекта" (referenceObjectTypeId
--     = NULL, тот же приём, что уже применён к столбцу "Устройство на
--     другом конце" у патч-кордов, фаза 5, раздел 8.8 — сервис может
--     зависеть от приложения, базы данных, сервера, чего угодно) и
--     relationshipType = 'DEPENDENCY'.
--
-- Именно тип связи DEPENDENCY — вся суть этой фичи. getImpactAnalysis
-- (app/(app)/passports/actions.ts, см. раздел 8.9) уже сегодня обходит
-- ВСЕ DEPENDENCY-рёбра во всей системе транзитивно, не различая, что
-- именно является источником ребра — обычное OBJECT_REFERENCE-поле или
-- столбец TABLE-поля. Из этого прямо следует:
--
--   * Открыв Impact-анализ на самой КЕ бизнес-сервиса ("от чего зависит
--     этот объект" — upstream), админ увидит полное дерево зависимостей:
--     сервис → приложение → база данных → сервер, и так далее по цепочке
--     — то есть готовую "карту сервиса", без единой новой страницы.
--   * Открыв Impact-анализ на любом компоненте (например, на паспорте
--     сервера) — "что пострадает, если этот объект выйдет из строя"
--     (downstream) — админ увидит, что бизнес-сервис входит в число
--     пострадавших, если сервис (прямо или через цепочку) зависит от
--     этого компонента.
--
-- Как запустить — тем же способом, что и остальные сидеры этой папки:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком в открывшуюся сессию.
--
-- После выполнения тип "Бизнес-сервис" появится в /object-types (у
-- Passport Admin) и будет доступен при создании нового паспорта в
-- /passports/new. Дальше это уже работа с данными, не с кодом: завести
-- паспорт "Бизнес-сервис — Биллинг", в его табличном поле "Состав
-- сервиса" через обычный поиск-пикер выбрать компоненты (приложение,
-- БД, сервер...), и открыть Impact-анализ с карточки этого паспорта.

BEGIN;

INSERT INTO object_types (id, name, code, description)
VALUES
  ('bc868dd4-ef85-4d3a-be83-0bcb70663b1e', 'Бизнес-сервис', 'business_service',
   'Логическая группировка КЕ, обеспечивающих один бизнес-процесс (например, «Биллинг» или «Интернет-банкинг») — верхний уровень над физическими и логическими паспортами CMDB.');

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required, options)
VALUES
  ('bc868dd4-ef85-4d3a-be83-0bcb70663b1e', 'Общая информация', 'criticality', 'Критичность', 'SELECT', 1, true,
   '["Критичный", "Высокий", "Средний", "Низкий"]'::jsonb);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required)
VALUES
  ('bc868dd4-ef85-4d3a-be83-0bcb70663b1e', 'Общая информация', 'description', 'Описание', 'LONG_TEXT', 2, false);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required, table_columns)
VALUES
  ('bc868dd4-ef85-4d3a-be83-0bcb70663b1e', 'Состав', 'components', 'Состав сервиса', 'TABLE', 3, false,
   '[
      {"key":"component","label":"Компонент","type":"OBJECT_REFERENCE","referenceTargetKind":"OBJECT_TYPE","referenceObjectTypeId":null,"relationshipType":"DEPENDENCY"}
    ]'::jsonb);

COMMIT;

-- Проверка результата:
-- SELECT ot.name, fd.section_name, fd.key, fd.label, fd.type, fd.required, fd.options, fd.table_columns
--   FROM field_definitions fd
--   JOIN object_types ot ON ot.id = fd.object_type_id
--   WHERE ot.code = 'business_service'
--   ORDER BY fd."order";
