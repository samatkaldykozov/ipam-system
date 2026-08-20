-- Unify Network and Prefix into a single self-referencing tree.
--
-- A subnet carved out of a bigger block (what used to be called a "Prefix")
-- is structurally the same kind of thing as the block itself (a "Network") —
-- both are just a CIDR range. This migration merges them into one table:
-- `networks` gains a nullable, self-referencing `parent_id`. A top-level
-- allocation has `parent_id IS NULL`; anything nested under it (at any
-- depth) points at its parent via `parent_id`. IP addresses now attach to
-- whichever node they belong to via the existing `network_id` column —
-- the separate `prefix_id` column is retired.

-- 1. Add self-referencing hierarchy to networks.
ALTER TABLE networks
  ADD COLUMN IF NOT EXISTS parent_id uuid;

ALTER TABLE networks
  DROP CONSTRAINT IF EXISTS networks_parent_id_fkey;

ALTER TABLE networks
  ADD CONSTRAINT networks_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES networks(id) ON DELETE NO ACTION;

CREATE INDEX IF NOT EXISTS networks_parent_id_idx ON networks(parent_id);

-- 2. Migrate existing prefixes into networks, preserving their ids so any
--    existing parent_prefix_id / prefix_id references keep resolving.
INSERT INTO networks (
  id, name, cidr, description, status, location_id, vlan_id, parent_id, created_at, updated_at
)
SELECT
  p.id,
  COALESCE(p.name, p.cidr),
  p.cidr,
  p.description,
  (CASE p.status::text WHEN 'DEPRECATED' THEN 'ARCHIVED' ELSE p.status::text END)::network_status,
  NULL::uuid,
  NULL::int,
  COALESCE(p.parent_prefix_id, p.network_id),
  p.created_at,
  p.updated_at
FROM prefixes p
ON CONFLICT (id) DO NOTHING;

-- 3. Point IP addresses at the most specific block they were assigned to
--    (the former prefix, if set; otherwise the network they already had).
UPDATE ip_addresses
SET network_id = COALESCE(prefix_id, network_id)
WHERE prefix_id IS NOT NULL;

-- 4. Drop the now-retired prefix-specific structures.
ALTER TABLE ip_addresses
  DROP COLUMN IF EXISTS prefix_id;

DROP TABLE IF EXISTS prefixes;

DROP TYPE IF EXISTS prefix_status;
