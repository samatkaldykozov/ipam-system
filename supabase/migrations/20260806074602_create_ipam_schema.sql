/*
# Create IPAM Core Schema

Creates the foundational data model for the enterprise IP Address Management
(IPAM) platform: roles, users, locations, networks, prefixes, IP addresses,
and an audit log.

## 1. New Tables

1. **roles** — RBAC role definitions (e.g. Admin, Operator, Viewer).
   - `id` uuid PK
   - `name` text, unique — role name
   - `description` text, optional
   - `created_at`, `updated_at` timestamps

2. **users** — application users (profile/role, not auth credentials).
   - `id` uuid PK
   - `email` text, unique
   - `full_name` text, optional
   - `is_active` boolean, default true
   - `role_id` uuid FK → roles(id) ON DELETE SET NULL
   - `created_at`, `updated_at` timestamps

3. **locations** — physical or logical sites where networks live.
   - `id` uuid PK
   - `name` text, unique
   - `code` text, unique — short site code (e.g. DC-NYC)
   - `address`, `city`, `country` text, optional
   - `latitude`, `longitude` float8, optional
   - `description` text, optional
   - `created_at`, `updated_at` timestamps

4. **networks** — top-level network blocks identified by CIDR.
   - `id` uuid PK
   - `name` text
   - `cidr` text, unique — e.g. 10.0.0.0/8
   - `description` text, optional
   - `vlan_id` int, optional
   - `status` enum(active, reserved, archived), default active
   - `location_id` uuid FK → locations(id) ON DELETE SET NULL
   - `created_at`, `updated_at` timestamps

5. **prefixes** — subnet blocks within a network.
   - `id` uuid PK
   - `cidr` text, unique
   - `name` text, optional
   - `status` enum(active, reserved, deprecated), default active
   - `description` text, optional
   - `network_id` uuid FK → networks(id) ON DELETE CASCADE
   - `created_at`, `updated_at` timestamps

6. **ip_addresses** — individual IP address assignments.
   - `id` uuid PK
   - `address` text, unique
   - `hostname` text, optional
   - `mac_address` text, optional
   - `status` enum(available, assigned, reserved, blocked), default available
   - `description` text, optional
   - `network_id` uuid FK → networks(id) ON DELETE CASCADE
   - `prefix_id` uuid FK → prefixes(id) ON DELETE SET NULL
   - `assigned_at` timestamptz, optional
   - `created_at`, `updated_at` timestamps

7. **audit_logs** — append-only record of user/system actions.
   - `id` uuid PK
   - `action` enum(create, update, delete, login, logout)
   - `entity` text — affected model name
   - `entity_id` text, optional
   - `metadata` jsonb, optional
   - `user_id` uuid FK → users(id) ON DELETE SET NULL
   - `created_at` timestamp

## 2. Indexes

- `users(role_id)` — filter users by role
- `networks(location_id)` — filter networks by location
- `networks(status)` — filter networks by status
- `prefixes(network_id)` — list prefixes for a network
- `prefixes(status)` — filter prefixes by status
- `ip_addresses(network_id)` — list IPs for a network
- `ip_addresses(prefix_id)` — list IPs for a prefix
- `ip_addresses(status)` — filter IPs by status
- `audit_logs(user_id)` — list actions by user
- `audit_logs(entity)` — list actions by entity type
- `audit_logs(action)` — list actions by action type

## 3. Security (RLS)

This is a foundation scaffold with no business logic yet. RLS is enabled on
every table with open (anon + authenticated) policies so the anon-key frontend
can read and write during development. Policies MUST be tightened before
production — replace `USING (true)` with real ownership/membership checks.

## 4. Important Notes

1. All primary keys use `gen_random_uuid()` defaults.
2. All `updated_at` columns auto-update via triggers.
3. Foreign keys use ON DELETE CASCADE for owned children (prefixes, ip_addresses
   under networks) and ON DELETE SET NULL for optional references.
4. Enum types use PostgreSQL native enums for data integrity.
5. The schema is idempotent — safe to re-run.
*/

