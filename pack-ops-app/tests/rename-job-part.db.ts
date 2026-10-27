// @vitest-environment node
import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
it('renames job records atomically, preserves values and composes estimate names',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`CREATE SCHEMA auth; CREATE ROLE authenticated;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
 CREATE FUNCTION fn_current_org_id() RETURNS uuid LANGUAGE sql AS $$ SELECT auth.uid() $$;
 CREATE FUNCTION fn_current_role() RETURNS text LANGUAGE sql AS $$ SELECT 'owner'::text $$;
 CREATE TABLE jobs(id uuid,org_id uuid,deleted_at timestamptz,estimate_snapshot jsonb,updated_by uuid,updated_at timestamptz,estimated_hours numeric);
 CREATE TABLE job_materials(job_id uuid,org_id uuid,deleted_at timestamptz,section_name text,quantity numeric,updated_by uuid,updated_at timestamptz);
 CREATE TABLE time_entries(LIKE job_materials); CREATE TABLE job_manual_actual_cost_lines(LIKE job_materials);
 CREATE TABLE action_items(entity_type text,entity_id uuid,org_id uuid,deleted_at timestamptz,description text,updated_at timestamptz);
 INSERT INTO jobs VALUES(auth.uid(),auth.uid(),null,'{"materials":[{"sectionName":"Rough","quantity":7}]}',null,null,8);
 INSERT INTO job_materials VALUES(auth.uid(),auth.uid(),null,'Rough',7,null,null);
 INSERT INTO time_entries VALUES(auth.uid(),auth.uid(),null,'Rough',2.5,null,null);
 INSERT INTO action_items VALUES('jobs',auth.uid(),auth.uid(),null,E'Job part: Rough\\n\\nDo this',null);`);
 await db.exec(readFileSync('supabase/migrations/0077_rename_job_part.sql','utf8'));
 await db.exec(`SELECT rename_job_part(auth.uid(),'Rough','Kitchen'); SELECT rename_job_part(auth.uid(),'Kitchen','Suite');`);
 expect((await db.query('SELECT section_name,quantity::text FROM job_materials')).rows).toEqual([{section_name:'Suite',quantity:'7'}]);
 expect((await db.query('SELECT section_name,quantity::text FROM time_entries')).rows).toEqual([{section_name:'Suite',quantity:'2.5'}]);
 expect((await db.query('SELECT description FROM action_items')).rows).toEqual([{description:'Job part: Suite\n\nDo this'}]);
 expect((await db.query<any>('SELECT estimate_snapshot FROM jobs')).rows[0].estimate_snapshot.partNames).toEqual({Rough:'Suite',Kitchen:'Suite'});
 await db.exec(`INSERT INTO job_materials VALUES(auth.uid(),auth.uid(),null,'Finish',1,null,null);`);
 await expect(db.exec(`SELECT rename_job_part(auth.uid(),'Suite','finish')`)).rejects.toThrow('already exists');
 expect((await db.query('SELECT section_name FROM time_entries')).rows).toEqual([{section_name:'Suite'}]);
 await db.exec(`CREATE OR REPLACE FUNCTION fn_current_role() RETURNS text LANGUAGE sql AS $$ SELECT 'field'::text $$;`);
 await expect(db.exec(`SELECT rename_job_part(auth.uid(),'Suite','Other')`)).rejects.toThrow('Only the owner');
 }finally{await db.close();}
});
