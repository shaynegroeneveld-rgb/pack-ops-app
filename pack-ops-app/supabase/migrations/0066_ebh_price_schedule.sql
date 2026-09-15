BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE FUNCTION public.ebh_run_scheduled_sync() RETURNS SETOF bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE secret text; cfg record;
BEGIN
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='ebh_import_secret';
 IF secret IS NULL THEN RAISE EXCEPTION 'ebh_import_secret_not_configured'; END IF;
 FOR cfg IN SELECT org_id FROM public.ebh_price_sync WHERE enabled LOOP
  RETURN NEXT net.http_post(
   url:='https://bktlwcqllvxkxbeibrhl.supabase.co/functions/v1/ebh-price-import',
   headers:=jsonb_build_object('Content-Type','application/json','x-ebh-secret',secret),
   body:=jsonb_build_object('orgId',cfg.org_id),timeout_milliseconds:=120000);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.ebh_run_scheduled_sync() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ebh_run_scheduled_sync() TO postgres;
SELECT cron.schedule('ebh-material-prices','*/15 * * * *','select public.ebh_run_scheduled_sync();');
COMMIT;
