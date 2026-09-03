-- AlterEnum
ALTER TYPE "field_type" ADD VALUE 'VM_IDENTIFIER';

-- AlterTable
-- field_definitions — per-field config for VM_IDENTIFIER fields (CMDB
-- clusters/VMs, see it-passports-design.md section 8.15). Unlike
-- AUTO_IDENTIFIER's rack/equipment-type-code config (a sibling field key
-- plus an FK to a dictionary table), all four VM_IDENTIFIER config values
-- are sibling-field-key TEXT columns — there is no new dictionary table,
-- because "code of the cluster" and "role" are just ordinary fields on
-- ordinary ObjectTypes (Cluster is a passport type like any other, not a
-- schema-level entity the way Location is). All four are null for every
-- other field type.
--   * vm_identifier_cluster_field_key: key of a field on THIS ObjectType —
--     must be OBJECT_REFERENCE targeting one specific Cluster-type passport
--     — that supplies which cluster this VM belongs to.
--   * vm_identifier_cluster_code_field_key: key of a TEXT field, but on the
--     CLUSTER ObjectType itself (not this VM's own type) — holds that
--     cluster's own short code (e.g. "prx1").
--   * vm_identifier_is_code_field_key: key of a TEXT field on this
--     ObjectType — the manually-typed information-system code.
--   * vm_identifier_role_field_key: key of a SELECT field on this
--     ObjectType — the VM's role (Web/App/DB/Cache/Balancer/Прочее).
ALTER TABLE "field_definitions"
  ADD COLUMN "vm_identifier_cluster_field_key" text,
  ADD COLUMN "vm_identifier_cluster_code_field_key" text,
  ADD COLUMN "vm_identifier_is_code_field_key" text,
  ADD COLUMN "vm_identifier_role_field_key" text;

-- CreateTable
-- field_vm_identifier_values — real relational backing + uniqueness guard
-- for FieldType.VM_IDENTIFIER, mirroring field_auto_identifier_values'
-- role and "generated once, never reissued" semantics exactly, but keyed
-- by (cluster, information-system code, role) instead of (rack,
-- equipment-type code) per the VM naming formula
-- "код_кластера-код_ИС-роль-номер". is_code/role are denormalized copies
-- of what was on the VM passport at generation time, frozen from then on
-- — editing the cluster/IS-code/role on an already-identified VM must not
-- shift its issued number or free it for reuse, since the value may
-- already be referenced elsewhere (documentation, monitoring configs).
-- ON DELETE RESTRICT on target_cluster_instance_id is what stops a
-- Cluster passport from being deleted while a VM's already-issued
-- identifier still refers to it.
CREATE TABLE "field_vm_identifier_values" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "object_instance_id" uuid NOT NULL,
  "field_definition_id" uuid NOT NULL,
  "target_cluster_instance_id" uuid NOT NULL,
  "is_code" text NOT NULL,
  "role" text NOT NULL,
  "seq" integer NOT NULL,
  "value" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "field_vm_identifier_values_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "field_vm_identifier_values_object_instance_id_fkey"
    FOREIGN KEY ("object_instance_id") REFERENCES "object_instances"("id") ON DELETE CASCADE,
  CONSTRAINT "field_vm_identifier_values_field_definition_id_fkey"
    FOREIGN KEY ("field_definition_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE,
  CONSTRAINT "field_vm_identifier_values_target_cluster_instance_id_fkey"
    FOREIGN KEY ("target_cluster_instance_id") REFERENCES "object_instances"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "field_vm_identifier_values_object_instance_id_field_def_key"
  ON "field_vm_identifier_values"("object_instance_id", "field_definition_id");
CREATE UNIQUE INDEX "field_vm_identifier_values_cluster_iscode_role_seq_key"
  ON "field_vm_identifier_values"("target_cluster_instance_id", "is_code", "role", "seq");
CREATE INDEX "field_vm_identifier_values_target_cluster_instance_id_idx"
  ON "field_vm_identifier_values"("target_cluster_instance_id");
