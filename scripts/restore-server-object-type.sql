-- Восстанавливает тип паспорта "Сервер", случайно удалённый через
-- /object-types в приложении. Не трогает остальные четыре типа
-- (Коммутатор/ИБП/Дисковый массив/Блейд-сервер) — вставляет только строки,
-- относящиеся к "Серверу", с тем же фиксированным id, что и в исходном
-- scripts/seed-equipment-object-types.sql (фаза 4), чтобы результат был
-- идентичен тому, что было до удаления. Безопасно запускать даже если
-- "Сервер" уже существует — INSERT завершится ошибкой уникальности и
-- ничего не изменит (не перезапишет существующие данные).
--
-- Как запустить — так же, как и остальные сидеры:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком в открывшуюся сессию.

BEGIN;

INSERT INTO object_types (id, name, code, description)
VALUES
  ('19f79e80-a547-4604-a113-8bd42016249e', 'Сервер', 'server', 'Физический сервер, установленный в стойке.');

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required,
   reference_target_kind, auto_identifier_rack_field_key, auto_identifier_equipment_type_code_id)
VALUES
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'rack', 'Стойка', 'OBJECT_REFERENCE', 1, true,
  'LOCATION', NULL, NULL),
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'equipment_id', 'Идентификатор оборудования', 'AUTO_IDENTIFIER', 2, false,
  NULL, 'rack', (SELECT id FROM equipment_type_codes WHERE code = 'srv')),
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'model', 'Модель', 'TEXT', 3, false, NULL, NULL, NULL),
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'serial_number', 'Серийный номер', 'TEXT', 4, false, NULL, NULL, NULL),
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'management_ip', 'Управляющий IP-адрес', 'IP_REFERENCE', 5, false, NULL, NULL, NULL),
('19f79e80-a547-4604-a113-8bd42016249e', 'Общая информация', 'commissioned_at', 'Дата ввода в эксплуатацию', 'DATE', 6, false, NULL, NULL, NULL);

COMMIT;

-- Проверка результата — должно быть 6 строк:
-- SELECT fd.key, fd.label, fd.type FROM field_definitions fd
--   JOIN object_types ot ON ot.id = fd.object_type_id
--   WHERE ot.code = 'server' ORDER BY fd."order";
--
-- После этого выполните scripts/seed-phase5-rack-position-and-patch-cords.sql
-- как обычно — оно найдёт "server" по коду и добавит "Позицию в стойке" и
-- "Патч-корды" ко всем пяти типам, включая только что восстановленный.
