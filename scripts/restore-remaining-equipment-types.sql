-- Восстанавливает четыре типа паспорта — Коммутатор, ИБП, Дисковый массив,
-- Блейд-сервер — судя по всему, тоже удалённых через /object-types вместе
-- с "Сервером". "Сервер" сюда НЕ входит — он уже восстановлен отдельно
-- (scripts/restore-server-object-type.sql) и уже получил поля фазы 5
-- ("Позиция в стойке"/"Патч-корды"), так что повторно вставлять его или
-- заново прогонять на него seed-phase5-скрипт нельзя — упадёт на
-- ограничении уникальности (object_type_id, key) в field_definitions.
--
-- Использует те же фиксированные id, что и исходный
-- scripts/seed-equipment-object-types.sql (фаза 4) — результат будет
-- идентичен тому, что было до удаления. Безопасно запускать даже если
-- какой-то из этих типов уже существует — INSERT в object_types завершится
-- ошибкой уникальности по имени/коду и ничего не изменит.
--
-- Как запустить — так же, как и остальные сидеры:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком в открывшуюся сессию.
--
-- После этого выполните scripts/seed-phase5-for-remaining-types.sql —
-- он добавит "Позицию в стойке" и "Патч-корды" именно этим четырём типам
-- (не трогая уже готового "Сервера").

BEGIN;

INSERT INTO object_types (id, name, code, description)
VALUES
  ('6ba92ab4-33b0-46e4-9d30-5b2fbb310539', 'Коммутатор', 'switch', 'Сетевой коммутатор, установленный в стойке.'),
  ('11d07a14-f4a7-4975-80e6-982d4beb9fbe', 'ИБП', 'ups', 'Источник бесперебойного питания, установленный в стойке.'),
  ('1b4f4009-8f41-4f1d-ba0b-ba3c4378200a', 'Дисковый массив', 'disk_array', 'Дисковый массив (СХД), установленный в стойке.'),
  ('38f98035-5eb7-4572-bdcf-184e735a1e31', 'Блейд-сервер', 'blade_server', 'Блейд-сервер, установленный в стойке.');

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required,
   reference_target_kind, auto_identifier_rack_field_key, auto_identifier_equipment_type_code_id)
VALUES
-- Коммутатор (equipment_type_codes.code = 'cs')
('6ba92ab4-33b0-46e4-9d30-5b2fbb310539', 'Общая информация', 'rack', 'Стойка', 'OBJECT_REFERENCE', 1, true,
  'LOCATION', NULL, NULL),
('6ba92ab4-33b0-46e4-9d30-5b2fbb310539', 'Общая информация', 'equipment_id', 'Идентификатор оборудования', 'AUTO_IDENTIFIER', 2, false,
  NULL, 'rack', (SELECT id FROM equipment_type_codes WHERE code = 'cs')),
('6ba92ab4-33b0-46e4-9d30-5b2fbb310539', 'Общая информация', 'model', 'Модель', 'TEXT', 3, false, NULL, NULL, NULL),
('6ba92ab4-33b0-46e4-9d30-5b2fbb310539', 'Общая информация', 'serial_number', 'Серийный номер', 'TEXT', 4, false, NULL, NULL, NULL),
('6ba92ab4-33b0-46e4-9d30-5b2fbb310539', 'Общая информация', 'management_ip', 'Управляющий IP-адрес', 'IP_REFERENCE', 5, false, NULL, NULL, NULL),
('6ba92ab4-33b0-46e4-9d30-5b2fbb310539', 'Общая информация', 'commissioned_at', 'Дата ввода в эксплуатацию', 'DATE', 6, false, NULL, NULL, NULL),

-- ИБП (equipment_type_codes.code = 'ups')
('11d07a14-f4a7-4975-80e6-982d4beb9fbe', 'Общая информация', 'rack', 'Стойка', 'OBJECT_REFERENCE', 1, true,
  'LOCATION', NULL, NULL),
('11d07a14-f4a7-4975-80e6-982d4beb9fbe', 'Общая информация', 'equipment_id', 'Идентификатор оборудования', 'AUTO_IDENTIFIER', 2, false,
  NULL, 'rack', (SELECT id FROM equipment_type_codes WHERE code = 'ups')),
