BEGIN;
-- Explicit review action. Do not turn a held price into a duplicate material.
CREATE OR REPLACE FUNCTION public.ebh_review_create_material(p_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h ebh_price_history%ROWTYPE; org uuid:=fn_current_org_id(); target uuid; normalized text;
BEGIN
 IF coalesce(fn_current_role()::text,'') NOT IN ('owner','office') OR org IS NULL THEN RAISE EXCEPTION 'not_allowed'; END IF;
 PERFORM 1 FROM ebh_price_sync WHERE org_id=org FOR UPDATE;
 SELECT * INTO STRICT h FROM ebh_price_history WHERE id=p_id AND org_id=org FOR UPDATE;
 IF h.status<>'review' THEN RAISE EXCEPTION 'already_reviewed'; END IF;
 IF h.catalog_item_id IS NOT NULL THEN RAISE EXCEPTION 'material_already_linked'; END IF;
 normalized:=regexp_replace(upper(h.supplier_sku),'[^A-Z0-9]','','g');
 IF normalized='' OR trim(h.description)='' OR h.new_cost IS NULL OR h.new_cost<=0 OR h.unit NOT IN ('each','m') THEN RAISE EXCEPTION 'invalid_invoice_material'; END IF;
 IF h.reason IN ('credit_memo','unknown_pricing_unit','older_invoice') THEN RAISE EXCEPTION 'invalid_invoice_material'; END IF;
 IF EXISTS(SELECT 1 FROM catalog_items c WHERE c.org_id=org AND c.deleted_at IS NULL AND (
   regexp_replace(upper(coalesce(c.sku,'')),'[^A-Z0-9]','','g')=normalized
   OR lower(trim(c.name))=lower(trim(h.description))
   OR EXISTS(SELECT 1 FROM unnest(c.aliases) a WHERE regexp_replace(upper(a),'[^A-Z0-9]','','g')=normalized)
 )) OR EXISTS(SELECT 1 FROM ebh_price_mappings WHERE org_id=org AND supplier_sku=normalized) THEN RAISE EXCEPTION 'material_already_exists'; END IF;
 INSERT INTO catalog_items(org_id,name,sku,unit,cost_price,unit_price,category,notes,updated_by)
 VALUES(org,h.description,h.supplier_sku,h.unit,NULL,NULL,'E.B. Horsman','Created after invoice review. Supplier cost + 12%.',auth.uid()) RETURNING id INTO target;
 UPDATE ebh_price_history SET catalog_item_id=target WHERE id=h.id;
 -- Reuse the approval guards for invoice age, newer invoices, units and audit history.
 PERFORM public.ebh_review_price(h.id,true,NULL);
 RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION public.ebh_review_create_material(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ebh_review_create_material(uuid) TO authenticated;
COMMIT;
