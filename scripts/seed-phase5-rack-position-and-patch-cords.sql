-- Фаза 5 CMDB (см. docs/it-passports-design.md, раздел 8.8) — добавляет
-- два новых поля к каждому из пяти типов стоечного оборудования, заведённых
-- фазой 4 (scripts/seed-equipment-object-types.sql):
--
-- 1. "Позиция в стойке" (RACK_POSITION) — используется страницей раскладки
--    стойки (/locations/[id]/rack-elevation). Привязана к тому же полю
--    "Стойка" (key = 'rack'), что и AUTO_IDENTIFIER-поле из фазы 3/4.
-- 2. "Патч-корды" (TABLE) — три столбца: наш порт (текст), устройство на
--    другом конце кабеля (OBJECT_REFERENCE, тип объекта — «любой», см.
--    it-passports-design.md раздел 8.8 про относящееся к этому решение),
--    порт на том устройстве (текст, не проверяется — сознательный выбор
--    пользователя в пользу более простой реализации).
--
-- ВАЖНО: этот файл нужно запускать ПОСЛЕ scripts/seed-equipment-object-types.sql
-- (фаза 4) — он ищет существующие типы 'server'/'switch'/'ups'/'disk_array'/
-- 'blade_server' по коду и завершится с ошибкой NOT NULL constraint, если
-- какого-то из них ещё нет.
--
-- Как запустить — тем же способом, что и предыдущие сидеры в этой папке:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком в открывшуюся сессию.

BEGIN;

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required,
   rack_position_rack_field_key)
SELECT
  ot.id, 'Расположение и связи', 'rack_position', 'Позиция в стойке', 'RACK_POSITION', 7, false, 'rack'
FROM object_types ot
WHERE ot.code IN ('server', 'switch', 'ups', 'disk_array', 'blade_server');

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required, table_columns)
SELECT
  ot.id, 'Расположение и связи', 'patch_cords', 'Патч-корды', 'TABLE', 8, false,
  '[
     {"key":"local_port","label":"Наш порт","type":"TEXT"},
     {"key":"remote_device","label":"Устройство на другом конце","type":"OBJECT_REFERENCE","referenceTargetKind":"OBJECT_TYPE","referenceObjectTypeId":null},
     {"key":"remote_port","label":"Порт на другом устройстве","type":"TEXT"}
   ]'::jsonb
FROM object_types ot
WHERE ot.code IN ('server', 'switch', 'ups', 'disk_array', 'blade_server');

COMMIT;

-- Проверка результата:
-- SELECT ot.name, fd.section_name, fd.key, fd.label, fd.type
--   FROM field_definitions fd
--   JOIN object_types ot ON ot.id = fd.object_type_id
--   WHERE ot.code IN ('server','switch','ups','disk_array','blade_server')
--   ORDER BY ot.name, fd."order";
