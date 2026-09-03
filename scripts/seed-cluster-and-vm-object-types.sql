-- Кластеры виртуализации и виртуальные машины (см. docs/it-passports-design.md,
-- раздел 8.15) — заводит два новых типа паспорта: "Кластер виртуализации"
-- и "Виртуальная машина", используя новое поле VM_IDENTIFIER (миграция
-- 20260903090000_add_vm_identifier_field_type) для автоматически
-- вычисляемого идентификатора ВМ по формату
-- "код_кластера-код_ИС-роль-номер" (например, "prx1-biling-app-2") —
-- стандарт наименования Kazakhtelecom для виртуальных машин.
--
-- "Кластер виртуализации" — обычный тип паспорта, без единой строчки
-- нового кода приложения:
--   * "Платформа" (SELECT) — VMware/Proxmox/Hyper-V/KVM/Прочее.
--   * "Код кластера" (TEXT, обязательное) — короткий код вида "prx1",
--     который VM_IDENTIFIER читает напрямую с этого паспорта (см.
--     vm_identifier_cluster_code_field_key ниже) — вводится вручную,
--     как и остальные простые текстовые поля.
--   * "Узлы кластера" (TABLE) — один столбец "Узел", OBJECT_REFERENCE,
--     ограниченный типом "Сервер" (referenceObjectTypeId зафиксирован,
--     не "любой тип объекта" — сервер физически входит в кластер),
--     relationshipType = CONTAINMENT (тот же приём, что патч-корды и
--     бизнес-сервисы, фазы 5-6 и 8.13).
--
-- "Виртуальная машина" — единственный тип, использующий новое поле
-- VM_IDENTIFIER:
--   * "Кластер" (OBJECT_REFERENCE, обязательное) — ограничен типом
--     "Кластер виртуализации", relationshipType = DEPENDENCY: если
--     кластер выйдет из строя, все его ВМ пострадают — тот же
--     импакт-анализ (фаза 6, раздел 8.9), что уже отработан для бизнес-
--     сервисов (раздел 8.13), здесь просто ещё один источник DEPENDENCY-
--     рёбер, без единой новой строчки кода анализа.
--   * "Код информационной системы" (TEXT, обязательное) — вводится
--     вручную прямо на ВМ, не ссылка на паспорт КИС (решение обсуждено и
--     подтверждено явно — см. it-passports-design.md раздел 8.15).
--   * "Роль" (SELECT, обязательное) — фиксированный список. Значения
--     хранятся сразу в том виде, в котором подставляются в идентификатор
--     ("web"/"app"/"db"/"cache"/"balancer"/"other" — строчными латинскими
--     буквами), тем же приёмом, что коды типов оборудования для
--     AUTO_IDENTIFIER (equipment_type_codes.code) — не переводятся и не
--     нормализуются во время генерации, см. vm-identifier-utils.ts.
--   * "Идентификатор ВМ" (VM_IDENTIFIER) — вычисляется автоматически,
--     четыре sibling-field-key указывают на поля выше (cluster/is_code/
--     role) и на поле "Код кластера" на самом типе "Кластер виртуализации"
--     (vm_identifier_cluster_code_field_key — межтиповая ссылка, см.
--     доккомментарий в schema.prisma).
--   * "Операционная система" (TEXT), "Управляющий IP-адрес" (IP_REFERENCE),
--     "Дата ввода в эксплуатацию" (DATE) — тот же минимальный стартовый
--     комплект, что у пяти типов стоечного оборудования (фаза 4).
--
-- Как запустить — тем же способом, что и остальные сидеры этой папки:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком в открывшуюся сессию.
-- Требует уже применённой миграции 20260903090000_add_vm_identifier_field_type
-- и уже существующего типа паспорта "Сервер" (code = 'server', заведён
-- миграцией/сидером фазы 4 — scripts/seed-equipment-object-types.sql).
--
-- После выполнения оба типа появятся в /object-types (у Passport Admin) и
-- будут доступны при создании нового паспорта в /passports/new. Порядок
-- заполнения на практике: сначала завести паспорт "Кластер виртуализации"
-- (платформа, код кластера, узлы), затем паспорта "Виртуальная машина"
-- для него — идентификатор ВМ появится сразу после первого сохранения
-- паспорта ВМ.

BEGIN;

