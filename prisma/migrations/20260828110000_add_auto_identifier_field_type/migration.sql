-- AlterEnum
ALTER TYPE "field_type" ADD VALUE 'AUTO_IDENTIFIER';

-- CreateTable
-- equipment_type_codes — admin-managed dictionary of equipment-type codes
-- used by AUTO_IDENTIFIER fields (CMDB phase 3), e.g. "cs" = Коммутатор,
-- per Table 2 of the Kazakhtelecom naming standard (ДИТ/И-05-28.2-16).
-- Seeded below with the 5 codes already named in this project's own design
-- doc (it-passports-design.md section 8.1) — the admin adds the rest of
-- Table 2 (and any future table) through the management page as needed,
-- rather than this migration guessing at labels it can't verify.
CREATE TABLE "equipment_type_codes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" text NOT NULL,
  "label" text NOT NULL,
  "order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "equipment_type_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "equipment_type_codes_code_key" ON "equipment_type_codes"("code");

INSERT INTO "equipment_type_codes" ("code", "label", "order") VALUES
  ('srv', 'Сервер', 0),
  ('cs', 'Коммутатор', 1),
  ('ups', 'ИБП', 2),
  ('da', 'Дисковый массив', 3),
  ('bl', 'Блейд-сервер', 4);

-- AlterTable
-- field_definitions — per-field config for AUTO_IDENTIFIER fields:
-- auto_identifier_rack_field_key names a sibling field on the same
-- ObjectType (must be OBJECT_REFERENCE targeting LOCATION) that supplies
-- the rack; auto_identifier_equipment_type_code_id is the fixed code this
-- field always generates identifiers with. Both null for every other
-- field type.
ALTER TABLE "field_definitions"
  ADD COLUMN "auto_identifier_rack_field_key" text,
  ADD COLUMN "auto_identifier_equipment_type_code_id" uuid;

ALTER TABLE "field_definitions"
  ADD CONSTRAINT "field_definitions_auto_identifier_equipment_type_code_id_fkey"
  FOREIGN KEY ("auto_identifier_equipment_type_code_id") REFERENCES "equipment_type_codes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "field_definitions_auto_identifier_equipment_type_code_id_idx"
  ON "field_definitions"("auto_identifier_equipment_type_code_id");

-- CreateTable
-- field_auto_identifier_values — real relational backing + uniqueness
-- guard for FieldType.AUTO_IDENTIFIER. One row per (passport, field),
-- recording exactly which rack + equipment-type code + sequence number
-- the currently-stored computed identifier was generated from. The
-- UNIQUE constraint on (target_location_id, equipment_type_code_id, seq)
-- is what actually prevents two passports from ever ending up with the
-- same identifier in the same rack. ON DELETE RESTRICT on both target FKs
-- mirrors field_object_reference_values: neither the rack nor the code
-- can be deleted while an identifier still depends on it. Unlike every
-- other reference/value table in this schema, the app deliberately never
-- deletes-and-recreates rows here on every passport save — see the
-- FieldAutoIdentifierValue doc comment in schema.prisma.
CREATE TABLE "field_auto_identifier_values" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "object_instance_id" uuid NOT NULL,
  "field_definition_id" uuid NOT NULL,
  "target_location_id" uuid NOT NULL,
  "equipment_type_code_id" uuid NOT NULL,
  "seq" integer NOT NULL,
  "value" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "field_auto_identifier_values_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "field_auto_identifier_values_object_instance_id_fkey"
    FOREIGN KEY ("object_instance_id") REFERENCES "object_instances"("id") ON DELETE CASCADE,
  CONSTRAINT "field_auto_identifier_values_field_definition_id_fkey"
    FOREIGN KEY ("field_definition_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE,
  CONSTRAINT "field_auto_identifier_values_target_location_id_fkey"
    FOREIGN KEY ("target_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT,
  CONSTRAINT "field_auto_identifier_values_equipment_type_code_id_fkey"
    FOREIGN KEY ("equipment_type_code_id") REFERENCES "equipment_type_codes"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "field_auto_identifier_values_object_instance_id_field_def_key"
  ON "field_auto_identifier_values"("object_instance_id", "field_definition_id");
CREATE UNIQUE INDEX "field_auto_identifier_values_location_code_seq_key"
  ON "field_auto_identifier_values"("target_location_id", "equipment_type_code_id", "seq");
CREATE INDEX "field_auto_identifier_values_target_location_id_idx"
  ON "field_auto_identifier_values"("target_location_id");
CREATE INDEX "field_auto_identifier_values_equipment_type_code_id_idx"
  ON "field_auto_identifier_values"("equipment_type_code_id");
