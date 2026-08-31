-- Фаза 4 CMDB (см. docs/it-passports-design.md, раздел 8) — заводит пять
-- типов паспортов для стоечного оборудования (Сервер, Коммутатор, ИБП,
-- Дисковый массив, Блейд-сервер), используя уже готовые поля из фаз 2-3:
-- у каждого типа есть поле "Стойка" (OBJECT_REFERENCE → дерево локаций) и
-- поле "Идентификатор оборудования" (AUTO_IDENTIFIER, привязанное к полю
-- "Стойка" и к соответствующему коду в equipment_type_codes — srv/cs/ups/
-- da/bl, уже засеяны миграцией 20260828110000_add_auto_identifier_field_type).
--
-- Набор полей — сознательно минимальный стартовый комплект, общий для
-- всех пяти типов (Стойка, Идентификатор, Модель, Серийный номер,
-- Управляющий IP-адрес, Дата ввода в эксплуатацию), без придуманных
-- технических характеристик под конкретное «железо» — их проще и точнее
-- добавить потом через уже готовый конструктор форм (/object-types) под
-- реальные требования, чем угадывать здесь. "Название" паспорта — базовая
-- колонка object_instances.name, не FieldDefinition, поэтому отдельного
-- поля для него заводить не нужно (см. it-passports-design.md, раздел 2).
--
-- Как запустить (на сервере, тем же способом, что и предыдущие два сидера
-- в этой папке — scripts/seed-kis-passport-type.sql,
-- scripts/seed-db-passport-type.sql):
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком в открывшуюся сессию.
--
-- После выполнения все пять типов появятся в /object-types (у Passport
-- Admin) и будут доступны для выбора при создании нового паспорта в
-- /passports/new. Поля "Стойка" обязательны (required = true) — без
-- стойки идентификатор нечего вычислять. У поля "Идентификатор
-- оборудования" required всегда false технически (см.
-- validateAutoIdentifierRackValues в auto-identifier-utils.ts — сама
-- логика требует заполненную стойку до сохранения, отдельный флаг
-- required был бы избыточен), редактировать его нельзя — оно вычисляется
-- сервером.

BEGIN;

INSERT INTO object_types (id, name, code, description)
VALUES
  ('19f79e80-a547-4604-a113-8bd42016249e', 'Сервер', 'server', 'Физический сервер, установленный в стойке.'),
  ('6ba92ab4-33b0-46e4-9d30-5b2fbb310539', 'Коммутатор', 'switch', 'Сетевой коммутатор, установленный в стойке.'),
  ('11d07a14-f4a7-4975-80e6-982d4beb9fbe', 'ИБП', 'ups', 'Источник бесперебойного питания, установленный в стойке.'),
  ('1b4f4009-8f41-4f1d-ba0b-ba3c4378200a', 'Дисковый массив', 'disk_array', 'Дисковый массив (СХД), установленный в стойке.'),
  ('38f98035-5eb7-4572-bdcf-184e735a1e31', 'Блейд-сервер', 'blade_server', 'Блейд-сервер, установленный в стойке.');

-- Общий комплект полей для каждого из пяти типов. auto_identifier_*
-- колонки заполняются через подзапрос к equipment_type_codes по code —
-- так же, как конструктор форм резолвит код в UI, только здесь один раз,
-- вручную.

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required,
   reference_target_kind, auto_identifier_rack_field_key, auto_identifier_equipment_type_code_id)
VALUES
-- Сервер (equipment_type_codes.code = 'srv')
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'rack', 'Стойка', 'OBJECT_REFERENCE', 1, true,
  'LOCATION', NULL, NULL),
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'equipment_id', 'Идентификатор оборудования', 'AUTO_IDENTIFIER', 2, false,
  NULL, 'rack', (SELECT id FROM equipment_type_codes WHERE code = 'srv')),
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'model', 'Модель', 'TEXT', 3, false, NULL, NULL, NULL),
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'serial_number', 'Серийный номер', 'TEXT', 4, false, NULL, NULL, NULL),
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'management_ip', 'Управляющий IP-адрес', 'IP_REFERENCE', 5, false, NULL, NULL, NULL),
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'commissioned_at', 'Дата ввода в эксплуатацию', 'DATE', 6, false, NULL, NULL, NULL),

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

-- Проверка результата:
-- SELECT ot.name, fd.section_name, fd.key, fd.label, fd.type, fd.required
--   FROM field_definitions fd
--   JOIN object_types ot ON ot.id = fd.object_type_id
--   WHERE ot.code IN ('server','switch','ups','disk_array','blade_server')
--   ORDER BY ot.name, fd."order";
--
-- Проверка, что auto_identifier_equipment_type_code_id везде проставился
-- (не NULL) — если у AUTO_IDENTIFIER-поля здесь NULL, значит подзапрос по
-- code не нашёл строку в equipment_type_codes (проверьте, что миграция
-- 20260828110000_add_auto_identifier_field_type была применена и её сиды
-- на месте):
-- SELECT ot.name, fd.label, fd.auto_identifier_equipment_type_code_id
--   FROM field_definitions fd JOIN object_types ot ON ot.id = fd.object_type_id
--   WHERE fd.type = 'AUTO_IDENTIFIER' AND ot.code IN ('server','switch','ups','disk_array','blade_server');
