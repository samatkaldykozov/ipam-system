-- Add parent_prefix_id column to prefixes for hierarchical prefix support.
-- A prefix with no parent is a top-level prefix directly under a network.
-- A child prefix must be contained within its parent and belong to the same network.

ALTER TABLE prefixes
  ADD COLUMN IF NOT EXISTS parent_prefix_id uuid;

-- Self-referencing foreign key for prefix hierarchy.
-- ON DELETE NO ACTION: prevents deleting a prefix that still has children.
ALTER TABLE prefixes
  DROP CONSTRAINT IF EXISTS prefixes_parent_prefix_id_fkey;

ALTER TABLE prefixes
  ADD CONSTRAINT prefixes_parent_prefix_id_fkey
  FOREIGN KEY (parent_prefix_id) REFERENCES prefixes(id) ON DELETE NO ACTION;

-- Index for efficient child-prefix lookups.
CREATE INDEX IF NOT EXISTS prefixes_parent_prefix_id_idx ON prefixes(parent_prefix_id);
