-- Correct only importer-added footer text, preserving any later name edits.
BEGIN;
UPDATE public.catalog_items c SET name=regexp_replace(c.name,' Total Lines: [0-9]+.*$','')
FROM public.ebh_price_history h WHERE h.catalog_item_id=c.id AND h.org_id=c.org_id
 AND h.status='created' AND c.name=h.description AND h.description~' Total Lines: [0-9]+';
UPDATE public.ebh_price_history SET description=regexp_replace(description,' Total Lines: [0-9]+.*$','')
 WHERE description~' Total Lines: [0-9]+';
UPDATE public.ebh_price_receipts r SET payload=jsonb_set(payload,'{lines}',(
 SELECT jsonb_agg(jsonb_set(l,'{description}',to_jsonb(regexp_replace(l->>'description',' Total Lines: [0-9]+.*$',''))) ORDER BY n)
 FROM jsonb_array_elements(r.payload->'lines') WITH ORDINALITY AS t(l,n)))
 WHERE payload::text~'Total Lines: [0-9]+';
COMMIT;
