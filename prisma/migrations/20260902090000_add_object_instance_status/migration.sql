-- CMDB phase 7 (2 September 2026) — CI lifecycle status. See
-- it-passports-design.md section 8.11.

CREATE TYPE "object_instance_status" AS ENUM (
  'IN_USE', 'UNDER_MAINTENANCE', 'DECOMMISSIONED'
);

-- NOT NULL with a DEFAULT backfills every existing row to IN_USE in the
-- same statement — matches how every pre-existing passport should read
-- until someone deliberately marks it otherwise.
ALTER TABLE "object_instances"
  ADD COLUMN "status" "object_instance_status" NOT NULL DEFAULT 'IN_USE';

CREATE INDEX "object_instances_status_idx" ON "object_instances"("status");
