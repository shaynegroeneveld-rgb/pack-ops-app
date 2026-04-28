-- ============================================================
-- MATERIALS + ASSEMBLIES FOUNDATION
-- ============================================================

ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE catalog_items
  ALTER COLUMN unit_price DROP NOT NULL,
  ALTER COLUMN unit_price DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_catalog_sku
  ON catalog_items(org_id, sku)
  WHERE deleted_at IS NULL;

DROP POLICY IF EXISTS catalog_update ON catalog_items;
CREATE POLICY catalog_update ON catalog_items FOR UPDATE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office') AND deleted_at IS NULL)
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

CREATE TABLE IF NOT EXISTS assemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  default_labor_hours numeric(8,2) NOT NULL DEFAULT 0 CHECK (default_labor_hours >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_assemblies_org
  ON assemblies(org_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assemblies_active
  ON assemblies(org_id, is_active)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assemblies_name
  ON assemblies USING GIN(name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS assembly_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  assembly_id uuid NOT NULL,
  catalog_item_id uuid NOT NULL,
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_assembly_items_assembly FOREIGN KEY (org_id, assembly_id) REFERENCES assemblies(org_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_assembly_items_catalog FOREIGN KEY (org_id, catalog_item_id) REFERENCES catalog_items(org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_assembly_items_assembly
  ON assembly_items(assembly_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_assembly_items_catalog
  ON assembly_items(catalog_item_id);

CREATE TRIGGER trg_updated_at_assemblies
  BEFORE UPDATE ON assemblies FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at_assembly_items
  BEFORE UPDATE ON assembly_items FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE assemblies ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY assemblies_select ON assemblies FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL);
CREATE POLICY assemblies_insert ON assemblies FOR INSERT
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));
CREATE POLICY assemblies_update ON assemblies FOR UPDATE
  USING (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office') AND deleted_at IS NULL)
  WITH CHECK (org_id = fn_current_org_id() AND fn_current_role() IN ('owner', 'office'));

CREATE POLICY assembly_items_select ON assembly_items FOR SELECT
  USING (
    org_id = fn_current_org_id()
    AND EXISTS (
      SELECT 1
      FROM assemblies
      WHERE assemblies.org_id = assembly_items.org_id
        AND assemblies.id = assembly_items.assembly_id
        AND assemblies.deleted_at IS NULL
    )
  );
CREATE POLICY assembly_items_insert ON assembly_items FOR INSERT
  WITH CHECK (
    org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office')
    AND EXISTS (
      SELECT 1
      FROM assemblies
      WHERE assemblies.org_id = assembly_items.org_id
        AND assemblies.id = assembly_items.assembly_id
        AND assemblies.deleted_at IS NULL
    )
  );
CREATE POLICY assembly_items_update ON assembly_items FOR UPDATE
  USING (
    org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office')
    AND EXISTS (
      SELECT 1
      FROM assemblies
      WHERE assemblies.org_id = assembly_items.org_id
        AND assemblies.id = assembly_items.assembly_id
        AND assemblies.deleted_at IS NULL
    )
  )
  WITH CHECK (
    org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office')
    AND EXISTS (
      SELECT 1
      FROM assemblies
      WHERE assemblies.org_id = assembly_items.org_id
        AND assemblies.id = assembly_items.assembly_id
        AND assemblies.deleted_at IS NULL
    )
  );
CREATE POLICY assembly_items_delete ON assembly_items FOR DELETE
  USING (
    org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office')
  );

INSERT INTO catalog_items (
  org_id,
  name,
  sku,
  unit,
  cost_price,
  unit_price,
  category,
  is_active,
  notes,
  created_at,
  updated_at
)
SELECT
  orgs.id,
  seed.name,
  seed.sku,
  seed.unit,
  seed.cost_price,
  seed.unit_price,
  seed.category,
  seed.is_active,
  seed.notes,
  now(),
  now()
FROM orgs
CROSS JOIN (
  VALUES
    ('ACWU/TECK', 'TECK 2c10 600v', '2c10 TECK', 'each', 9.06, 11.78, true, NULL),
    ('ACWU/TECK', 'TECK 2c12 600V', '2c12 TECK', 'each', 6.54, 8.50, true, NULL),
    ('ACWU/TECK', 'TECK 2c14 600v', '2c14 TECK', 'each', 5.94, 7.72, true, NULL),
    ('ACWU/TECK', 'TECK 2c8 1000V', '2c8 TECK', 'each', 17.12, 22.26, true, NULL),
    ('ACWU/TECK', 'ACWU 3c1', '3c1 ACWU', 'each', 15.33, 19.93, true, NULL),
    ('ACWU/TECK', 'ACWU 3c1/0', '3c1/0 ACWU', 'each', 16.56, 21.53, true, NULL),
    ('ACWU/TECK', 'TECK 3c10 600v', '3c10 TECK', 'each', 13.35, 17.36, true, NULL),
    ('ACWU/TECK', 'ACWU 3c2/0', '3c2/0 ACWU', 'each', 20.32, 26.42, true, NULL),
    ('ACWU/TECK', 'ACWU 3c250 MCM', '3c250MCM ACWU', 'each', 33.21, 43.17, true, NULL),
    ('ACWU/TECK', 'ACWU 3c4', '3c4 ACWU', 'each', 10.40, 13.52, true, NULL),
    ('ACWU/TECK', 'TECK 3c8 1000V', '3c8 TECK', 'each', 19.13, 24.87, true, NULL),
    ('Boxes', 'BE1', '1-Gang Box Extender 1-1/2"', 'each', 2.66, 3.46, true, NULL),
    ('Boxes', 'FDBLANK', '1-Gang Deep Blank PVC Box', 'each', 15.41, 20.03, true, NULL),
    ('Boxes', 'BE2', '2-Gang Box Extender 1-1/2"', 'each', 4.76, 6.19, true, NULL),
    ('Boxes', 'BE3 ARLINGTON', '3-Gang Box Extender Plastic', 'each', 9.86, 12.82, true, NULL),
    ('Boxes', 'BC56111', '4" Octagon Steel Box 1/2" DP Ceiling', 'each', 5.98, 7.77, true, NULL),
    ('Boxes', 'BCOBEX', '4" Octagon Steel Extension Ring 1/2" DP', 'each', 13.78, 17.91, true, NULL),
    ('Boxes', 'BC8366', '4" Square Steel Cover 30A Receptacle', 'each', 17.32, 22.52, true, NULL),
    ('Boxes', 'JBX442', '4"x4"x2" PVC Junction Box', 'each', 10.37, 13.48, true, NULL),
    ('Boxes', 'BC72171-K', '4-11/16" Square Steel Box 2-1/8" Deep', 'each', 6.29, 8.18, true, NULL),
    ('Boxes', 'BE4 ARLINGTON', '4-Gang Box Extender Plastic', 'each', 13.54, 17.60, true, NULL),
    ('Boxes', 'BC1110R', '4x2 Utility Box Extension', 'each', 10.00, 13.00, true, NULL),
    ('Boxes', 'BC52171-K', '4x4', 'each', 6.29, 8.18, true, NULL),
    ('Boxes', 'JBX552', '5"x5"x2" PVC Junction Box', 'each', 24.47, 31.81, true, NULL),
    ('Boxes', 'JBX664', '6"x6"x4" PVC Junction Box', 'each', 33.04, 42.95, true, NULL),
    ('Boxes', 'D-S-060604', '6"x6"x4" Steel Pull Box', 'each', 10.14, 13.18, true, NULL),
    ('Boxes', '2-WSW', 'Double gang', 'each', 4.69, 6.10, true, NULL),
    ('Boxes', '2-FWSW', 'Double gang airtight', 'each', 6.37, 8.28, true, NULL),
    ('Boxes', 'EZ101', 'Easy box', 'each', 7.86, 10.22, true, NULL),
    ('Boxes', 'FBS415S', 'Fan box', 'each', 22.34, 29.04, true, NULL),
    ('Boxes', 'FB442F', 'Fan box airtight', 'each', 22.70, 29.51, true, NULL),
    ('Boxes', '4-WSW', 'Four gang', 'each', 16.60, 21.58, true, NULL),
    ('Boxes', '4-FWSW', 'Four gang airtight', 'each', 18.07, 23.49, true, NULL),
    ('Boxes', 'W-OCT', 'Octagon box', 'each', 2.63, 3.42, true, NULL),
    ('Boxes', 'F-WOCT', 'Octagon box airtight', 'each', 6.92, 9.00, true, NULL),
    ('Boxes', 'BC56111', 'Pan box', 'each', 5.97, 7.76, true, NULL),
    ('Boxes', 'WRD', 'Range box', 'each', 8.86, 11.52, true, NULL),
    ('Boxes', 'FWRD', 'Range box airtight', 'each', 10.32, 13.42, true, NULL),
    ('Boxes', 'BE1R', 'Round Box Extender 1-1/2"', 'each', 5.98, 7.77, true, NULL),
    ('Boxes', 'WSW', 'Single gang', 'each', 1.73, 2.25, true, NULL),
    ('Boxes', 'F-WSW', 'Single gang airtight', 'each', 2.90, 3.77, true, NULL),
    ('Boxes', 'BC11C10', 'Steel Box Cover Raised Decora', 'each', 3.76, 4.89, true, NULL),
    ('Boxes', '3-WSW', 'Triple gang', 'each', 7.90, 10.27, true, NULL),
    ('Boxes', '3-FWSW', 'Triple gang airtight', 'each', 8.75, 11.38, true, NULL),
    ('Breakers', 'LB115-T', '15A Leviton', 'each', 11.55, 15.02, true, NULL),
    ('Breakers', 'LB115-AFT', '15A AFCI Leviton', 'each', 70.76, 91.99, true, NULL),
    ('Breakers', 'Q115', '15A Siemens', 'each', 12.07, 15.69, true, NULL),
    ('Breakers', 'LB130-T', '1P 30A Leviton Breaker', 'each', 18.03, 23.44, true, NULL),
    ('Breakers', 'LB120-T', '20A Leviton', 'each', 11.55, 15.02, true, NULL),
    ('Breakers', 'Q120', '20A Siemens', 'each', 12.60, 16.38, true, NULL),
    ('Breakers', 'Q2100', '2P 100A Siemens', 'each', 156.49, 203.44, true, NULL),
    ('Breakers', 'Q2125', '2P 125A Siemens', 'each', 312.63, 406.42, true, NULL),
    ('Breakers', 'LB215-T', '2P 15A Leviton Breaker', 'each', 22.86, 29.72, true, NULL),
    ('Breakers', 'Q215', '2P 15A Siemens', 'each', 28.64, 37.23, true, NULL),
    ('Breakers', 'LB220-T', '2P 20A Leviton', 'each', 22.86, 29.72, true, NULL),
    ('Breakers', 'Q220', '2P 20A Siemens', 'each', 35.06, 45.58, true, NULL),
    ('Breakers', 'LB230-T', '2P 30A Leviton', 'each', 28.73, 37.35, true, NULL),
    ('Breakers', 'Q230', '2P 30A Siemens', 'each', 28.67, 37.27, true, NULL),
    ('Breakers', 'LB240-T', '2P 40A Leviton', 'each', 28.73, 37.35, true, NULL),
    ('Breakers', 'Q240', '2P 40A Siemens', 'each', 28.80, 37.44, true, NULL),
    ('Breakers', 'LB250-T', '2P 50A Leviton', 'each', 39.98, 51.97, true, NULL),
    ('Breakers', 'Q250', '2P 50A Siemens', 'each', 47.21, 61.37, true, NULL),
    ('Breakers', 'Q130', '30A Siemens', 'each', 32.54, 42.30, true, NULL),
    ('Breakers', 'LP420-BDC', '42sp 200a indoor panel', 'each', 350.31, 455.40, true, NULL),
    ('Breakers', 'QA115AFCCSA', 'ARCFAULT 15A Siemens', 'each', 103.82, 134.97, true, NULL),
    ('Breakers', 'ECQL1', 'Breaker Lock', 'each', 6.22, 8.09, true, NULL),
    ('Breakers', 'LN330', 'Neutral Lug Adapter', 'each', 14.59, 18.97, true, NULL),
    ('Breakers', 'QF3', 'Panel Fillers', 'each', 8.94, 11.62, true, NULL),
    ('Breakers', 'Q1515NC', 'Siemens 1P 15/15A Tandem', 'each', 27.52, 35.78, true, NULL),
    ('Breakers', 'QO215', 'Square D 2P 15A 240V', 'each', 53.40, 69.42, true, NULL),
    ('Breakers', 'QO220', 'Square D 2P 20A 240V', 'each', 52.91, 68.78, true, NULL),
    ('Conduit', '2IN-DB2', '2" DB2', 'each', 19.79, 25.73, true, NULL),
    ('Conduit', '2IN-DB2-90', '2" DB2 90', 'each', 39.93, 51.91, true, NULL),
    ('Conduit', '2IN-TEL', '2" TEL', 'each', 22.88, 29.74, true, NULL),
    ('Conduit', '3IN-DB2', '3" DB2', 'each', 29.89, 38.86, true, NULL),
    ('Conduit', '3IN-DB2-90', '3" DB2 90', 'each', 76.34, 99.24, true, NULL),
    ('Conduit', '3IN-DB2-COUP', '3" DB2 Coupling', 'each', 4.69, 6.10, true, NULL),
    ('Conduit', '3IN-DB2-RPVC', '3" DB2 to RPVC Adapter', 'each', 12.18, 15.83, true, NULL),
    ('Conduit', 'DB2-COUP', 'DB2 Coupling', 'each', 4.11, 5.34, true, NULL),
    ('Conduit & Fittings', 'CI1308', '1" EMT 1-Hole Pipe Strap', 'each', 0.24, 0.31, true, NULL),
    ('Conduit & Fittings', 'CI5608-WL', '1" EMT Compression Connector Wet', 'each', 2.49, 3.24, true, NULL),
    ('Conduit & Fittings', '1 EMT CONDUIT', '1" EMT Conduit 10ft', 'length', 24.10, 31.33, true, NULL),
    ('Conduit & Fittings', '1IN STL CONN', '1" EMT Set Screw Connector', 'each', 0.69, 0.90, true, NULL),
    ('Conduit & Fittings', 'BG803L', '1" Insulated Grounding Bushing AL', 'each', 8.27, 10.75, true, NULL),
    ('Conduit & Fittings', 'CI2708', '1" Plastic Bushing', 'each', 0.33, 0.43, true, NULL),
    ('Conduit & Fittings', 'CI1708', '1" Steel Locknut', 'each', 0.48, 0.62, true, NULL),
    ('Conduit & Fittings', 'CI73', '1" Zinc Flex Connector', 'each', 8.01, 10.41, true, NULL),
    ('Conduit & Fittings', 'CI1412', '1-1/2" EMT 2-Hole Pipe Strap', 'each', 0.68, 0.88, true, NULL),
    ('Conduit & Fittings', 'BG805L', '1-1/2" Insulated Grounding Bushing AL', 'each', 11.69, 15.20, true, NULL),
    ('Conduit & Fittings', 'TA30', '1-1/2" PVC Terminal Adapter', 'each', 4.17, 5.42, true, NULL),
    ('Conduit & Fittings', 'CI2710', '1-1/4" Plastic Bushing', 'each', 0.39, 0.51, true, NULL),
    ('Conduit & Fittings', 'CI1710', '1-1/4" Steel Locknut', 'each', 0.64, 0.83, true, NULL),
    ('Conduit & Fittings', 'CI2211', '1/2" 90 Zinc Cable Connector', 'each', 3.09, 4.02, true, NULL),
    ('Conduit & Fittings', 'RDC13NA', '1/2" Dome Cord Connector', 'each', 2.53, 3.29, true, NULL),
    ('Conduit & Fittings', 'TA10', '1/2" PVC Terminal Adapter', 'each', 1.13, 1.47, true, NULL),
    ('Conduit & Fittings', 'CON10005', '1/2" RPVC Conduit 10ft', 'length', 1.11, 1.44, true, NULL),
    ('Conduit & Fittings', 'NMLT50', '1/2" Straight NM Connector Grey', 'each', 3.21, 4.17, true, NULL),
    ('Conduit & Fittings', 'TSRC10A', '1/2" Threaded Strain Relief Connector', 'each', 7.08, 9.20, true, NULL),
    ('Conduit & Fittings', 'CI3106', '1/2 to 1" Zinc Ground Clamp', 'each', 3.68, 4.78, true, NULL),
    ('Conduit & Fittings', 'CI1416', '2" EMT 2-Hole Pipe Strap', 'each', 0.96, 1.25, true, NULL),
    ('Conduit & Fittings', 'CI5616-WL', '2" EMT Compression Connector Wet', 'each', 9.22, 11.99, true, NULL),
    ('Conduit & Fittings', 'CI5716-WL', '2" EMT Compression Coupling Wet', 'each', 9.57, 12.44, true, NULL),
    ('Conduit & Fittings', '2 EMT CONDUIT', '2" EMT Conduit 10ft', 'length', 5.59, 7.27, true, NULL),
    ('Conduit & Fittings', '2IN STL CONN', '2" EMT Set Screw Connector', 'each', 2.74, 3.56, true, NULL),
    ('Conduit & Fittings', 'CPC200', '2" Electro-Galv Pipe Clamp', 'each', 3.38, 4.39, true, NULL),
    ('Conduit & Fittings', 'CIEFSA-2', '2" Entrance Fitting SS Alum', 'each', 82.61, 107.39, true, NULL),
    ('Conduit & Fittings', 'PS35', '2" PVC 2-Hole Pipe Strap', 'each', 1.22, 1.59, true, NULL),
    ('Conduit & Fittings', 'EE3590', '2" PVC 90 Elbow', 'each', 15.63, 20.32, true, NULL),
    ('Conduit & Fittings', 'FA35', '2" PVC Female Adapter', 'each', 5.98, 7.77, true, NULL),
    ('Conduit & Fittings', 'TA35', '2" PVC Terminal Adapter', 'each', 4.01, 5.21, true, NULL),
    ('Conduit & Fittings', 'CI2716', '2" Plastic Bushing', 'each', 0.85, 1.11, true, NULL),
    ('Conduit & Fittings', 'CON10020', '2" RPVC Conduit 10ft', 'length', 4.32, 5.62, true, NULL),
    ('Conduit & Fittings', 'CI1716', '2" Steel Locknut', 'each', 1.09, 1.42, true, NULL),
    ('Conduit & Fittings', 'CIRB16R12', '2" to 1-1/2" Steel Reducing Bushing', 'each', 12.30, 15.99, true, NULL),
    ('Conduit & Fittings', 'CS45', '3" PVC 2-Hole Coated Pipe Strap', 'each', 5.14, 6.68, true, NULL),
    ('Conduit & Fittings', 'EJ45', '3" PVC Expansion Joint', 'each', 43.56, 56.63, true, NULL),
    ('Conduit & Fittings', 'TA45', '3" PVC Terminal Adapter', 'each', 10.30, 13.39, true, NULL),
    ('Conduit & Fittings', 'CON10030', '3" RPVC Conduit 10ft', 'length', 9.34, 12.14, true, NULL),
    ('Conduit & Fittings', 'CI1724', '3" Steel Locknut', 'each', 3.98, 5.17, true, NULL),
    ('Conduit & Fittings', 'BG802L', '3/4" Insulated Grounding Bushing AL', 'each', 7.56, 9.83, true, NULL),
    ('Conduit & Fittings', 'TA15', '3/4" PVC Terminal Adapter', 'each', 1.94, 2.52, true, NULL),
    ('Conduit & Fittings', 'CI2706', '3/4" Plastic Bushing', 'each', 0.16, 0.21, true, NULL),
    ('Conduit & Fittings', 'CON10007', '3/4" RPVC Conduit 10ft', 'length', 12.03, 15.64, true, NULL),
    ('Conduit & Fittings', 'CI1706', '3/4" Steel Locknut', 'each', 0.33, 0.43, true, NULL),
    ('Conduit & Fittings', 'CI72', '3/4" Zinc Flex Connector', 'each', 3.94, 5.12, true, NULL),
    ('Conduit & Fittings', 'CI72-A-52', '4-11/16" to 4" Steel Cover Adapter', 'each', 16.66, 21.66, true, NULL),
    ('Conduit & Fittings', 'CIDUCT-1', 'Duct Seal Compound 1lb', 'each', 5.61, 7.29, true, NULL),
    ('Distribution', 'DIST-100A-1224', '100A 1PH 12/24 CCT', 'each', 183.00, 237.90, true, NULL),
    ('Distribution', 'DIST-100A-2448', '100A 1PH 24/48CCT', 'each', 178.57, 232.14, true, NULL),
    ('Distribution', 'DIST-200A-3264', '200A 1PH 32/64', 'each', 271.42, 352.85, true, NULL),
    ('Distribution', 'LS820-BRC', '200A Combo Meterbase', 'each', 871.36, 1132.77, true, NULL),
    ('Distribution', 'DIST-200A-MB', '200A Meterbase', 'each', 179.09, 232.82, true, NULL),
    ('Distribution', 'DIST-3R-200A', '3R 200A 1PH 24/48', 'each', 975.48, 1268.12, true, NULL),
    ('EMT', 'EMT-1-COUP', '1 Coupling', 'each', 0.66, 0.86, true, NULL),
    ('EMT', 'EMT-1', '1 EMT Conduit', 'each', 24.10, 31.33, true, NULL),
    ('EMT', 'EMT-1-CONN', '1" Connector', 'each', 0.74, 0.96, true, NULL),
    ('EMT', 'LB-100-CG', '1" LB', 'each', 9.86, 12.82, true, NULL),
    ('EMT', 'EMT-1.25-CONN', '1-1/4 Connector', 'each', 1.58, 2.05, true, NULL),
    ('EMT', 'EMT-1.25-COUP', '1-1/4 Coupling', 'each', 1.58, 2.05, true, NULL),
    ('EMT', 'EMT-1.25', '1-1/4 EMT Conduit', 'each', 41.78, 54.31, true, NULL),
    ('EMT', 'EMT-1.25-LB', '1-1/4 LB', 'each', 18.03, 23.44, true, NULL),
    ('EMT', 'EMT-1/2-CONN', '1/2 Connector', 'each', 0.26, 0.34, true, NULL),
    ('EMT', 'EMT-1/2-COUP', '1/2 Coupling', 'each', 0.28, 0.36, true, NULL),
    ('EMT', 'EMT-1/2', '1/2 EMT Conduit', 'each', 8.64, 11.23, true, NULL),
    ('EMT', 'EMT-1/2-LB', '1/2 LB', 'each', 5.44, 7.07, true, NULL),
    ('EMT', 'EMT-2-CONN', '2 Connector', 'each', 3.00, 3.90, true, NULL),
    ('EMT', 'EMT-2', '2 EMT Conduit', 'each', 58.37, 75.88, true, NULL),
    ('EMT', 'EMT-2-LB', '2 EMT LB', 'each', 34.78, 45.21, true, NULL),
    ('EMT', 'EMT-3/4-CONN', '3/4 Connector', 'each', 0.41, 0.53, true, NULL),
    ('EMT', 'EMT-3/4-COUP', '3/4 Coupling', 'each', 0.39, 0.51, true, NULL),
    ('EMT', 'EMT-3/4', '3/4 EMT Conduit', 'each', 13.75, 17.88, true, NULL),
    ('EMT', 'EMT-3/4-LB', '3/4 LB', 'each', 7.49, 9.74, true, NULL),
    ('Flexible Conduit', 'FLEX-1/2-90', '1/2 90 Connector', 'each', 4.98, 6.47, true, NULL),
    ('Flexible Conduit', 'FLEX-1/2-CONN', '1/2 Connector', 'each', 3.09, 4.02, true, NULL),
    ('Flexible Conduit', 'FLEX-1/2', '1/2 Liquid Tight', 'each', 3.96, 5.15, true, NULL),
    ('Flexible Conduit', 'FLEX-3/4-90', '3/4 90 Connector', 'each', 9.50, 12.35, true, NULL),
    ('Flexible Conduit', 'FLEX-3/4-CONN', '3/4 Connector', 'each', 4.35, 5.65, true, NULL),
    ('Heating', 'B1002W', '1000W BBH', 'each', 95.84, 124.59, true, NULL),
    ('Heating', 'RWF1001W', '1000W Wall Fan Heat', 'each', 281.14, 365.48, true, NULL),
    ('Heating', 'B1502W', '1500W BBH', 'each', 122.14, 158.78, true, NULL),
    ('Heating', 'RWF1501W', '1500W Wall Fan Heat', 'each', 312.96, 406.85, true, NULL),
    ('Heating', 'B2002W', '2000W BBH', 'each', 165.88, 215.64, true, NULL),
    ('Heating', 'RWF2002W', '2000W Wall Fan Heat', 'each', 300.34, 390.44, true, NULL),
    ('Heating', 'B502W', '500W BBH', 'each', 79.27, 103.05, true, NULL),
    ('Heating', 'RWF0501W', '500W Wall Fan Heat', 'each', 252.93, 328.81, true, NULL),
    ('Heating', 'BK125LWH', 'Chime Kit', 'each', 39.44, 51.27, true, NULL),
    ('Heating', 'SWT2C', 'Wallstat', 'each', 36.43, 47.36, true, NULL),
    ('Heating', 'SWT1C', '1-Pole Thermostat White', 'each', 22.87, 29.73, true, NULL),
    ('Heating', 'SIBT1W', '1-Pole Thermostat Built-In UGB', 'each', 39.30, 51.09, true, NULL),
    ('Heating', 'RWF1002W', '1000W 240V Wall Insert Heater', 'each', 255.00, 331.50, true, NULL),
    ('Heating', 'RWF1502W', '1500W 240V Wall Insert Heater', 'each', 275.88, 358.64, true, NULL),
    ('Heating', 'B0502W', '500W 240V Baseboard Heater', 'each', 79.56, 103.43, true, NULL),
    ('Heating', 'RWF0502W', '500W 240V Wall Fan Heater', 'each', 250.85, 326.11, true, NULL),
    ('Light Fixtures', 'RDL4-LED10-A-VK-WHT-TRIAC', '4" FLAT POT', 'each', 12.79, 16.63, true, NULL),
    ('Light Fixtures', 'SP-2-30-W', 'Puk Lights', 'each', 26.85, 34.91, true, NULL),
    ('Light Fixtures', 'SDS42550LCST-UN3-DIM', '4 ft Garage Light', 'length', 84.24, 109.51, true, NULL),
    ('Light Fixtures', 'HCY0823L8CST-UN3-DIM-BK', 'High Bay Light', 'each', 146.99, 191.09, true, NULL),
    ('Light Fixtures', 'LTR-P-24V-1.5W-30K-16', 'LED Strip 16 ft', 'length', 116.64, 151.63, true, NULL),
    ('Light Fixtures', 'PSD15-24', 'LED Strip 16 ft Driver', 'length', 47.95, 62.34, true, NULL),
    ('Light Fixtures', 'DSL-LS1B-A-3C-WH', 'Security Light', 'each', 114.24, 148.51, true, NULL),
    ('Light Fixtures', 'PSD15-12', '15W 12V LED Power Supply', 'each', 49.23, 64.00, true, NULL),
    ('Light Fixtures', 'DSL-LS1B-A-3C-BR', '20W LED Security Light Bronze', 'each', 111.15, 144.50, true, NULL),
    ('Light Fixtures', 'PSD24-24', '24W 24V Dimmable LED Power Supply', 'each', 67.73, 88.05, true, NULL),
    ('Light Fixtures', 'LPDL4R-S2-7.5A-5CBK', '4" Gimbal LED Downlight 7.5W Black', 'each', 19.74, 25.66, true, NULL),
    ('Light Fixtures', 'RDL4G-LED10-A-VK-WHT-TRIAC', '4" Gimbal Pot Light 10W White', 'each', 18.97, 24.66, true, NULL),
    ('Light Fixtures', 'FD4R7ESCT1W', '4" LED Disk Light 5CCT White', 'each', 15.42, 20.05, true, NULL),
    ('Light Fixtures', 'P-4020', '4" Pre-mount Plate for Slim Pot', 'each', 3.66, 4.76, true, NULL),
    ('Light Fixtures', 'LPDL6/RND/12W/5CCT/BK', '6" Round LED Downlight 12W Black', 'each', 25.14, 32.68, true, NULL),
    ('Light Fixtures', 'ESTC-1', 'LED Tape-to-Tape Connector', 'each', 6.71, 8.72, true, NULL),
    ('Light Fixtures', 'DVCL-153PH-BLC', 'Lutron Diva 3-Way LED Dimmer Black', 'each', 38.99, 50.69, true, NULL),
    ('Misc', 'BARE-CU-6', '#6 Bare Copper', 'each', 4.18, 5.43, true, NULL),
    ('Misc', 'CI2712', '1-1/2 Bushing', 'each', 0.54, 0.70, true, NULL),
    ('Misc', 'CI1712', '1-1/2 Locknut', 'each', 0.90, 1.17, true, NULL),
    ('Misc', 'FLEX-1/2-FT', '1/2 Flex (per ft)', 'ft', 10.66, 13.86, true, NULL),
    ('Misc', 'BG806L', '2" Bond Bushing', 'each', 15.70, 20.41, true, NULL),
    ('Misc', 'MM8', '8 ft Mast', 'length', 166.37, 216.28, true, NULL),
    ('Misc', 'BATH-FAN', 'Bath Fan', 'each', 196.42, 255.35, true, NULL),
    ('Misc', '21032774', 'Carbon/Smoke Detector', 'each', 75.05, 97.57, true, NULL),
    ('Misc', 'WICH2106BL', 'Cat6 (per ft)', 'ft', 0.25, 0.33, true, NULL),
    ('Misc', 'ACD-2', 'Disconnect', 'each', 21.36, 27.77, true, NULL),
    ('Misc', 'FIBER', 'Fiber (per ft)', 'ft', 0.76, 0.99, true, NULL),
    ('Misc', '25249-SBA', 'Floor Box Assembly', 'each', 143.06, 185.98, true, NULL),
    ('Misc', 'GREY', 'Greys', 'each', 0.31, 0.40, true, NULL),
    ('Misc', '1016GPGC', 'Ground Plate', 'each', 47.23, 61.40, true, NULL),
    ('Misc', 'WICH2160BK', 'RG6 (per ft)', 'ft', 0.13, 0.17, true, NULL),
    ('Misc', '21031486', 'Smoke Detector', 'each', 35.00, 45.50, true, NULL),
    ('Misc', 'MM250', 'U-Bolt Rafter Clamp', 'each', 35.16, 45.71, true, NULL),
    ('Misc', 'VB02', 'Vapour Barrier Box 14"x8"', 'each', 7.28, 9.46, true, NULL),
    ('Misc', 'IW1624', 'Vapour Barrier Box 22"x14"', 'each', 7.28, 9.46, true, NULL),
    ('Misc', 'G-59', 'Vapour Barrier Box XL 22"x14"', 'each', 7.28, 9.46, true, NULL),
    ('Misc', 'VB-POT', 'Vapour Boot Pot Light', 'each', 7.84, 10.19, true, NULL),
    ('NMD Copper', 'NMD90 2c10', '2c10', 'each', 4.46, 5.80, true, NULL),
    ('NMD Copper', 'NMD90 2c12', '2c12', 'each', 2.49, 3.24, true, NULL),
    ('NMD Copper', 'NMD90 2c14', '2c14', 'each', 1.73, 2.25, true, NULL),
    ('NMD Copper', 'NMD90 2c8', '2c8', 'each', 8.70, 11.31, true, NULL),
    ('NMD Copper', 'NMD90 3c10', '3c10', 'each', 5.92, 7.70, true, NULL),
    ('NMD Copper', 'NMD90 3c12', '3c12', 'each', 4.22, 5.49, true, NULL),
    ('NMD Copper', 'NMD90 3c14', '3c14', 'each', 2.38, 3.09, true, NULL),
    ('NMD Copper', 'NMD90 3c2', '3c2', 'each', 9.88, 12.84, true, NULL),
    ('NMD Copper', 'NMD90 3c6', '3c6', 'each', 17.60, 22.88, true, NULL),
    ('NMD Copper', 'NMD90 3c8', '3c8', 'each', 10.97, 14.26, true, NULL),
    ('Plates', '80412-NW', 'Double Plate', 'each', 1.61, 2.09, true, NULL),
    ('Plates', 'ML500WCN', 'Outdoor In Use Cover', 'each', 4.95, 6.44, true, NULL),
    ('Plates', '80414-W', 'Quad Plate', 'each', 3.22, 4.19, true, NULL),
    ('Plates', '80411-NW', 'Single Plate', 'each', 0.93, 1.21, true, NULL),
    ('Plates', '4996-W', 'Soffit Cover', 'each', 9.62, 12.51, true, NULL),
    ('Plates', '80401-NW', '1-Gang Decora Plate White', 'each', 0.82, 1.07, true, NULL),
    ('Plates', '80409-NW', '2-Gang Decora Plate White', 'each', 1.62, 2.11, true, NULL),
    ('Receptacles', 'T5325-W', '15A TR Receptacle White', 'each', 2.54, 3.30, true, NULL),
    ('Receptacles', 'GFTR1-W', '15A GFCI Receptacle White', 'each', 24.32, 31.62, true, NULL),
    ('Receptacles', 'T5825-W', '20A TR Receptacle White', 'each', 6.72, 8.74, true, NULL),
    ('Receptacles', 'GFTR2-W', '20A GFCI Receptacle White', 'each', 25.65, 33.35, true, NULL),
    ('Receptacles', '1278-S30', 'Dryer Receptacle', 'each', 5.77, 7.50, true, NULL),
    ('Receptacles', '1279-S50', 'Range Receptacle', 'each', 5.77, 7.50, true, NULL),
    ('Rigid PVC', 'RPVC-1-LB', '1 LB', 'each', 9.24, 12.01, true, NULL),
    ('Rigid PVC', 'RPVC-1-TA', '1 TA', 'each', 2.37, 3.08, true, NULL),
    ('Rigid PVC', 'RPVC-1', '1" RPVC', 'each', 19.78, 25.71, true, NULL),
    ('Rigid PVC', 'RPVC-1.25-LB', '1-1/4 LB', 'each', 15.28, 19.86, true, NULL),
    ('Rigid PVC', 'RPVC-1.25', '1-1/4 RPVC', 'each', 23.44, 30.47, true, NULL),
    ('Rigid PVC', 'RPVC-1.25-TA', '1-1/4 TA', 'each', 2.53, 3.29, true, NULL),
    ('Rigid PVC', 'RPVC-1/2-LB', '1/2 LB', 'each', 6.17, 8.02, true, NULL),
    ('Rigid PVC', 'RPVC-1/2', '1/2 RPVC', 'each', 11.47, 14.91, true, NULL),
    ('Rigid PVC', 'RPVC-1/2-TA', '1/2 TA', 'each', 1.27, 1.65, true, NULL),
    ('Rigid PVC', 'RPVC-2', '2 RPVC', 'each', 42.24, 54.91, true, NULL),
    ('Rigid PVC', 'RPVC-2-LB', '2" LB', 'each', 31.95, 41.54, true, NULL),
    ('Rigid PVC', 'RPVC-2-TA', '2" TA', 'each', 4.42, 5.75, true, NULL),
    ('Rigid PVC', 'RPVC-3', '3" RPVC', 'each', 93.69, 121.80, true, NULL),
    ('Rigid PVC', 'RPVC-3/4-LB', '3/4 LB', 'each', 7.11, 9.24, true, NULL),
    ('Rigid PVC', 'RPVC-3/4', '3/4 RPVC', 'each', 13.47, 17.51, true, NULL),
    ('Rigid PVC', 'RPVC-3/4-TA', '3/4 TA', 'each', 2.16, 2.81, true, NULL),
    ('Service', 'MM202', '2" Weather Head', 'each', 70.96, 92.25, true, NULL),
    ('Service', 'AR586', 'Anchor', 'each', 62.51, 81.26, true, NULL),
    ('Service', 'CLASS5-POLE', 'Class 5 25 ft Pole', 'length', 872.84, 1134.69, true, NULL),
    ('Service', 'AL426', 'Clevis/Bolt', 'each', 21.39, 27.81, true, NULL),
    ('Service', 'GW516110-100', 'Guy Wire (per ft)', 'ft', 1.66, 2.16, true, NULL),
    ('Service', 'GE516', 'Guy Wire Wrap', 'each', 11.51, 14.96, true, NULL),
    ('Service', 'BS052', 'Hub Adapter', 'each', 38.33, 49.83, true, NULL),
    ('Service', '504WGS', 'Insulator', 'each', 35.31, 45.90, true, NULL),
    ('Service', 'LRING', 'Meter Ring', 'each', 16.84, 21.89, true, NULL),
    ('Service', 'C-PWD6F', 'Shaw Box', 'each', 51.61, 67.09, true, NULL),
    ('Service', 'T-PWD6S', 'Telus Box', 'each', 51.61, 67.09, true, NULL),
    ('Switches', '5601-P2W', 'Single Pole Switch', 'each', 2.54, 3.30, true, NULL),
    ('Switches', '5603-P2W', '3-Way Switch', 'each', 3.98, 5.17, true, NULL),
    ('Switches', '5604-2W', '4-Way Switch', 'each', 21.86, 28.42, true, NULL),
    ('Switches', 'VPT24-1PZ', 'Astrological Timer', 'each', 45.00, 58.50, true, NULL),
    ('Switches', 'DVCL-153PH-WHC', 'Dimmer', 'each', 43.19, 56.15, true, NULL),
    ('Switches', 'DOS05-1LZ', 'Motion', 'each', 34.91, 45.38, true, NULL),
    ('Switches', 'ODC0S-I1W', 'Occupancy', 'each', 168.92, 219.60, true, NULL),
    ('Labour', 'Labour', 'Labour', 'each', 65.00, 84.50, true, NULL),
    ('Labour', 'Excavator rental', 'Excavator rental', 'each', 600.00, 780.00, true, NULL),
    ('Labour', 'Permit', 'Permit', 'each', 1066.24, 1386.11, true, NULL),
    ('Misc', 'DIVVEE-60', 'Divvee load sharing 60a', 'each', 1224.16, 1591.41, true, NULL),
    ('Breakers', '2p60a Commader', '2p60a Commader', 'each', 62.65, 81.45, true, NULL)
) AS seed(category, sku, name, unit, cost_price, unit_price, is_active, notes);
