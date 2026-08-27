-- CreateTable
-- table_cell_ip_address_values — real relational backing for a TABLE
-- column of type IP_REFERENCE (extends the IP_REFERENCE feature from
-- regular passport fields to table-field columns). Table-column
-- counterpart of field_ip_address_values (see migration
-- 20260826090000_add_ip_reference_field_type): scoped to one column of
-- one table row rather than one field of one passport, so it's keyed by
-- (table_field_row_id, column_key) instead. onDelete Restrict on
-- ip_address_id is what stops an in-use address from being deleted.
CREATE TABLE "table_cell_ip_address_values" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "table_field_row_id" uuid NOT NULL,
  "column_key" text NOT NULL,
  "ip_address_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "table_cell_ip_address_values_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "table_cell_ip_address_values_table_field_row_id_fkey"
    FOREIGN KEY ("table_field_row_id") REFERENCES "table_field_rows"("id") ON DELETE CASCADE,
  CONSTRAINT "table_cell_ip_address_values_ip_address_id_fkey"
    FOREIGN KEY ("ip_address_id") REFERENCES "ip_addresses"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "table_cell_ip_address_values_table_field_row_id_column_ke_key"
  ON "table_cell_ip_address_values"("table_field_row_id", "column_key");
CREATE INDEX "table_cell_ip_address_values_ip_address_id_idx" ON "table_cell_ip_address_values"("ip_address_id");
