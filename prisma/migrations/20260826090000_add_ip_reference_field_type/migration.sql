-- AlterEnum
ALTER TYPE "field_type" ADD VALUE 'IP_REFERENCE';

-- CreateTable
-- field_ip_address_values — real relational backing for FieldType.IP_REFERENCE.
-- One row per (passport, field) pair currently pointing at a real ip_addresses
-- row. onDelete: Restrict on ip_address_id is what stops an in-use address
-- from being deleted at the database level.
CREATE TABLE "field_ip_address_values" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "object_instance_id" uuid NOT NULL,
  "field_definition_id" uuid NOT NULL,
  "ip_address_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "field_ip_address_values_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "field_ip_address_values_object_instance_id_fkey"
    FOREIGN KEY ("object_instance_id") REFERENCES "object_instances"("id") ON DELETE CASCADE,
  CONSTRAINT "field_ip_address_values_field_definition_id_fkey"
    FOREIGN KEY ("field_definition_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE,
  CONSTRAINT "field_ip_address_values_ip_address_id_fkey"
    FOREIGN KEY ("ip_address_id") REFERENCES "ip_addresses"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "field_ip_address_values_object_instance_id_field_definitio_key"
  ON "field_ip_address_values"("object_instance_id", "field_definition_id");
CREATE INDEX "field_ip_address_values_ip_address_id_idx" ON "field_ip_address_values"("ip_address_id");
