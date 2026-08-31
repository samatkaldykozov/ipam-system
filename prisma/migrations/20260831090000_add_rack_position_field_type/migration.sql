-- CMDB phase 5 (see docs/it-passports-design.md section 8.8) — rack
-- elevation visualization. Two additions, both required by the new
-- RACK_POSITION field type and the rack-elevation page:
--
-- 1. locations.rack_units — total capacity in U, set by the admin on a
--    RACK-kind node. Nullable: NULL means "not set yet", the
--    rack-elevation page asks the admin to fill it in rather than
--    guessing a default.
-- 2. field_type gets a new value RACK_POSITION, and field_definitions
--    gets rack_position_rack_field_key — the sibling OBJECT_REFERENCE
--    field (by key, not id — same reasoning as
--    auto_identifier_rack_field_key, see schema.prisma) that supplies the
--    rack a RACK_POSITION field's value is relative to.
--
-- No new tables: unlike IP_REFERENCE/OBJECT_REFERENCE/AUTO_IDENTIFIER,
-- RACK_POSITION values are advisory (start unit + height typed by hand),
-- not hard links needing a relational mirror with a real FK — overlap and
-- over-capacity detection happens by scanning at render time on the
-- rack-elevation page, not by a uniqueness constraint at write time. See
-- the FieldType.RACK_POSITION doc comment in schema.prisma for the
-- reasoning.

ALTER TABLE "locations" ADD COLUMN "rack_units" INTEGER;

ALTER TYPE "field_type" ADD VALUE 'RACK_POSITION';

ALTER TABLE "field_definitions" ADD COLUMN "rack_position_rack_field_key" TEXT;
