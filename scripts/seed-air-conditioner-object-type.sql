-- Продолжение фазы 4 CMDB (см. docs/it-passports-design.md, раздел 8.7) —
-- добавляет шестой тип паспорта для инфраструктурного оборудования ЦОД,
-- отложенный при первом заходе фазы 4 (раздел 8.0: "инфраструктурное
-- оборудование (ИБП, кондиционеры и т.п.)" — ИБП сделан тогда же, кондиционер
-- решили добавить отдельным заходом): **Кондиционер**.
--
-- Устройство ровно то же, что и у пяти типов из seed-equipment-object-
-- types.sql (Сервер/Коммутатор/ИБП/Дисковый массив/Блейд-сервер) — тот же
-- минимальный стартовый комплект полей, тот же механизм AUTO_IDENTIFIER,
-- ничего нового в схеме или коде приложения не требуется. Одно отличие:
-- поле-якорь для идентификатора называется "Место установки", а не
-- "Стойка" — кондиционер физически стоит не в стойке, а в помещении/
-- гермозоне ЦОД (LocationKind.ROOM/ZONE), но сам механизм AUTO_IDENTIFIER
-- работает с любым узлом дерева локаций одинаково (см. it-passports-
-- design.md раздел 8.6/8.15) — просто выбирайте при заполнении паспорта не
-- стойку, а гермозону/зал, где конкретный кондиционер установлен.
--
-- Код в equipment_type_codes — 'ac' (условно, по аналогии с уже заведёнными
-- 'srv'/'cs'/'ups'/'da'/'bl', а не точное значение из таблицы 2 инструкции
-- Казахтелекома, которое не под рукой при написании этого сидера). Если в
-- вашей копии инструкции код другой — поправьте одну строку прямо на
-- странице /equipment-type-codes (доступна только Паспорт Админу) в любой
-- момент до того, как этот тип реально начнут использовать: код входит в
-- уже сгенерированные идентификаторы буквально, так что менять его имеет
-- смысл только пока паспортов кондиционеров ещё нет.
--
-- Как запустить — тем же способом, что и остальные сидеры этой папки:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком.

BEGIN;

-- Код для идентификатора (см. пояснение выше про возможность переименовать
-- на /equipment-type-codes до первого использования).
INSERT INTO equipment_type_codes (code, label, "order")
VALUES ('ac', 'Кондиционер', 5);

INSERT INTO object_types (id, name, code, description)
VALUES
  ('a3e639f7-4f8e-4ca4-8875-1f2ecca47c33', 'Кондиционер', 'air_conditioner',
   'Кондиционер (система охлаждения) в помещении/гермозоне ЦОД.');

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required,
   reference_target_kind, auto_identifier_rack_field_key, auto_identifier_equipment_type_code_id)
VALUES
  ('a3e639f7-4f8e-4ca4-8875-1f2ecca47c33', 'Общая информация', 'location', 'Место установки', 'OBJECT_REFERENCE', 1, true,
    'LOCATION', NULL, NULL),
  ('a3e639f7-4f8e-4ca4-8875-1f2ecca47c33', 'Общая информация', 'equipment_id', 'Идентификатор оборудования', 'AUTO_IDENTIFIER', 2, false,
    NULL, 'location', (SELECT id FROM equipment_type_codes WHERE code = 'ac')),
  ('a3e639f7-4f8e-4ca4-8875-1f2ecca47c33', 'Общая информация', 'model', 'Модель', 'TEXT', 3, false, NULL, NULL, NULL),
  ('a3e639f7-4f8e-4ca4-8875-1f2ecca47c33', 'Общая информация', 'serial_number', 'Серийный номер', 'TEXT', 4, false, NULL, NULL, NULL),
  ('a3e639f7-4f8e-4ca4-8875-1f2ecca47c33', 'Общая информация', 'management_ip', 'Управляющий IP-адрес', 'IP_REFERENCE', 5, false, NULL, NULL, NULL),
  ('a3e639f7-4f8e-4ca4-8875-1f2ecca47c33', 'Общая информация', 'commissioned_at', 'Дата ввода в эксплуатацию', 'DATE', 6, false, NULL, NULL, NULL);

COMMIT;

-- Проверка результата:
-- SELECT ot.name, fd.section_name, fd.key, fd.label, fd.type, fd.required,
--        fd.auto_identifier_rack_field_key, fd.auto_identifier_equipment_type_code_id
--   FROM field_definitions fd
--   JOIN object_types ot ON ot.id = fd.object_type_id
--   WHERE ot.code = 'air_conditioner'
--   ORDER BY fd."order";
