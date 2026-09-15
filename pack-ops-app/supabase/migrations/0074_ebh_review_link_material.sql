BEGIN;
CREATE FUNCTION public.ebh_review_link_material(p_id uuid,p_catalog_item_id uuid,p_expected_cost numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h ebh_price_history%ROWTYPE; org uuid:=fn_current_org_id(); mapped uuid;
BEGIN
 IF coalesce(fn_current_role()::text,'') NOT IN ('owner','office') OR org IS NULL THEN RAISE EXCEPTION 'not_allowed'; END IF;
 PERFORM 1 FROM ebh_price_sync WHERE org_id=org FOR UPDATE;
 SELECT * INTO STRICT h FROM ebh_price_history WHERE id=p_id AND org_id=org FOR UPDATE;
 IF h.status<>'review' THEN RAISE EXCEPTION 'already_reviewed'; END IF;
 IF h.catalog_item_id IS NOT NULL AND h.catalog_item_id<>p_catalog_item_id THEN RAISE EXCEPTION 'material_already_linked'; END IF;
 PERFORM 1 FROM catalog_items WHERE id=p_catalog_item_id AND org_id=org AND deleted_at IS NULL AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'material_or_unit_changed'; END IF;
 SELECT catalog_item_id INTO mapped FROM ebh_price_mappings WHERE org_id=org AND supplier_sku=regexp_replace(upper(h.supplier_sku),'[^A-Z0-9]','','g');
 IF mapped IS NOT NULL AND mapped<>p_catalog_item_id THEN RAISE EXCEPTION 'material_already_linked'; END IF;
 UPDATE ebh_price_history SET catalog_item_id=p_catalog_item_id WHERE id=h.id;
 PERFORM public.ebh_review_price(h.id,true,p_expected_cost);
END;
$$;
REVOKE ALL ON FUNCTION public.ebh_review_link_material(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ebh_review_link_material(uuid,uuid,numeric) TO authenticated;
COMMIT;
