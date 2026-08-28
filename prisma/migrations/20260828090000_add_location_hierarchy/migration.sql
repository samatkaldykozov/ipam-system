-- Turns Location from a flat list into a self-referencing tree, so it can
-- model a full physical hierarchy (Region -> City -> Building -> Room ->
-- Zone -> Rack), not just a single "site" per network. See
-- it-passports-design.md / roadmap.md, "CMDB: дерево локаций" (28 August
-- 2026), for the reasoning.
--
-- Every row that exists today keeps its id and becomes a root (parent_id
-- NULL) of kind BUILDING, which is what the flat model already meant in
-- practice: a site with an address that networks attach to. No data is
-- deleted or renamed.

-- 1. New enum for the tree level.
CREATE TYPE "location_kind" AS ENUM ('REGION', 'CITY', 'BUILDING', 'ROOM', 'ZONE', 'RACK');

-- 2. New columns. kind defaults to BUILDING so every existing row backfills
-- correctly without a separate UPDATE; parent_id is nullable (root) and
-- self-references locations(id).
ALTER TABLE "locations"
  ADD COLUMN "kind" "location_kind" NOT NULL DEFAULT 'BUILDING',
  ADD COLUMN "parent_id" UUID,
  ADD COLUMN "row_code" TEXT;

ALTER TABLE "locations"
  ADD CONSTRAINT "locations_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "locations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");

-- 3. name/code move from globally-unique to unique-among-siblings, enforced
-- in application code (see app/(app)/locations/actions.ts) rather than as a
-- DB constraint: Postgres treats every NULL parent_id as distinct from every
-- other NULL for uniqueness purposes, so a plain
-- UNIQUE (parent_id, code) index would not actually constrain root-level
-- siblings (exactly the level that most needs it, since that's what
-- networks/csv-actions.ts matches networks against). Drop the old global
-- constraints; the app-level check in createLocation/updateLocation already
-- scopes correctly, including for roots.
ALTER TABLE "locations" DROP CONSTRAINT "locations_name_key";
ALTER TABLE "locations" DROP CONSTRAINT "locations_code_key";
