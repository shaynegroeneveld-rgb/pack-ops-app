BEGIN;
-- Pack confirmed these legacy loose-wire prices are per metre, not per piece.
-- Keep costs and historical quote/job lines unchanged; correct catalog units only.
UPDATE public.catalog_items SET unit='m',updated_at=now()
WHERE org_id='a08f7e9d-ecdb-48d2-9687-1ae6f7ed915c'
 AND deleted_at IS NULL AND lower(trim(unit)) IN ('each','ea')
 AND (upper(coalesce(category,'')) IN ('ACWU/TECK','CABLE','NMD','NMD COPPER','WIRE')
      OR upper(name) ~ '(^RW90|^T90|^[0-9]+C[0-9/]+.*(TECK|ACWU))')
 AND upper(name) !~ '(CONN|CLAMP|BOX|STRAP|NUT|PULL|STRIP|REEL|SPOOL|ROLL)';
COMMIT;
