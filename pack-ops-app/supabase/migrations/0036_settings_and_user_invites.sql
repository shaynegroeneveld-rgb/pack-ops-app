CREATE TABLE IF NOT EXISTS user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'field',
  invited_by uuid REFERENCES users(id),
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invites_open_email
  ON user_invites (org_id, lower(email))
  WHERE accepted_at IS NULL AND deleted_at IS NULL;

ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_invites_select ON user_invites FOR SELECT
  USING (
    org_id = fn_current_org_id()
    AND deleted_at IS NULL
    AND fn_current_role() = 'owner'
  );

CREATE POLICY user_invites_insert ON user_invites FOR INSERT
  WITH CHECK (
    org_id = fn_current_org_id()
    AND fn_current_role() = 'owner'
  );

CREATE POLICY user_invites_update ON user_invites FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND fn_current_role() = 'owner'
  );

CREATE OR REPLACE FUNCTION fn_claim_pending_user_invite()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := fn_current_user_id();
  v_email text := lower(NULLIF(auth.jwt() ->> 'email', ''));
  v_invite user_invites%ROWTYPE;
  v_full_name text;
BEGIN
  IF v_user_id IS NULL OR v_email IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM users
    WHERE id = v_user_id
      AND deleted_at IS NULL
  ) THEN
    RETURN true;
  END IF;

  SELECT *
  INTO v_invite
  FROM user_invites
  WHERE lower(email) = v_email
    AND accepted_at IS NULL
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_full_name := COALESCE(
    NULLIF(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    NULLIF(v_invite.full_name, ''),
    split_part(v_invite.email, '@', 1)
  );

  INSERT INTO users (
    id,
    org_id,
    full_name,
    email,
    role,
    is_foreman,
    can_approve_time,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_invite.org_id,
    v_full_name,
    v_invite.email,
    v_invite.role,
    false,
    false,
    true,
    now(),
    now()
  );

  UPDATE user_invites
  SET accepted_at = now(),
      accepted_user_id = v_user_id,
      updated_at = now()
  WHERE id = v_invite.id;

  RETURN true;
END;
$$;
