-- Rename all current job records atomically. Issued quotes/invoices remain unchanged.
CREATE OR REPLACE FUNCTION public.rename_job_part(p_job_id uuid, p_old_name text, p_new_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  job_row jobs%ROWTYPE;
  old_name text := btrim(p_old_name);
  new_name text := btrim(p_new_name);
  overrides jsonb;
BEGIN
  IF auth.uid() IS NULL OR coalesce(fn_current_role()::text,'') NOT IN ('owner', 'office') THEN
    RAISE EXCEPTION 'Only the owner or office can rename a job part.';
  END IF;
  IF old_name IS NULL OR old_name = '' OR new_name IS NULL OR new_name = '' OR length(new_name) > 120 OR new_name ~ E'[\r\n]' THEN
    RAISE EXCEPTION 'Enter a valid part name.';
  END IF;
  SELECT * INTO job_row FROM jobs WHERE id=p_job_id AND org_id=fn_current_org_id() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found.'; END IF;
  IF old_name=new_name THEN RETURN; END IF;
  -- Do not silently merge two populated parts.
  IF EXISTS (SELECT 1 FROM (
    SELECT section_name AS name FROM job_materials WHERE job_id=p_job_id AND org_id=job_row.org_id AND deleted_at IS NULL
    UNION ALL SELECT section_name FROM time_entries WHERE job_id=p_job_id AND org_id=job_row.org_id AND deleted_at IS NULL
    UNION ALL SELECT section_name FROM job_manual_actual_cost_lines WHERE job_id=p_job_id AND org_id=job_row.org_id AND deleted_at IS NULL
  ) parts WHERE lower(coalesce(nullif(btrim(name),''),'General'))=lower(new_name)
    AND coalesce(nullif(btrim(name),''),'General')<>old_name) THEN
    RAISE EXCEPTION 'That part already exists. Choose a different name.';
  END IF;
  UPDATE job_materials SET section_name=new_name, updated_by=auth.uid(),updated_at=now()
    WHERE job_id=p_job_id AND org_id=job_row.org_id AND deleted_at IS NULL AND coalesce(nullif(btrim(section_name),''),'General')=old_name;
  UPDATE time_entries SET section_name=new_name, updated_by=auth.uid(),updated_at=now()
    WHERE job_id=p_job_id AND org_id=job_row.org_id AND deleted_at IS NULL AND coalesce(nullif(btrim(section_name),''),'General')=old_name;
  UPDATE job_manual_actual_cost_lines SET section_name=new_name, updated_by=auth.uid(),updated_at=now()
    WHERE job_id=p_job_id AND org_id=job_row.org_id AND deleted_at IS NULL AND coalesce(nullif(btrim(section_name),''),'General')=old_name;
  UPDATE action_items SET description='Job part: ' || new_name || E'\n\n' ||
      CASE WHEN description LIKE 'Job part: %' THEN ltrim(substr(description, length(split_part(description,E'\n',1))+1),E'\n') ELSE coalesce(description,'') END,
      updated_at=now()
    WHERE entity_type='jobs' AND entity_id=p_job_id AND org_id=job_row.org_id AND deleted_at IS NULL
      AND CASE WHEN description LIKE 'Job part: %' THEN coalesce(nullif(btrim(substr(split_part(description,E'\n',1),11)),''),'General') ELSE 'General' END=old_name;
  -- Resolve estimate labels on the job without editing the customer's source quote.
  SELECT coalesce(jsonb_object_agg(key, CASE WHEN value=old_name THEN new_name ELSE value END),'{}'::jsonb)
    INTO overrides FROM jsonb_each_text(coalesce(job_row.estimate_snapshot->'partNames','{}'::jsonb));
  overrides := overrides || jsonb_build_object(old_name,new_name);
  UPDATE jobs SET estimate_snapshot=jsonb_set(coalesce(estimate_snapshot,jsonb_build_object('sourceQuoteId',null,'sourceQuoteNumber',null,'generatedAt',now(),'laborHours',job_row.estimated_hours,'materials','[]'::jsonb,'laborLines','[]'::jsonb)),'{partNames}',overrides),updated_by=auth.uid(),updated_at=now()
    WHERE id=p_job_id AND org_id=job_row.org_id;
END;
$$;
REVOKE ALL ON FUNCTION public.rename_job_part(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_job_part(uuid,text,text) TO authenticated;
