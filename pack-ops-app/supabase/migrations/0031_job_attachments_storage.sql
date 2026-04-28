INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('job-attachments', 'job-attachments', false, 52428800)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "job_attachments_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-attachments'
  AND split_part(name, '/', 1) = fn_current_org_id()::text
);

CREATE POLICY "job_attachments_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'job-attachments'
  AND split_part(name, '/', 1) = fn_current_org_id()::text
);

CREATE POLICY "job_attachments_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'job-attachments'
  AND split_part(name, '/', 1) = fn_current_org_id()::text
)
WITH CHECK (
  bucket_id = 'job-attachments'
  AND split_part(name, '/', 1) = fn_current_org_id()::text
);

CREATE POLICY "job_attachments_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'job-attachments'
  AND split_part(name, '/', 1) = fn_current_org_id()::text
);