-- "Кластер виртуализации"
INSERT INTO object_types (id, name, code, description)
VALUES
  ('d808b07c-dfc4-492b-bb3b-1eb36234e182', 'Кластер виртуализации', 'virtualization_cluster',
   'Кластер серверов виртуализации (VMware/Proxmox/Hyper-V/KVM/...), на котором размещаются виртуальные машины.');

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required, options)
VALUES
  ('d808b07c-dfc4-492b-bb3b-1eb36234e182', 'Общая информация', 'platform', 'Платформа', 'SELECT', 1, false,
   '["VMware", "Proxmox", "Hyper-V", "KVM", "Прочее"]'::jsonb);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required)
VALUES
  ('d808b07c-dfc4-492b-bb3b-1eb36234e182', 'Общая информация', 'cluster_code', 'Код кластера', 'TEXT', 2, true);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required, table_columns)
VALUES
  ('d808b07c-dfc4-492b-bb3b-1eb36234e182', 'Состав', 'nodes', 'Узлы кластера', 'TABLE', 3, false,
   (SELECT jsonb_build_array(jsonb_build_object(
      'key', 'node',
      'label', 'Узел',
      'type', 'OBJECT_REFERENCE',
      'referenceTargetKind', 'OBJECT_TYPE',
      'referenceObjectTypeId', (SELECT id FROM object_types WHERE code = 'server'),
      'relationshipType', 'CONTAINMENT'
    ))));

-- "Виртуальная машина"
INSERT INTO object_types (id, name, code, description)
VALUES
  ('c68ada79-a874-45ff-a37b-ec42a2ad24a6', 'Виртуальная машина', 'virtual_machine',
   'Виртуальная машина, размещённая на кластере виртуализации.');

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required,
   reference_target_kind, reference_object_type_id, relationship_type)
VALUES
  ('c68ada79-a874-45ff-a37b-ec42a2ad24a6', 'Общая информация', 'cluster', 'Кластер', 'OBJECT_REFERENCE', 1, true,
   'OBJECT_TYPE', 'd808b07c-dfc4-492b-bb3b-1eb36234e182', 'DEPENDENCY');

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required)
VALUES
  ('c68ada79-a874-45ff-a37b-ec42a2ad24a6', 'Общая информация', 'is_code', 'Код информационной системы', 'TEXT', 2, true);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required, options)
VALUES
  ('c68ada79-a874-45ff-a37b-ec42a2ad24a6', 'Общая информация', 'role', 'Роль', 'SELECT', 3, true,
   '["web", "app", "db", "cache", "balancer", "other"]'::jsonb);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required,
   vm_identifier_cluster_field_key, vm_identifier_cluster_code_field_key,
   vm_identifier_is_code_field_key, vm_identifier_role_field_key)
VALUES
  ('c68ada79-a874-45ff-a37b-ec42a2ad24a6', 'Общая информация', 'vm_identifier', 'Идентификатор ВМ', 'VM_IDENTIFIER', 4, false,
   'cluster', 'cluster_code', 'is_code', 'role');

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required)
VALUES
  ('c68ada79-a874-45ff-a37b-ec42a2ad24a6', 'Общая информация', 'os', 'Операционная система', 'TEXT', 5, false);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required)
VALUES
  ('c68ada79-a874-45ff-a37b-ec42a2ad24a6', 'Общая информация', 'management_ip', 'Управляющий IP-адрес', 'IP_REFERENCE', 6, false);

INSERT INTO field_definitions
  (object_type_id, section_name, key, label, type, "order", required)
VALUES
  ('c68ada79-a874-45ff-a37b-ec42a2ad24a6', 'Общая информация', 'commissioned_at', 'Дата ввода в эксплуатацию', 'DATE', 7, false);

COMMIT;

-- Проверка результата:
-- SELECT ot.name, fd.section_name, fd.key, fd.label, fd.type, fd.required,
--        fd.reference_target_kind, fd.reference_object_type_id, fd.relationship_type,
--        fd.vm_identifier_cluster_field_key, fd.vm_identifier_cluster_code_field_key,
--        fd.vm_identifier_is_code_field_key, fd.vm_identifier_role_field_key,
--        fd.options, fd.table_columns
--   FROM field_definitions fd
--   JOIN object_types ot ON ot.id = fd.object_type_id
--   WHERE ot.code IN ('virtualization_cluster', 'virtual_machine')
--   ORDER BY ot.code, fd."order";
