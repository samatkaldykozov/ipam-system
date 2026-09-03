-- ДЕМО-данные для демонстрации кластеров виртуализации и виртуальных машин
-- (см. it-passports-design.md, раздел 8.15). Создаёт полностью
-- изолированную тестовую цепочку — все названия начинаются с "ДЕМО-", чтобы
-- не путать с реальными данными и легко найти/удалить после демонстрации:
--
--   регион "ДЕМО" -> стойка "r01"
--     -> паспорт "Сервер" (ДЕМО-Сервер-01), идентификатор оборудования
--        сгенерирован по формуле стойки (см. ниже)
--       -> паспорт "Кластер виртуализации" (ДЕМО-Кластер-Proxmox-1),
--          в "Узлах кластера" содержит сервер выше (связь CONTAINMENT)
--         -> три паспорта "Виртуальная машина" на этом кластере (связь
--            DEPENDENCY): две с одинаковым кодом ИС+ролью — показывают
--            последовательную нумерацию (...-app-1, ...-app-2), третья —
--            другая ИС и роль.
--
-- Как запустить — тем же способом, что и остальные сидеры этой папки:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком.
--
-- Требует уже применённой миграции 20260903090000_add_vm_identifier_field_type
-- и уже заведённых типов паспортов "Сервер" (scripts/seed-equipment-object-
-- types.sql, фаза 4) и "Кластер виртуализации"/"Виртуальная машина"
-- (scripts/seed-cluster-and-vm-object-types.sql).
--
-- Идентификатор оборудования сервера и идентификаторы ВМ вычислены здесь
-- вручную, но по тем же формулам и с теми же зеркальными таблицами
-- (field_auto_identifier_values / field_vm_identifier_values), что и обычное
-- сохранение паспорта через форму (см. auto-identifier-utils.ts,
-- vm-identifier-utils.ts) — итог неотличим от того, что получилось бы,
-- заполни их вручную через /passports/new.
--
-- Чтобы удалить всю демо-цепочку одним запросом после демонстрации
-- (порядок важен — сначала объекты, потом локации, из-за ON DELETE RESTRICT
-- на стойке, пока на неё ссылается сервер):
--   DELETE FROM object_instances WHERE name LIKE 'ДЕМО-%';
--   DELETE FROM locations WHERE code IN ('demo', 'r01');

BEGIN;

-- 1. Демо-локация: регион "ДЕМО" -> стойка "r01"
INSERT INTO locations (id, parent_id, kind, name, code)
VALUES (gen_random_uuid(), NULL, 'REGION', 'ДЕМО-регион', 'demo');

INSERT INTO locations (id, parent_id, kind, name, code, rack_units)
SELECT gen_random_uuid(), id, 'RACK', 'ДЕМО-стойка-01', 'r01', 42
FROM locations WHERE code = 'demo' AND kind = 'REGION';

-- 2. Демо-сервер (КЕ "Сервер") в этой стойке. Идентификатор оборудования —
--    "{регион}-{стойка}-{код}-{номер}" = "demo-r01-srv-1" (стойка новая,
--    поэтому номер гарантированно 1 — не нужно смотреть на существующие
--    данные).
INSERT INTO object_instances (id, object_type_id, name, values)
SELECT
  gen_random_uuid(),
  '19f79e80-a547-4604-a113-8bd42016249e',
  'ДЕМО-Сервер-01',
  jsonb_build_object(
    'rack', l.id::text,
    'equipment_id', 'demo-r01-srv-1',
    'model', 'Dell PowerEdge R740',
    'serial_number', 'SN-DEMO-0001',
    'commissioned_at', '2026-09-03'
  )
FROM locations l WHERE l.code = 'r01' AND l.kind = 'RACK';

INSERT INTO field_object_reference_values
  (id, object_instance_id, field_definition_id, target_location_id)
SELECT gen_random_uuid(), oi.id, fd.id, l.id
FROM object_instances oi
JOIN field_definitions fd ON fd.object_type_id = oi.object_type_id AND fd.key = 'rack'
JOIN locations l ON l.code = 'r01' AND l.kind = 'RACK'
WHERE oi.name = 'ДЕМО-Сервер-01';

INSERT INTO field_auto_identifier_values
  (id, object_instance_id, field_definition_id, target_location_id, equipment_type_code_id, seq, value)
SELECT gen_random_uuid(), oi.id, fd.id, l.id, etc.id, 1, 'demo-r01-srv-1'
FROM object_instances oi
JOIN field_definitions fd ON fd.object_type_id = oi.object_type_id AND fd.key = 'equipment_id'
JOIN locations l ON l.code = 'r01' AND l.kind = 'RACK'
JOIN equipment_type_codes etc ON etc.code = 'srv'
WHERE oi.name = 'ДЕМО-Сервер-01';

