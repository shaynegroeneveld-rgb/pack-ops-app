BEGIN;
-- Once per day at 14:00 UTC (7 a.m. Pacific daylight / 6 a.m. standard).
SELECT cron.schedule('ebh-material-prices','0 14 * * *','select public.ebh_run_scheduled_sync();');
COMMIT;
