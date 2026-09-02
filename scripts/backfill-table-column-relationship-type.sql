-- Опциональный скрипт для фазы 6 CMDB (связи + impact-анализ, см.
-- it-passports-design.md раздел 8.9). Не обязателен для работы
-- приложения — migration 20260901090000_add_relationship_type сама
-- бэкфилит relationship_type = 'ASSOCIATION' для уже существующих значений
-- в field_object_reference_values/table_cell_object_reference_values
-- (реляционных зеркалах), и код приложения (objectReferenceColumns в
-- object-reference-utils.ts) точно так же трактует отсутствующий
-- relationshipType в JSON-метаданных столбца как 'ASSOCIATION' на лету —
-- патч-корды и любые другие уже существующие столбцы OBJECT_REFERENCE
-- (цель — тип объекта) продолжат работать без этого скрипта.
--
-- Единственное, для чего он нужен: если админ откроет в конструкторе
-- (/object-types) уже существующее табличное поле вроде «Патч-корды»
-- (заведено фазой 5, scripts/seed-phase5-rack-position-and-patch-cords.sql)
-- и захочет его отредактировать, конструктор потребует явно выбрать «Тип
-- связи» для столбца «Устройство на другом конце» — это поле обязательно
-- для новых/редактируемых столбцов начиная с фазы 6 (см.
-- it-passports-design.md раздел 8.9), а в уже сохранённом JSON этого
-- ключа ещё нет. Этот скрипт один раз проставляет relationshipType =
-- 'ASSOCIATION' прямо в table_columns JSON для любого столбца
-- OBJECT_REFERENCE с целью OBJECT_TYPE, у которого этого ключа ещё нет —
-- так открыть и пересохранить такое поле в конструкторе можно будет сразу,
-- без явного выбора (при желании админ потом поменяет тип связи на более
-- точный — например, на «Связан с» уже и так означает ASSOCIATION, но для
-- поля вроде «Расположен на сервере» более точным было бы «Зависит от»).
--
-- Общий (не завязанный на конкретное имя поля «patch_cords») — находит
-- любое такое табличное поле в любом типе объекта, не только у пяти типов
-- оборудования фазы 4/5.
--
-- Как запустить — так же, как и остальные скрипты этой папки:
--   docker compose exec db psql -U postgres -d postgres
-- ...и вставить содержимое этого файла целиком в открывшуюся сессию.

BEGIN;

UPDATE field_definitions fd
SET table_columns = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'type' = 'OBJECT_REFERENCE'
        AND elem->>'referenceTargetKind' = 'OBJECT_TYPE'
        AND NOT (elem ? 'relationshipType')
      THEN elem || jsonb_build_object('relationshipType', 'ASSOCIATION')
      ELSE elem
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(fd.table_columns) WITH ORDINALITY AS t(elem, ord)
)
WHERE fd.type = 'TABLE'
  AND fd.table_columns IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(fd.table_columns) e
    WHERE e->>'type' = 'OBJECT_REFERENCE'
      AND e->>'referenceTargetKind' = 'OBJECT_TYPE'
      AND NOT (e ? 'relationshipType')
  );

COMMIT;

-- Проверка результата — у столбца remote_device (или любого другого
-- OBJECT_REFERENCE-с-OBJECT_TYPE столбца) должен появиться
-- "relationshipType": "ASSOCIATION":
-- SELECT ot.name, fd.label, fd.table_columns
--   FROM field_definitions fd JOIN object_types ot ON ot.id = fd.object_type_id
--   WHERE fd.type = 'TABLE';