-- 3. Демо-кластер виртуализации, с сервером выше в "Узлах кластера"
INSERT INTO object_instances (id, object_type_id, name, values)
VALUES (
  gen_random_uuid(),
  'd808b07c-dfc4-492b-bb3b-1eb36234e182',
  'ДЕМО-Кластер-Proxmox-1',
  jsonb_build_object('platform', 'Proxmox', 'cluster_code', 'prx1')
);

INSERT INTO table_field_rows (id, object_instance_id, field_definition_id, row_order, cells)
SELECT gen_random_uuid(), oi.id, fd.id, 0, jsonb_build_object('node', srv.id::text)
FROM object_instances oi
JOIN field_definitions fd ON fd.object_type_id = oi.object_type_id AND fd.key = 'nodes'
JOIN object_instances srv ON srv.name = 'ДЕМО-Сервер-01'
WHERE oi.name = 'ДЕМО-Кластер-Proxmox-1';

INSERT INTO table_cell_object_reference_values
  (id, table_field_row_id, column_key, target_object_instance_id, relationship_type)
SELECT gen_random_uuid(), tfr.id, 'node', srv.id, 'CONTAINMENT'
FROM table_field_rows tfr
JOIN object_instances cl ON cl.id = tfr.object_instance_id AND cl.name = 'ДЕМО-Кластер-Proxmox-1'
JOIN object_instances srv ON srv.name = 'ДЕМО-Сервер-01';

-- 4. Три демо-ВМ на этом кластере: две с одинаковым кодом ИС+ролью
--    (последовательная нумерация "...-app-1"/"...-app-2"), третья — другая
--    ИС и роль.
INSERT INTO object_instances (id, object_type_id, name, values)
SELECT
  gen_random_uuid(), 'c68ada79-a874-45ff-a37b-ec42a2ad24a6', v.vm_name,
  jsonb_build_object(
    'cluster', cl.id::text,
    'is_code', v.is_code,
    'role', v.role,
    'vm_identifier', v.vm_identifier,
    'os', v.os,
    'commissioned_at', '2026-09-03'
  )
FROM (VALUES
  ('ДЕМО-ВМ-Биллинг-App-1', 'biling', 'app', 1, 'prx1-biling-app-1', 'Ubuntu 22.04 LTS'),
  ('ДЕМО-ВМ-Биллинг-App-2', 'biling', 'app', 2, 'prx1-biling-app-2', 'Ubuntu 22.04 LTS'),
  ('ДЕМО-ВМ-CRM-DB-1',      'crm',    'db',  1, 'prx1-crm-db-1',     'CentOS 7')
) AS v(vm_name, is_code, role, seq, vm_identifier, os)
CROSS JOIN (SELECT id FROM object_instances WHERE name = 'ДЕМО-Кластер-Proxmox-1') cl;

INSERT INTO field_object_reference_values
  (id, object_instance_id, field_definition_id, target_object_instance_id, relationship_type)
SELECT gen_random_uuid(), vm.id, fd.id, cl.id, 'DEPENDENCY'
FROM object_instances vm
JOIN field_definitions fd ON fd.object_type_id = vm.object_type_id AND fd.key = 'cluster'
JOIN object_instances cl ON cl.name = 'ДЕМО-Кластер-Proxmox-1'
WHERE vm.name LIKE 'ДЕМО-ВМ-%';

INSERT INTO field_vm_identifier_values
  (id, object_instance_id, field_definition_id, target_cluster_instance_id, is_code, role, seq, value)
SELECT gen_random_uuid(), vm.id, fd.id, cl.id, v.is_code, v.role, v.seq, v.vm_identifier
FROM (VALUES
  ('ДЕМО-ВМ-Биллинг-App-1', 'biling', 'app', 1, 'prx1-biling-app-1'),
  ('ДЕМО-ВМ-Биллинг-App-2', 'biling', 'app', 2, 'prx1-biling-app-2'),
  ('ДЕМО-ВМ-CRM-DB-1',      'crm',    'db',  1, 'prx1-crm-db-1')
) AS v(vm_name, is_code, role, seq, vm_identifier)
JOIN object_instances vm ON vm.name = v.vm_name
JOIN field_definitions fd ON fd.object_type_id = vm.object_type_id AND fd.key = 'vm_identifier'
JOIN object_instances cl ON cl.name = 'ДЕМО-Кластер-Proxmox-1';

COMMIT;

-- Проверка результата:
-- SELECT ot.name AS type, oi.name, oi.values
--   FROM object_instances oi JOIN object_types ot ON ot.id = oi.object_type_id
--   WHERE oi.name LIKE 'ДЕМО-%' ORDER BY oi.created_at;
