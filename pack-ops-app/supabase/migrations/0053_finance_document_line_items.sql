-- ============================================================
-- FINANCE DOCUMENT LINE ITEMS
-- Review-based supplier invoice line items that can update/create
-- materials after explicit approval.
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_document_line_items (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  document_intake_id        uuid          NOT NULL,
  description              text          NOT NULL,
  quantity                 numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price               numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total                    numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  supplier_price           numeric(12,2) NOT NULL DEFAULT 0 CHECK (supplier_price >= 0),
  internal_cost            numeric(12,2) NOT NULL DEFAULT 0 CHECK (internal_cost >= 0),
  matched_catalog_item_id  uuid,
  match_confidence         numeric(4,3)  NOT NULL DEFAULT 0 CHECK (match_confidence >= 0 AND match_confidence <= 1),
  match_reason             text,
  review_status            text          NOT NULL DEFAULT 'new'
    CHECK (review_status IN ('new', 'updated_material', 'created_material', 'ignored')),
  applied_catalog_item_id  uuid,
  applied_at               timestamptz,
  applied_by               uuid          REFERENCES users(id),
  ignored_reason           text,
  created_by               uuid          REFERENCES users(id),
  updated_by               uuid          REFERENCES users(id),
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  deleted_at               timestamptz,
  UNIQUE (org_id, id),
  CONSTRAINT fk_finance_document_line_items_document
    FOREIGN KEY (org_id, document_intake_id) REFERENCES finance_document_intake(org_id, id),
  CONSTRAINT fk_finance_document_line_items_match
    FOREIGN KEY (org_id, matched_catalog_item_id) REFERENCES catalog_items(org_id, id),
  CONSTRAINT fk_finance_document_line_items_applied
    FOREIGN KEY (org_id, applied_catalog_item_id) REFERENCES catalog_items(org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_finance_document_line_items_document
  ON finance_document_line_items(org_id, document_intake_id, review_status)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_document_line_items_document_material_applied
  ON finance_document_line_items(org_id, document_intake_id, applied_catalog_item_id)
  WHERE deleted_at IS NULL
    AND applied_at IS NOT NULL
    AND applied_catalog_item_id IS NOT NULL;

CREATE TRIGGER trg_updated_at_finance_document_line_items
  BEFORE UPDATE ON finance_document_line_items FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE finance_document_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_document_line_items_select ON finance_document_line_items FOR SELECT
  USING (org_id = fn_current_org_id() AND deleted_at IS NULL
    AND fn_current_role() IN ('owner', 'office', 'bookkeeper'));

CREATE POLICY finance_document_line_items_insert ON finance_document_line_items FOR INSERT
  WITH CHECK (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office'));

CREATE POLICY finance_document_line_items_update ON finance_document_line_items FOR UPDATE
  USING (org_id = fn_current_org_id()
    AND fn_current_role() IN ('owner', 'office'));
