BEGIN;
ALTER TABLE public.ebh_price_history ADD COLUMN reviewed_at timestamptz, ADD COLUMN reviewed_by uuid REFERENCES public.users(id);
CREATE FUNCTION public.ebh_review_price(p_id uuid,p_use_price boolean,p_expected_cost numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h ebh_price_history%ROWTYPE; c catalog_items%ROWTYPE; m ebh_price_mappings%ROWTYPE; org uuid:=fn_current_org_id();
BEGIN
 IF coalesce(fn_current_role()::text,'') NOT IN ('owner','office') OR org IS NULL THEN RAISE EXCEPTION 'not_allowed'; END IF;
 PERFORM 1 FROM ebh_price_sync WHERE org_id=org FOR UPDATE;
 SELECT * INTO STRICT h FROM ebh_price_history WHERE id=p_id AND org_id=org FOR UPDATE;
 IF h.status<>'review' THEN RAISE EXCEPTION 'already_reviewed'; END IF;
 IF p_use_price THEN
  IF h.catalog_item_id IS NULL THEN RAISE EXCEPTION 'resolve_material_match_first'; END IF;
  SELECT * INTO STRICT c FROM catalog_items WHERE id=h.catalog_item_id AND org_id=org FOR UPDATE;
  IF c.deleted_at IS NOT NULL OR NOT c.is_active OR c.unit<>h.unit AND NOT(c.unit='ea' AND h.unit='each') THEN RAISE EXCEPTION 'material_or_unit_changed'; END IF;
  IF c.cost_price IS DISTINCT FROM p_expected_cost THEN RAISE EXCEPTION 'cost_changed_refresh_first'; END IF;
  IF h.invoice_date<current_date-30 THEN RAISE EXCEPTION 'invoice_too_old'; END IF;
  SELECT * INTO m FROM ebh_price_mappings WHERE org_id=org AND supplier_sku=regexp_replace(upper(h.supplier_sku),'[^A-Z0-9]','','g');
  IF m.last_invoice_date>h.invoice_date THEN RAISE EXCEPTION 'newer_invoice_exists'; END IF;
  UPDATE catalog_items SET cost_price=h.new_cost,updated_by=auth.uid(),updated_at=now() WHERE id=c.id AND org_id=org;
  INSERT INTO ebh_price_mappings(org_id,supplier_sku,catalog_item_id,last_invoice_date,last_cost)
  VALUES(org,regexp_replace(upper(h.supplier_sku),'[^A-Z0-9]','','g'),c.id,h.invoice_date,h.new_cost)
  ON CONFLICT(org_id,supplier_sku) DO UPDATE SET last_invoice_date=excluded.last_invoice_date,last_cost=excluded.last_cost;
  UPDATE ebh_price_history SET old_cost=c.cost_price WHERE id=h.id;
 END IF;
 UPDATE ebh_price_history SET status=CASE WHEN p_use_price THEN 'approved' ELSE 'dismissed' END,reviewed_at=now(),reviewed_by=auth.uid() WHERE id=h.id;
END;
$$;
REVOKE ALL ON FUNCTION public.ebh_review_price(uuid,boolean,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ebh_review_price(uuid,boolean,numeric) TO authenticated;
COMMIT;
