-- AlterTable
-- field_definitions — new per-field config flag for OBJECT_REFERENCE
-- fields with reference_target_kind = 'OBJECT_TYPE' (3 September 2026, CMDB
-- — network ports/interfaces, see it-passports-design.md section 8.17):
-- when true, a given target ObjectInstance may be pointed at by at most one
-- field_object_reference_values row for that FieldDefinition at a time.
-- Enforced application-side (validateUniqueObjectReferenceTargets,
-- object-reference-utils.ts) as a pre-check before the transaction, not by
-- a database constraint — see the column's doc comment in schema.prisma for
-- why a plain unique index can't express "unique only for flagged fields"
-- without a partial index tied to a per-row flag on a joined table.
-- NOT NULL DEFAULT false backfills every existing field to the old,
-- unrestricted behavior — no behavior change for any field configured
-- before this migration.
ALTER TABLE "field_definitions"
  ADD COLUMN "object_reference_unique_target" boolean NOT NULL DEFAULT false;
