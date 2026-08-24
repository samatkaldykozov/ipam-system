-- Add the "Паспорта ИТ-объектов" (IT-object passports) module.
--
-- Design: docs/it-passports-design.md. Admins define arbitrary passport
-- types (object_types) through a form builder instead of each new kind of
-- passport needing its own tables/code. Ordinary field values for a filled
-- passport live in object_instances.values (jsonb, keyed by the field's
-- key) rather than a per-field EAV table — see the design doc, section 2,
-- for why (JSONB beats EAV at this scale: single-row reads, native typing,
-- ~3x less storage). Everything here is additive — no existing IPAM table
-- is touched beyond adding two new columns to roles/users.

-- 1. Role scope: separates roles that apply to the IPAM branch of the app
--    from roles that apply to the Паспорта branch, so a user can hold one
--    of each independently.
CREATE TYPE "role_scope" AS ENUM ('IPAM', 'PASSPORT');

ALTER TABLE "roles"
  ADD COLUMN IF NOT EXISTS "scope" "role_scope" NOT NULL DEFAULT 'IPAM';

CREATE INDEX IF NOT EXISTS "roles_scope_idx" ON "roles"("scope");

-- 2. A second, independent role assignment on users for the Паспорта
--    branch (existing "role_id" keeps meaning "role in IPAM").
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "passport_role_id" uuid;

ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_passport_role_id_fkey";

ALTER TABLE "users"
  ADD CONSTRAINT "users_passport_role_id_fkey"
  FOREIGN KEY ("passport_role_id") REFERENCES "roles"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "users_passport_role_id_idx" ON "users"("passport_role_id");

-- 3. Seed the three Паспорта-scope roles. IPAM's existing three roles
--    (Admin / Network Engineer / Viewer) already default to scope='IPAM'
--    from the column default above — no data migration needed for them.
INSERT INTO "roles" ("id", "name", "description", "scope")
VALUES
  (gen_random_uuid(), 'Passport Admin', 'Full access to IT-object passports: form builder (object types/fields) and all passport records.', 'PASSPORT'),
  (gen_random_uuid(), 'Passport Manager', 'Can create and edit IT-object passports.', 'PASSPORT'),
  (gen_random_uuid(), 'Passport Guest', 'Read-only access to IT-object passports, subject to per-field visibility.', 'PASSPORT')
ON CONFLICT ("name") DO NOTHING;

-- 4. Field type enum for the form builder.
CREATE TYPE "field_type" AS ENUM ('TEXT', 'LONG_TEXT', 'DATE', 'BOOLEAN', 'LINK', 'SELECT', 'TABLE');

-- 5. object_types — admin-defined kinds of passport (Паспорт КИС, Паспорт
--    БД, ЦОД, ДГУ, ...).
CREATE TABLE "object_types" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "code" text NOT NULL,
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "object_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "object_types_name_key" ON "object_types"("name");
CREATE UNIQUE INDEX "object_types_code_key" ON "object_types"("code");

-- 6. field_definitions — one field inside an object type, defined through
--    the form builder. table_columns is only used when type = 'TABLE': the
--    column layout of that repeating table, stored as JSON since it's
--    small, admin-managed schema metadata rather than per-instance data.
CREATE TABLE "field_definitions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "object_type_id" uuid NOT NULL,
  "section_name" text,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "type" "field_type" NOT NULL,
  "order" integer NOT NULL DEFAULT 0,
  "required" boolean NOT NULL DEFAULT false,
  "visible_to_all" boolean NOT NULL DEFAULT true,
  "table_columns" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "field_definitions_object_type_id_fkey"
    FOREIGN KEY ("object_type_id") REFERENCES "object_types"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "field_definitions_object_type_id_key_key" ON "field_definitions"("object_type_id", "key");
CREATE INDEX "field_definitions_object_type_id_idx" ON "field_definitions"("object_type_id");

-- 7. field_visibilities — used only when a field's visible_to_all = false;
--    each row grants one Passport-scope role permission to see that field.
CREATE TABLE "field_visibilities" (
  "field_definition_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,

  CONSTRAINT "field_visibilities_pkey" PRIMARY KEY ("field_definition_id", "role_id"),
  CONSTRAINT "field_visibilities_field_definition_id_fkey"
    FOREIGN KEY ("field_definition_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE,
  CONSTRAINT "field_visibilities_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
);

-- 8. object_instances — one filled-in passport (e.g. "Паспорт КИС —
--    Биллинг"). Ordinary field values live in `values`, keyed by
--    field_definitions.key.
CREATE TABLE "object_instances" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "object_type_id" uuid NOT NULL,
  "name" text NOT NULL,
  "values" jsonb NOT NULL DEFAULT '{}',
  "created_by_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "object_instances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "object_instances_object_type_id_fkey"
    FOREIGN KEY ("object_type_id") REFERENCES "object_types"("id") ON DELETE RESTRICT
);

CREATE INDEX "object_instances_object_type_id_idx" ON "object_instances"("object_type_id");

-- 9. object_instance_responsible — who is personally responsible for a
--    given passport (a passport can have more than one responsible person).
CREATE TABLE "object_instance_responsible" (
  "object_instance_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,

  CONSTRAINT "object_instance_responsible_pkey" PRIMARY KEY ("object_instance_id", "user_id"),
  CONSTRAINT "object_instance_responsible_object_instance_id_fkey"
    FOREIGN KEY ("object_instance_id") REFERENCES "object_instances"("id") ON DELETE CASCADE,
  CONSTRAINT "object_instance_responsible_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- 10. table_field_rows — one row of a TABLE-type field within one passport
--     (e.g. one server row in "Состав системы"). `cells` holds that row's
--     values, keyed by the field's table_columns.
CREATE TABLE "table_field_rows" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "object_instance_id" uuid NOT NULL,
  "field_definition_id" uuid NOT NULL,
  "row_order" integer NOT NULL DEFAULT 0,
  "cells" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "table_field_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "table_field_rows_object_instance_id_fkey"
    FOREIGN KEY ("object_instance_id") REFERENCES "object_instances"("id") ON DELETE CASCADE,
  CONSTRAINT "table_field_rows_field_definition_id_fkey"
    FOREIGN KEY ("field_definition_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE
);

CREATE INDEX "table_field_rows_object_instance_id_idx" ON "table_field_rows"("object_instance_id");
CREATE INDEX "table_field_rows_field_definition_id_idx" ON "table_field_rows"("field_definition_id");
