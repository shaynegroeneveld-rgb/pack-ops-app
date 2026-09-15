BEGIN;
CREATE TABLE public.ebh_price_sync (
 org_id uuid PRIMARY KEY REFERENCES public.orgs(id), account_id text NOT NULL, branch_id text NOT NULL,
 gmail_email text NOT NULL, enabled boolean NOT NULL DEFAULT false,
 scan_start timestamptz, scan_end timestamptz, page_token text, scanned_through timestamptz,
 last_started_at timestamptz, last_completed_at timestamptz, last_error text,
 lease_until timestamptz, lease_id uuid
);
CREATE TABLE public.ebh_invoice_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.orgs(id),
 message_id text NOT NULL, attachment_id text NOT NULL, file_name text NOT NULL,
 received_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0, error text, storage_path text, invoice_number text,
 created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 UNIQUE(org_id,message_id,attachment_id)
);
CREATE TABLE public.ebh_price_receipts (
 org_id uuid NOT NULL REFERENCES public.orgs(id), invoice_number text NOT NULL, payload jsonb NOT NULL,
 queue_id uuid REFERENCES public.ebh_invoice_queue(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,invoice_number)
);
CREATE TABLE public.ebh_price_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.orgs(id),
 invoice_number text NOT NULL, invoice_date date NOT NULL, line_number integer NOT NULL,
 supplier_sku text NOT NULL, description text NOT NULL, unit text NOT NULL,
 supplier_price numeric NOT NULL, price_basis numeric NOT NULL, new_cost numeric NOT NULL,
 old_cost numeric, catalog_item_id uuid, status text NOT NULL, reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,invoice_number,line_number),
 FOREIGN KEY(org_id,catalog_item_id) REFERENCES public.catalog_items(org_id,id)
);
CREATE TABLE public.ebh_price_mappings (
 org_id uuid NOT NULL REFERENCES public.orgs(id), supplier_sku text NOT NULL,
 catalog_item_id uuid NOT NULL, last_invoice_date date NOT NULL, last_cost numeric NOT NULL,
 PRIMARY KEY(org_id,supplier_sku), UNIQUE(org_id,catalog_item_id),
 FOREIGN KEY(org_id,catalog_item_id) REFERENCES public.catalog_items(org_id,id)
);
CREATE INDEX ebh_queue_pending ON public.ebh_invoice_queue(org_id,status,received_at);
CREATE INDEX ebh_history_recent ON public.ebh_price_history(org_id,created_at DESC);
ALTER TABLE public.ebh_price_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebh_invoice_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebh_price_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebh_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebh_price_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ebh_price_sync,public.ebh_invoice_queue,public.ebh_price_receipts,public.ebh_price_history,public.ebh_price_mappings FROM anon,authenticated;
GRANT ALL ON public.ebh_price_sync,public.ebh_invoice_queue,public.ebh_price_receipts,public.ebh_price_history,public.ebh_price_mappings TO service_role;
GRANT SELECT ON public.ebh_price_sync,public.ebh_invoice_queue,public.ebh_price_history TO authenticated;
CREATE POLICY ebh_sync_read ON public.ebh_price_sync FOR SELECT TO authenticated USING(org_id=public.fn_current_org_id() AND public.fn_current_role() IN ('owner','office'));
CREATE POLICY ebh_queue_read ON public.ebh_invoice_queue FOR SELECT TO authenticated USING(org_id=public.fn_current_org_id() AND public.fn_current_role() IN ('owner','office'));
CREATE POLICY ebh_history_read ON public.ebh_price_history FOR SELECT TO authenticated USING(org_id=public.fn_current_org_id() AND public.fn_current_role() IN ('owner','office'));
CREATE FUNCTION public.ebh_claim_sync(p_org uuid,p_lease uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH claimed AS (UPDATE ebh_price_sync SET lease_until=now()+interval '5 minutes',lease_id=p_lease,last_started_at=now()
 WHERE org_id=p_org AND enabled AND coalesce(lease_until,'-infinity')<now() RETURNING 1) SELECT EXISTS(SELECT 1 FROM claimed);
$$;
CREATE FUNCTION public.ebh_apply_invoice(p_org uuid,p_queue uuid,p_invoice jsonb,p_dry_run boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg ebh_price_sync%ROWTYPE; old_receipt ebh_price_receipts%ROWTYPE; l jsonb;
 c catalog_items%ROWTYPE; m ebh_price_mappings%ROWTYPE; matches uuid[]; ids text[];
 inv text:=p_invoice->>'invoiceNumber'; d date:=(p_invoice->>'invoiceDate')::date;
 sku text; cost numeric; reason text; state text; prior numeric; target uuid; results jsonb:='[]';
BEGIN
 SELECT * INTO STRICT cfg FROM ebh_price_sync WHERE org_id=p_org FOR UPDATE;
 IF NOT cfg.enabled AND NOT p_dry_run THEN RAISE EXCEPTION 'sync_disabled'; END IF;
 IF p_invoice->>'accountId' IS DISTINCT FROM cfg.account_id OR p_invoice->>'branchId' IS DISTINCT FROM cfg.branch_id
 OR inv IS NULL OR inv!~'^[0-9]+$' OR d IS NULL OR d>current_date OR d<current_date-30
 OR jsonb_typeof(p_invoice->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_invoice->'lines') NOT BETWEEN 1 AND 500
 THEN RAISE EXCEPTION 'invalid_invoice'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ebh_invoice_queue WHERE org_id=p_org AND id=p_queue) THEN RAISE EXCEPTION 'wrong_queue'; END IF;
 SELECT * INTO old_receipt FROM ebh_price_receipts WHERE org_id=p_org AND invoice_number=inv;
 IF FOUND THEN
  IF old_receipt.payload IS DISTINCT FROM p_invoice THEN RAISE EXCEPTION 'invoice_content_changed'; END IF;
  RETURN jsonb_build_object('duplicate',true,'lines','[]'::jsonb);
 END IF;
 -- Serialize the short decision/write transaction with manual catalog edits too.
 LOCK TABLE public.catalog_items IN SHARE ROW EXCLUSIVE MODE;
 FOR l IN SELECT value FROM jsonb_array_elements(p_invoice->'lines') LOOP
  sku:=regexp_replace(upper(l->>'sku'),'[^A-Z0-9]','','g');
  cost:=round((l->>'supplierPrice')::numeric/(l->>'priceBasis')::numeric*1.12,2);
  IF sku='' OR length(sku)>100 OR cost<=0 OR cost>99999999 OR cost::text IN ('NaN','Infinity','-Infinity')
   OR (l->>'priceBasis')::numeric NOT IN (1,100) OR l->>'unit' NOT IN ('each','m','ft')
   OR (l->>'quantity')::numeric<=0 OR abs(round((l->>'supplierPrice')::numeric/(l->>'priceBasis')::numeric*(l->>'quantity')::numeric,2)-(l->>'extendedAmount')::numeric)>.01
   OR cost IS DISTINCT FROM (l->>'internalCost')::numeric OR coalesce(l->>'description','')='' THEN RAISE EXCEPTION 'invalid_line'; END IF;
  reason:=NULL; state:='updated'; prior:=NULL; target:=NULL; c:=NULL; m:=NULL;
  ids:=ARRAY[sku,regexp_replace(upper(coalesce(l->>'orderedAs','')),'[^A-Z0-9]','','g')];
  SELECT * INTO m FROM ebh_price_mappings WHERE org_id=p_org AND supplier_sku=sku;
  SELECT array_agg(id) INTO matches FROM catalog_items WHERE org_id=p_org AND deleted_at IS NULL AND regexp_replace(upper(coalesce(catalog_items.sku,'')),'[^A-Z0-9]','','g')=ANY(array_remove(ids,''));
  IF cardinality(matches)>1 THEN reason:='duplicate_catalog_sku';
  ELSIF m.catalog_item_id IS NOT NULL AND (cardinality(matches) IS DISTINCT FROM 1 OR matches[1]<>m.catalog_item_id) THEN reason:='catalog_mapping_changed';
  ELSIF cardinality(matches)=1 THEN
   SELECT * INTO c FROM catalog_items WHERE id=matches[1] AND org_id=p_org;
   target:=c.id; prior:=c.cost_price;
   IF NOT c.is_active THEN reason:='inactive_material';
   ELSIF lower(trim(c.unit))<>l->>'unit' AND NOT(lower(trim(c.unit))='ea' AND l->>'unit'='each') THEN reason:='unit_mismatch';
   ELSIF m.last_invoice_date>d THEN reason:='older_invoice';
   ELSIF m.last_invoice_date=d AND m.last_cost<>cost THEN reason:='same_day_price_conflict';
   ELSIF m.catalog_item_id IS NOT NULL AND c.cost_price IS DISTINCT FROM m.last_cost THEN reason:='manual_price_change';
   ELSIF m.catalog_item_id IS NULL AND c.updated_at> (d+1)::timestamptz AND c.cost_price IS DISTINCT FROM cost THEN reason:='catalog_edited_after_invoice';
   ELSIF c.cost_price>0 AND abs(cost-c.cost_price)/c.cost_price>.20 THEN reason:='price_change_over_20_percent';
   ELSE IF c.cost_price=cost THEN state:='unchanged'; END IF; END IF;
  ELSE
   state:='created';
   IF EXISTS(SELECT 1 FROM catalog_items ci WHERE ci.org_id=p_org AND (
    regexp_replace(upper(coalesce(ci.sku,'')),'[^A-Z0-9]','','g')=ANY(array_remove(ids,''))
    OR lower(regexp_replace(ci.name,'\s+',' ','g'))=lower(regexp_replace(l->>'description','\s+',' ','g'))
    OR EXISTS(SELECT 1 FROM unnest(ci.aliases) a WHERE regexp_replace(upper(a),'[^A-Z0-9]','','g')=ANY(array_remove(ids,'')))
    OR (ci.deleted_at IS NULL AND (ci.sku IS NULL OR trim(ci.sku)='') AND similarity(ci.name,l->>'description')>.6)
   )) THEN reason:='possible_existing_material'; END IF;
  END IF;
  IF reason IS NOT NULL THEN state:='review'; END IF;
  IF NOT p_dry_run THEN
   IF state='created' THEN
    INSERT INTO catalog_items(org_id,name,sku,unit,cost_price,unit_price,category,notes,aliases)
    VALUES(p_org,l->>'description',l->>'sku',l->>'unit',cost,NULL,'E.B. Horsman',
     'Added from E.B. Horsman invoice '||inv||'. Supplier cost + 12%.',
     CASE WHEN coalesce(l->>'orderedAs','')<>'' AND l->>'orderedAs'<>l->>'sku' THEN ARRAY[l->>'orderedAs'] ELSE '{}'::text[] END) RETURNING id INTO target;
   ELSIF state='updated' THEN UPDATE catalog_items SET cost_price=cost,updated_at=now(),updated_by=NULL WHERE org_id=p_org AND id=target;
   END IF;
   IF state IN ('created','updated','unchanged') THEN
    INSERT INTO ebh_price_mappings(org_id,supplier_sku,catalog_item_id,last_invoice_date,last_cost) VALUES(p_org,sku,target,d,cost)
    ON CONFLICT(org_id,supplier_sku) DO UPDATE SET last_invoice_date=excluded.last_invoice_date,last_cost=excluded.last_cost;
   END IF;
   INSERT INTO ebh_price_history(org_id,invoice_number,invoice_date,line_number,supplier_sku,description,unit,supplier_price,price_basis,new_cost,old_cost,catalog_item_id,status,reason)
   VALUES(p_org,inv,d,(l->>'lineNumber')::integer,l->>'sku',l->>'description',l->>'unit',(l->>'supplierPrice')::numeric,(l->>'priceBasis')::numeric,cost,prior,target,state,reason);
  END IF;
  results:=results||jsonb_build_array(jsonb_build_object('sku',l->>'sku','status',state,'reason',reason,'oldCost',prior,'newCost',cost));
 END LOOP;
 IF NOT p_dry_run THEN INSERT INTO ebh_price_receipts(org_id,invoice_number,payload,queue_id) VALUES(p_org,inv,p_invoice,p_queue); END IF;
 RETURN jsonb_build_object('duplicate',false,'lines',results);
END;
$$;
REVOKE ALL ON FUNCTION public.ebh_claim_sync(uuid,uuid),public.ebh_apply_invoice(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ebh_claim_sync(uuid,uuid),public.ebh_apply_invoice(uuid,uuid,jsonb,boolean) TO service_role;
COMMIT;
