-- Добавляет "Позицию в стойке" и "Патч-корды" (фаза 5, см.
-- it-passports-design.md раздел 8.8) четырём типам оборудования —
-- Коммутатор/ИБП/Дисковый массив/Блейд-сервер. "Сервер" сознательно
-- исключён из WHERE ниже — он уже получил оба поля раньше, и повторная
-- вставка для него упала бы на ограничении уникальности (object_type_id,
-- key) в field_definitions. Это точная копия
-- scripts/seed-phase5-rack-position-and-patch-cords.sql с одним отличием —
-- сужен список кодов в WHERE.
--
-- ВАЖНО: запускать ПОСЛЕ scripts/restore-remaining-equipment-types.sql —
-- этот скрипт использует уже заведённые им типы и их поле "rack".
--
-- Как запустить — так же, как и остальные сидеры:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком в открывшуюся сессию.

BEGIN;

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required,
   rack_position_rack_field_key)
SELECT
  ot.id, 'Расположение и связи', 'rack_position', 'Позиция в стойке', 'RACK_POSITION', 7, false, 'rack'
FROM object_types ot
WHERE ot.code IN ('switch', 'ups', 'disk_array', 'blade_server');

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
WHERE ot.code IN ('switch', 'ups', 'disk_array', 'blade_server');

COMMIT;

-- Проверка результата — все пять типов должны показать 8:
-- SELECT ot.name, count(fd.id) AS fields
--   FROM object_types ot LEFT JOIN field_definitions fd ON fd.object_type_id = ot.id
--   WHERE ot.code IN ('server','switch','ups','disk_array','blade_server')
--   GROUP BY ot.name ORDER BY ot.name;
