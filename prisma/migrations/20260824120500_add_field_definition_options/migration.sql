-- FieldDefinition.options: fixed list of choices for SELECT-type fields,
-- e.g. ["Монолит", "Микросервисная", "Гибрид"]. Analogous to the existing
-- tableColumns column, which already holds structural metadata for
-- TABLE-type fields as JSON — this is the same idea for SELECT.
-- Additive only: nullable, no default, doesn't touch existing rows or any
-- other table.
ALTER TABLE "field_definitions" ADD COLUMN "options" JSONB;
