-- Phase 1.1 dev seed
-- This seed assumes auth users already exist in auth.users.
-- Create matching auth users first, then run this seed in SQL editor or via CLI.

WITH dev_org AS (
  INSERT INTO orgs (id, name, slug, settings)
  VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Pack Ops Dev',
    'pack-ops-dev',
    '{"timezone":"America/Vancouver","currency":"CAD"}'::jsonb
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        settings = EXCLUDED.settings,
        updated_at = now()
  RETURNING id
)
INSERT INTO users (
  id,
  org_id,
  full_name,
  email,
  role,
  is_foreman,
  can_approve_time,
  is_active
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'Owner User',
    'owner@packops.dev',
    'owner',
    false,
    true,
    true
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '11111111-1111-1111-1111-111111111111',
    'Field Foreman',
    'field@packops.dev',
    'field',
    true,
    true,
    true
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111',
    'Bookkeeper User',
    'bookkeeper@packops.dev',
    'bookkeeper',
    false,
    false,
    true
  )
ON CONFLICT (id) DO UPDATE
  SET org_id = EXCLUDED.org_id,
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      is_foreman = EXCLUDED.is_foreman,
      can_approve_time = EXCLUDED.can_approve_time,
      is_active = EXCLUDED.is_active,
      updated_at = now();
