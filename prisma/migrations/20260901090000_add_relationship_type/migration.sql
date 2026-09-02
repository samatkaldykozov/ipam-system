-- CreateEnum
-- relationship_type — the ITIL/CMDB five-type relationship taxonomy
-- (CONTAINMENT/DEPENDENCY/ASSOCIATION/OWNERSHIP/IMPACT), see schema.prisma's
-- RelationshipType doc comment. Applies only to OBJECT_REFERENCE
-- fields/columns whose target is another passport (reference_target_kind =
-- OBJECT_TYPE), never to LOCATION-target ones (always containment,
-- structural, not stored as this enum).
CREATE TYPE "relationship_type" AS ENUM (
  'CONTAINMENT',
  'DEPENDENCY',
  'ASSOCIATION',
  'OWNERSHIP',
  'IMPACT'
);

-- AlterTable
-- field_definitions — one relationship_type per OBJECT_REFERENCE field,
-- chosen once by the admin (see FieldDefinition.relationshipType doc
-- comment). Backfilled below for existing OBJECT_TYPE-target fields (the
-- only ones this column is meaningful for) to the safest generic default,
-- ASSOCIATION — the admin can revisit the choice per field afterward in the
-- constructor; LOCATION-target fields are left NULL, matching how they'll
-- stay forever (containment via the location tree doesn't use this enum).
ALTER TABLE "field_definitions"
  ADD COLUMN "relationship_type" "relationship_type";

UPDATE "field_definitions"
  SET "relationship_type" = 'ASSOCIATION'
  WHERE "type" = 'OBJECT_REFERENCE' AND "reference_target_kind" = 'OBJECT_TYPE';

-- AlterTable
-- field_object_reference_values — denormalized copy of the owning field's
-- relationship_type (see the doc comment on this column in schema.prisma
-- for why it's copied here rather than joined at read time). Backfilled
-- directly from the row's own target_object_instance_id (no join needed for
-- the backfill either) to the same ASSOCIATION default as above.
ALTER TABLE "field_object_reference_values"
  ADD COLUMN "relationship_type" "relationship_type";

UPDATE "field_object_reference_values"
  SET "relationship_type" = 'ASSOCIATION'
  WHERE "target_object_instance_id" IS NOT NULL;

-- AlterTable
-- table_cell_object_reference_values — same denormalized copy, table-column
-- counterpart.
ALTER TABLE "table_cell_object_reference_values"
  ADD COLUMN "relationship_type" "relationship_type";

UPDATE "table_cell_object_reference_values"
  SET "relationship_type" = 'ASSOCIATION'
  WHERE "target_object_instance_id" IS NOT NULL;

-- Index to support getImpactAnalysis (passports/actions.ts) scanning every
-- DEPENDENCY edge in the system without a full table scan.
CREATE INDEX "field_object_reference_values_relationship_type_idx"
  ON "field_object_reference_values"("relationship_type");
CREATE INDEX "table_cell_object_reference_values_relationship_type_idx"
  ON "table_cell_object_reference_values"("relationship_type");