('11d07a14-f4a7-4975-80e6-982d4beb9fbe', 'Общая информация', 'model', 'Модель', 'TEXT', 3, false, NULL, NULL, NULL),
('11d07a14-f4a7-4975-80e6-982d4beb9fbe', 'Общая информация', 'serial_number', 'Серийный номер', 'TEXT', 4, false, NULL, NULL, NULL),
('11d07a14-f4a7-4975-80e6-982d4beb9fbe', 'Общая информация', 'management_ip', 'Управляющий IP-адрес', 'IP_REFERENCE', 5, false, NULL, NULL, NULL),
('11d07a14-f4a7-4975-80e6-982d4beb9fbe', 'Общая информация', 'commissioned_at', 'Дата ввода в эксплуатацию', 'DATE', 6, false, NULL, NULL, NULL),

-- Дисковый массив (equipment_type_codes.code = 'da')
('1b4f4009-8f41-4f1d-ba0b-ba3c4378200a', 'Общая информация', 'rack', 'Стойка', 'OBJECT_REFERENCE', 1, true,
  'LOCATION', NULL, NULL),
('1b4f4009-8f41-4f1d-ba0b-ba3c4378200a', 'Общая информация', 'equipment_id', 'Идентификатор оборудования', 'AUTO_IDENTIFIER', 2, false,
  NULL, 'rack', (SELECT id FROM equipment_type_codes WHERE code = 'da')),
('1b4f4009-8f41-4f1d-ba0b-ba3c4378200a', 'Общая информация', 'model', 'Модель', 'TEXT', 3, false, NULL, NULL, NULL),
('1b4f4009-8f41-4f1d-ba0b-ba3c4378200a', 'Общая информация', 'serial_number', 'Серийный номер', 'TEXT', 4, false, NULL, NULL, NULL),
('1b4f4009-8f41-4f1d-ba0b-ba3c4378200a', 'Общая информация', 'management_ip', 'Управляющий IP-адрес', 'IP_REFERENCE', 5, false, NULL, NULL, NULL),
('1b4f4009-8f41-4f1d-ba0b-ba3c4378200a', 'Общая информация', 'commissioned_at', 'Дата ввода в эксплуатацию', 'DATE', 6, false, NULL, NULL, NULL),

-- Блейд-сервер (equipment_type_codes.code = 'bl')
('38f98035-5eb7-4572-bdcf-184e735a1e31', 'Общая информация', 'rack', 'Стойка', 'OBJECT_REFERENCE', 1, true,
  'LOCATION', NULL, NULL),
('38f98035-5eb7-4572-bdcf-184e735a1e31', 'Общая информация', 'equipment_id', 'Идентификатор оборудования', 'AUTO_IDENTIFIER', 2, false,
  NULL, 'rack', (SELECT id FROM equipment_type_codes WHERE code = 'bl')),
('38f98035-5eb7-4572-bdcf-184e735a1e31', 'Общая информация', 'model', 'Модель', 'TEXT', 3, false, NULL, NULL, NULL),
('38f98035-5eb7-4572-bdcf-184e735a1e31', 'Общая информация', 'serial_number', 'Серийный номер', 'TEXT', 4, false, NULL, NULL, NULL),
('38f98035-5eb7-4572-bdcf-184e735a1e31', 'Общая информация', 'management_ip', 'Управляющий IP-адрес', 'IP_REFERENCE', 5, false, NULL, NULL, NULL),
('38f98035-5eb7-4572-bdcf-184e735a1e31', 'Общая информация', 'commissioned_at', 'Дата ввода в эксплуатацию', 'DATE', 6, false, NULL, NULL, NULL);

COMMIT;

-- Проверка результата — должно быть 4 строки по 6 полей:
-- SELECT ot.name, count(fd.id) FROM object_types ot
--   JOIN field_definitions fd ON fd.object_type_id = ot.id
--   WHERE ot.code IN ('switch','ups','disk_array','blade_server')
--   GROUP BY ot.name;