-- ─────────────────────────────────────────────
-- Enum types
-- ─────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE network_status AS ENUM ('ACTIVE', 'RESERVED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE prefix_status AS ENUM ('ACTIVE', 'RESERVED', 'DEPRECATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ip_status AS ENUM ('AVAILABLE', 'ASSIGNED', 'RESERVED', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- updated_at trigger function (shared)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- roles
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_roles" ON roles;
CREATE POLICY "anon_select_roles" ON roles FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_roles" ON roles;
CREATE POLICY "anon_insert_roles" ON roles FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_roles" ON roles;
CREATE POLICY "anon_update_roles" ON roles FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_roles" ON roles;
CREATE POLICY "anon_delete_roles" ON roles FOR DELETE
  TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS roles_set_updated_at ON roles;
CREATE TRIGGER roles_set_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  full_name  text,
  is_active  boolean NOT NULL DEFAULT true,
  role_id    uuid REFERENCES roles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_role_id_idx ON users(role_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_users" ON users;
CREATE POLICY "anon_insert_users" ON users FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_users" ON users;
CREATE POLICY "anon_update_users" ON users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_users" ON users;
CREATE POLICY "anon_delete_users" ON users FOR DELETE
  TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- locations
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  code        text UNIQUE NOT NULL,
  address     text,
  city        text,
  country     text,
  latitude    double precision,
  longitude   double precision,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_locations" ON locations;
CREATE POLICY "anon_select_locations" ON locations FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_locations" ON locations;
CREATE POLICY "anon_insert_locations" ON locations FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_locations" ON locations;
CREATE POLICY "anon_update_locations" ON locations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_locations" ON locations;
CREATE POLICY "anon_delete_locations" ON locations FOR DELETE
  TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS locations_set_updated_at ON locations;
CREATE TRIGGER locations_set_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- networks
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS networks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  cidr        text UNIQUE NOT NULL,
  description text,
  vlan_id     integer,
  status      network_status NOT NULL DEFAULT 'ACTIVE',
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS networks_location_id_idx ON networks(location_id);
CREATE INDEX IF NOT EXISTS networks_status_idx ON networks(status);

ALTER TABLE networks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_networks" ON networks;
CREATE POLICY "anon_select_networks" ON networks FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_networks" ON networks;
CREATE POLICY "anon_insert_networks" ON networks FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_networks" ON networks;
CREATE POLICY "anon_update_networks" ON networks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_networks" ON networks;
CREATE POLICY "anon_delete_networks" ON networks FOR DELETE
  TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS networks_set_updated_at ON networks;
CREATE TRIGGER networks_set_updated_at
  BEFORE UPDATE ON networks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- prefixes
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prefixes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidr        text UNIQUE NOT NULL,
  name        text,
  status      prefix_status NOT NULL DEFAULT 'ACTIVE',
  description text,
  network_id  uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prefixes_network_id_idx ON prefixes(network_id);
CREATE INDEX IF NOT EXISTS prefixes_status_idx ON prefixes(status);

ALTER TABLE prefixes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_prefixes" ON prefixes;
CREATE POLICY "anon_select_prefixes" ON prefixes FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_prefixes" ON prefixes;
CREATE POLICY "anon_insert_prefixes" ON prefixes FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_prefixes" ON prefixes;
CREATE POLICY "anon_update_prefixes" ON prefixes FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_prefixes" ON prefixes;
CREATE POLICY "anon_delete_prefixes" ON prefixes FOR DELETE
  TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS prefixes_set_updated_at ON prefixes;
CREATE TRIGGER prefixes_set_updated_at
  BEFORE UPDATE ON prefixes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- ip_addresses
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ip_addresses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address     text UNIQUE NOT NULL,
  hostname    text,
  mac_address text,
  status      ip_status NOT NULL DEFAULT 'AVAILABLE',
  description text,
  network_id  uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  prefix_id   uuid REFERENCES prefixes(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ip_addresses_network_id_idx ON ip_addresses(network_id);
CREATE INDEX IF NOT EXISTS ip_addresses_prefix_id_idx ON ip_addresses(prefix_id);
CREATE INDEX IF NOT EXISTS ip_addresses_status_idx ON ip_addresses(status);

ALTER TABLE ip_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ip_addresses" ON ip_addresses;
CREATE POLICY "anon_select_ip_addresses" ON ip_addresses FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_ip_addresses" ON ip_addresses;
CREATE POLICY "anon_insert_ip_addresses" ON ip_addresses FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_ip_addresses" ON ip_addresses;
CREATE POLICY "anon_update_ip_addresses" ON ip_addresses FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_ip_addresses" ON ip_addresses;
CREATE POLICY "anon_delete_ip_addresses" ON ip_addresses FOR DELETE
  TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS ip_addresses_set_updated_at ON ip_addresses;
CREATE TRIGGER ip_addresses_set_updated_at
  BEFORE UPDATE ON ip_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- audit_logs
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action     audit_action NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  metadata   jsonb,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_audit_logs" ON audit_logs;
CREATE POLICY "anon_select_audit_logs" ON audit_logs FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_audit_logs" ON audit_logs;
CREATE POLICY "anon_insert_audit_logs" ON audit_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_audit_logs" ON audit_logs;
CREATE POLICY "anon_update_audit_logs" ON audit_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_audit_logs" ON audit_logs;
CREATE POLICY "anon_delete_audit_logs" ON audit_logs FOR DELETE
  TO anon, authenticated USING (true);
