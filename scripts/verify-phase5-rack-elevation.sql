-- Проверочный набор для Фазы 5 CMDB (см. it-passports-design.md, раздел 8.8) —
-- создаёт тестовую стойку и четыре тестовых паспорта оборудования, чтобы
-- наглядно проверить страницу раскладки стойки и патч-корды, не создавая
-- ничего вручную через интерфейс.
--
-- ВАЖНО: запускать ПОСЛЕ scripts/seed-equipment-object-types.sql (фаза 4) и
-- scripts/seed-phase5-rack-position-and-patch-cords.sql (фаза 5) — этот
-- скрипт использует уже заведённый ими тип "Сервер" и его поля.
--
-- Как запустить — тем же способом, что и предыдущие сидеры:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком в открывшуюся сессию.
--
-- Что создаётся:
--   - Локация "ТЕСТ — Стойка проверки фазы 5" (42U, можно удалить после
--     проверки — см. блок очистки в самом конце файла, закомментирован)
--   - "ТЕСТ — Сервер А" — юниты 10-11, всё в порядке
--   - "ТЕСТ — Сервер Б (пересечение)" — юнит 11, пересекается с Сервером А
--   - "ТЕСТ — Сервер В (превышение вместимости)" — юниты 41-45, выходит за
--     пределы стойки (она на 42U)
--   - "ТЕСТ — Сервер Г (без позиции)" — привязан к стойке, но без заполненной
--     "Позиции в стойке"
--   - У "Сервера А" заполнен патч-корд, ведущий к "Серверу Б"
--
-- Как проверить результат:
--   1. Откройте /locations, найдите "ТЕСТ — Стойка проверки фазы 5",
--      нажмите "View rack elevation".
--   2. На схеме должны быть видны Сервер А, Б и В на своих юнитах; Сервер Б
--      наложен на Сервер А в юните 11 (в отдельной "дорожке"); красным
--      должно быть выделено предупреждение про пересечение в юните 11 и про
--      то, что "Сервер В" выходит за пределы стойки.
--   3. Внизу страницы — отдельный список "Без указанной позиции" с
--      "Сервером Г".
--   4. Откройте карточку паспорта "ТЕСТ — Сервер А" (клик по нему на схеме
--      или через /passports) — в разделе "Патч-корды" должна быть строка
--      с портом Gi0/1, устройством "ТЕСТ — Сервер Б" и портом Gi0/2.

BEGIN;

INSERT INTO locations (id, kind, name, code, rack_units)
VALUES (
  'aaaaaaaa-0000-4000-8000-000000000001',
  'RACK',
  'ТЕСТ — Стойка проверки фазы 5',
  'TEST-RACK-P5',
  42
);

DO $$
DECLARE
  server_type_id uuid;
  rack_field_id uuid;
  patch_field_id uuid;
  rack_id uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  inst_a uuid := 'aaaaaaaa-0000-4000-8000-0000000000a1';
  inst_b uuid := 'aaaaaaaa-0000-4000-8000-0000000000a2';
  inst_c uuid := 'aaaaaaaa-0000-4000-8000-0000000000a3';
  inst_d uuid := 'aaaaaaaa-0000-4000-8000-0000000000a4';
  patch_row_id uuid := 'aaaaaaaa-0000-4000-8000-0000000000b1';
BEGIN
  SELECT id INTO server_type_id FROM object_types WHERE code = 'server';
  IF server_type_id IS NULL THEN
    RAISE EXCEPTION 'Тип объекта "Сервер" не найден — сначала выполните scripts/seed-equipment-object-types.sql';
  END IF;

  SELECT id INTO rack_field_id FROM field_definitions
    WHERE object_type_id = server_type_id AND key = 'rack';
  SELECT id INTO patch_field_id FROM field_definitions
    WHERE object_type_id = server_type_id AND key = 'patch_cords';
  IF rack_field_id IS NULL OR patch_field_id IS NULL THEN
    RAISE EXCEPTION 'Поля "rack"/"patch_cords" не найдены — сначала выполните scripts/seed-phase5-rack-position-and-patch-cords.sql';
  END IF;

  INSERT INTO object_instances (id, object_type_id, name, values)
  VALUES
    (inst_a, server_type_id, 'ТЕСТ — Сервер А', jsonb_build_object('rack_position', '10:2')),
    (inst_b, server_type_id, 'ТЕСТ — Сервер Б (пересечение)', jsonb_build_object('rack_position', '11:1')),
    (inst_c, server_type_id, 'ТЕСТ — Сервер В (превышение вместимости)', jsonb_build_object('rack_position', '41:5')),
    (inst_d, server_type_id, 'ТЕСТ — Сервер Г (без позиции)', '{}'::jsonb);

  INSERT INTO field_object_reference_values (object_instance_id, field_definition_id, target_location_id)
  VALUES
    (inst_a, rack_field_id, rack_id),
    (inst_b, rack_field_id, rack_id),
    (inst_c, rack_field_id, rack_id),
    (inst_d, rack_field_id, rack_id);

  -- Патч-корд: Сервер А, порт Gi0/1 -> Сервер Б, порт Gi0/2
  INSERT INTO table_field_rows (id, object_instance_id, field_definition_id, row_order, cells)
  VALUES (
    patch_row_id, inst_a, patch_field_id, 0,
    jsonb_build_object(
      'local_port', 'Gi0/1',
      'remote_device', inst_b,
      'remote_port', 'Gi0/2'
    )
  );

  INSERT INTO table_cell_object_reference_values (table_field_row_id, column_key, target_object_instance_id)
  VALUES (patch_row_id, 'remote_device', inst_b);
END $$;

COMMIT;

-- ─────────────────────────────────────────────
-- Очистка после проверки (по желанию) — раскомментируйте и вставьте
-- отдельно, когда всё проверено и тестовые объекты больше не нужны.
--
-- Порядок важен и именно такой (проверено): "Сервер А" нужно удалить ПЕРВЫМ,
-- отдельной командой — он владеет строкой патч-корда, которая ссылается на
-- "Сервер Б", а эта ссылка (ON DELETE RESTRICT) блокирует удаление "Сервера
-- Б", пока строка жива; удаление "Сервера А" каскадно убирает и саму
-- строку. Если попытаться удалить все четыре паспорта одной командой,
-- Postgres откажет ошибкой внешнего ключа на "Сервере Б".
-- ─────────────────────────────────────────────

-- DELETE FROM object_instances WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a1';
-- DELETE FROM object_instances WHERE id IN (
--   'aaaaaaaa-0000-4000-8000-0000000000a2',
--   'aaaaaaaa-0000-4000-8000-0000000000a3',
--   'aaaaaaaa-0000-4000-8000-0000000000a4'
-- );
-- DELETE FROM locations WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';
