-- AlterEnum
ALTER TYPE "field_type" ADD VALUE 'OBJECT_REFERENCE';

-- CreateEnum
CREATE TYPE "reference_target_kind" AS ENUM ('LOCATION', 'OBJECT_TYPE');

-- AlterTable
-- field_definitions — per-field config for OBJECT_REFERENCE fields: which
-- kind of object the field may point to (reference_target_kind), and, when
-- that kind is OBJECT_TYPE, which ObjectType the picker/validation is
-- restricted to (reference_object_type_id). Both null for every other
-- field type.
ALTER TABLE "field_definitions"
  ADD COLUMN "reference_target_kind" "reference_target_kind",
  ADD COLUMN "reference_object_type_id" UUID;

ALTER TABLE "field_definitions"
  ADD CONSTRAINT "field_definitions_reference_object_type_id_fkey"
  FOREIGN KEY ("reference_object_type_id") REFERENCES "object_types"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "field_definitions_reference_object_type_id_idx"
  ON "field_definitions"("reference_object_type_id");

-- CreateTable
-- field_object_reference_values — real relational backing for
-- FieldType.OBJECT_REFERENCE, generalizing field_ip_address_values (see
-- migration 20260826090000_add_ip_reference_field_type) from IpAddress
-- targets to any CMDB object: either a Location tree node or another
-- passport (ObjectInstance). Exactly one of target_location_id /
-- target_object_instance_id is set per row — enforced by the CHECK
-- constraint below, since Prisma's schema language has no first-class way
-- to express that (see the FieldObjectReferenceValue doc comment in
-- schema.prisma). ON DELETE RESTRICT on both target FKs is what actually
-- stops an in-use Location/passport from being deleted at the database
-- level; the app-side delete guards (deleteLocation, deletePassport) check
-- this proactively for a friendly error first.
CREATE TABLE "field_object_reference_values" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "object_instance_id" uuid NOT NULL,
  "field_definition_id" uuid NOT NULL,
  "target_location_id" uuid,
  "target_object_instance_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "field_object_reference_values_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "field_object_reference_values_object_instance_id_fkey"
    FOREIGN KEY ("object_instance_id") REFERENCES "object_instances"("id") ON DELETE CASCADE,
  CONSTRAINT "field_object_reference_values_field_definition_id_fkey"
    FOREIGN KEY ("field_definition_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE,
  CONSTRAINT "field_object_reference_values_target_location_id_fkey"
    FOREIGN KEY ("target_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT,
  CONSTRAINT "field_object_reference_values_target_object_instance_id_fkey"
    FOREIGN KEY ("target_object_instance_id") REFERENCES "object_instances"("id") ON DELETE RESTRICT,
  CONSTRAINT "field_object_reference_values_target_check"
    CHECK (
      ("target_location_id" IS NOT NULL AND "target_object_instance_id" IS NULL)
      OR
      ("target_location_id" IS NULL AND "target_object_instance_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "field_object_reference_values_object_instance_id_field_de_key"
  ON "field_object_reference_values"("object_instance_id", "field_definition_id");
CREATE INDEX "field_object_reference_values_target_location_id_idx"
  ON "field_object_reference_values"("target_location_id");
CREATE INDEX "field_object_reference_values_target_object_instance_id_idx"
  ON "field_object_reference_values"("target_object_instance_id");

-- CreateTable
-- table_cell_object_reference_values — table-column counterpart of
-- field_object_reference_values above, the same way
-- table_cell_ip_address_values (migration
-- 20260827090000_add_table_cell_ip_address_values) is the table-column
-- counterpart of field_ip_address_values. Same mutually-exclusive-target
-- CHECK constraint, keyed by (table_field_row_id, column_key) instead.
CREATE TABLE "table_cell_object_reference_values" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "table_field_row_id" uuid NOT NULL,
  "column_key" text NOT NULL,
  "target_location_id" uuid,
  "target_object_instance_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "table_cell_object_reference_values_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "table_cell_object_reference_values_table_field_row_id_fkey"
    FOREIGN KEY ("table_field_row_id") REFERENCES "table_field_rows"("id") ON DELETE CASCADE,
  CONSTRAINT "table_cell_object_reference_values_target_location_id_fkey"
    FOREIGN KEY ("target_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT,
  CONSTRAINT "table_cell_object_reference_values_target_object_instance__fkey"
    FOREIGN KEY ("target_object_instance_id") REFERENCES "object_instances"("id") ON DELETE RESTRICT,
  CONSTRAINT "table_cell_object_reference_values_target_check"
    CHECK (
      ("target_location_id" IS NOT NULL AND "target_object_instance_id" IS NULL)
      OR
      ("target_location_id" IS NULL AND "target_object_instance_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "table_cell_object_reference_values_table_field_row_id_col_key"
  ON "table_cell_object_reference_values"("table_field_row_id", "column_key");
CREATE INDEX "table_cell_object_reference_values_target_location_id_idx"
  ON "table_cell_object_reference_values"("target_location_id");
CREATE INDEX "table_cell_object_reference_values_target_object_instance__idx"
  ON "table_cell_object_reference_values"("target_object_instance_id");
