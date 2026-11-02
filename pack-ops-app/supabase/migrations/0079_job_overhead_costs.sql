CREATE TABLE job_overhead_settings (
 org_id uuid NOT NULL REFERENCES orgs(id), job_id uuid NOT NULL,
 origin_address text NOT NULL DEFAULT '4320 Hales Rd, Spallumcheen, BC V4Y 0N6, Canada',
 destination_address text NOT NULL,
 round_trip_km numeric(12,2) CHECK (round_trip_km >= 0),
 rate_per_km numeric(8,2) NOT NULL DEFAULT 0.75 CHECK(rate_per_km >= 0),
 trip_adjustment integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,job_id), FOREIGN KEY(org_id,job_id) REFERENCES jobs(org_id,id)
);
CREATE TABLE job_admin_entries (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES orgs(id),job_id uuid NOT NULL,
 work_date date NOT NULL,hours numeric(8,2) NOT NULL CHECK(hours>0 AND hours<=24),
 hourly_cost numeric(8,2) NOT NULL DEFAULT 65 CHECK(hourly_cost>=0),
 note text NOT NULL DEFAULT '',deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,job_id) REFERENCES jobs(org_id,id)
);
ALTER TABLE job_overhead_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_admin_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_overhead_office ON job_overhead_settings FOR ALL
 USING(org_id=fn_current_org_id() AND fn_current_role() IN ('owner','office'))
 WITH CHECK(org_id=fn_current_org_id() AND fn_current_role() IN ('owner','office'));
CREATE POLICY job_admin_office ON job_admin_entries FOR ALL
 USING(org_id=fn_current_org_id() AND fn_current_role() IN ('owner','office'))
 WITH CHECK(org_id=fn_current_org_id() AND fn_current_role() IN ('owner','office'));
