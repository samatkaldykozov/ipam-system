-- ТЕСТ-данные для проверки нового ограничения «строго один-к-одному»
-- (FieldDefinition.objectReferenceUniqueTarget, раздел 8.17) прямо на
-- боевом сервере — не только на теневой БД, где это уже проверялось.
--
-- Что заводит:
--   * ТЕСТ-Коммутатор-Порты — тестовый паспорт "Коммутатор" (минимальный,
--     без обязательных полей — вставлен напрямую SQL-ом в обход формы,
--     как и вся тестовая обвязка ниже; сам по себе паспорт этим не
--     сломан, просто пустой, его можно донаполнить позже или удалить).
--   * ТЕСТ-Порт-A-eth0 — на уже существующем ДЕМО-Сервер-01, "Связанный
--     порт" уже указывает на порт B ниже (та часть, что проверялась на
--     теневой БД).
--   * ТЕСТ-Порт-B-GE01 — на тестовом коммутаторе, уже занят портом A.
--   * ТЕСТ-Порт-C-GE02 — на тестовом коммутаторе, СВОБОДЕН и НЕ связан —
--     специально оставлен пустым, чтобы проверку можно было сделать
--     живьём через само приложение, а не через SQL.
--
-- Как проверить после запуска:
--   1. Зайти в /passports, открыть паспорт "ТЕСТ-Порт-C-GE02".
--   2. Нажать "Редактировать", в поле "Связанный порт" выбрать
--      "ТЕСТ-Порт-B-GE01" (тот, что уже занят портом A).
--   3. Нажать "Сохранить" — должна появиться ошибка вида:
--      «Связанный порт»: эта КЕ уже указана в этом же поле у другого
--      паспорта («ТЕСТ-Порт-A-eth0») — выберите другую.
--   Если ошибка появилась и сохранение не прошло — новое ограничение
--   реально работает на боевом сервере, не только в теневой проверке.
--
-- Как запустить — тем же способом, что и остальные сидеры:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое файла целиком.
--
-- Требует уже применённой миграции
-- 20260903100000_add_object_reference_unique_target и уже заведённого
-- типа "Порт/Интерфейс" (scripts/seed-network-port-object-type.sql), а
-- также существующего паспорта "ДЕМО-Сервер-01" (раздел 8.15/8.7).
--
-- Как удалить после проверки (одна команда — каскадно подчистит все
-- связанные строки, включая field_object_reference_values):
--   DELETE FROM object_instances WHERE name LIKE 'ТЕСТ-%';

BEGIN;

-- Тестовый коммутатор-владелец портов B и C
INSERT INTO object_instances (id, object_type_id, name, values)
VALUES (
  gen_random_uuid(),
  '6ba92ab4-33b0-46e4-9d30-5b2fbb310539',
  'ТЕСТ-Коммутатор-Порты',
  '{}'::jsonb
);

-- Порт B — на тестовом коммутаторе, статус "Занят"
INSERT INTO object_instances (id, object_type_id, name, values)
SELECT gen_random_uuid(), 'f7b0c7d1-9b64-406c-b888-852fa721f1e2', 'ТЕСТ-Порт-B-GE01',
  jsonb_build_object('equipment', sw.id::text, 'port_name', 'GE0/1', 'port_type', 'Физический', 'status', 'Занят')
FROM object_instances sw WHERE sw.name = 'ТЕСТ-Коммутатор-Порты';

-- Порт C — на тестовом коммутаторе, статус "Свободен", НЕ связан —
-- заполняется вручную через приложение при проверке
INSERT INTO object_instances (id, object_type_id, name, values)
SELECT gen_random_uuid(), 'f7b0c7d1-9b64-406c-b888-852fa721f1e2', 'ТЕСТ-Порт-C-GE02',
  jsonb_build_object('equipment', sw.id::text, 'port_name', 'GE0/2', 'port_type', 'Физический', 'status', 'Свободен')
FROM object_instances sw WHERE sw.name = 'ТЕСТ-Коммутатор-Порты';

-- Порт A — на уже существующем ДЕМО-Сервер-01, уже связан с портом B
INSERT INTO object_instances (id, object_type_id, name, values)
SELECT gen_random_uuid(), 'f7b0c7d1-9b64-406c-b888-852fa721f1e2', 'ТЕСТ-Порт-A-eth0',
  jsonb_build_object(
    'equipment', srv.id::text,
    'port_name', 'eth0',
    'port_type', 'Физический',
    'status', 'Занят',
    'connected_port', prt_b.id::text
  )
FROM object_instances srv, object_instances prt_b
WHERE srv.name = 'ДЕМО-Сервер-01' AND prt_b.name = 'ТЕСТ-Порт-B-GE01';

-- Реляционные зеркала (то, что реально запишет приложение при сохранении
-- формы) — "Оборудование" (CONTAINMENT) для всех трёх портов, "Связанный
-- порт" (ASSOCIATION) только для порта A → порта B.
INSERT INTO field_object_reference_values (id, object_instance_id, field_definition_id, target_object_instance_id, relationship_type)
SELECT gen_random_uuid(), p.id, fd.id, (p.values->>'equipment')::uuid, 'CONTAINMENT'
FROM object_instances p
JOIN field_definitions fd ON fd.object_type_id = p.object_type_id AND fd.key = 'equipment'
WHERE p.name IN ('ТЕСТ-Порт-A-eth0', 'ТЕСТ-Порт-B-GE01', 'ТЕСТ-Порт-C-GE02');

INSERT INTO field_object_reference_values (id, object_instance_id, field_definition_id, target_object_instance_id, relationship_type)
SELECT gen_random_uuid(), a.id, fd.id, (a.values->>'connected_port')::uuid, 'ASSOCIATION'
FROM object_instances a
JOIN field_definitions fd ON fd.object_type_id = a.object_type_id AND fd.key = 'connected_port'
WHERE a.name = 'ТЕСТ-Порт-A-eth0';

COMMIT;

-- Проверка результата (кто на кого ссылается):
-- SELECT oi.name AS "порт", forv.relationship_type, target.name AS "цель"
--   FROM field_object_reference_values forv
--   JOIN object_instances oi ON oi.id = forv.object_instance_id
--   JOIN object_instances target ON target.id = forv.target_object_instance_id
--   WHERE oi.name LIKE 'ТЕСТ-%'
--   ORDER BY oi.name;
