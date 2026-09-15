BEGIN;
-- Invoice files stay private and readable only by the owning organization's office.
CREATE POLICY ebh_invoice_source_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='documents' AND split_part(name,'/',1)=public.fn_current_org_id()::text
 AND split_part(name,'/',2)='ebh-prices' AND public.fn_current_role() IN ('owner','office')
 AND EXISTS(SELECT 1 FROM public.ebh_invoice_queue q WHERE q.org_id=public.fn_current_org_id() AND q.storage_path=name));
-- Supplier fee annotations are provenance, not part of the product name.
UPDATE public.catalog_items c SET name=regexp_replace(c.name,' ECO Fee:.*$','')
FROM public.ebh_price_history h WHERE h.catalog_item_id=c.id AND h.org_id=c.org_id
 AND h.status='created' AND c.name=h.description AND h.description~' ECO Fee:';
UPDATE public.ebh_price_history SET description=regexp_replace(description,' ECO Fee:.*$','') WHERE description~' ECO Fee:';
UPDATE public.ebh_price_receipts r SET payload=jsonb_set(payload,'{lines}',(
 SELECT jsonb_agg(jsonb_set(l,'{description}',to_jsonb(regexp_replace(l->>'description',' ECO Fee:.*$',''))) ORDER BY n)
 FROM jsonb_array_elements(r.payload->'lines') WITH ORDINALITY AS t(l,n)))
 WHERE payload::text~'ECO Fee:';
COMMIT;
