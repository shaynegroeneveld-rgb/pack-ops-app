import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite({ extensions: { pg_trgm } });
await db.exec(`create extension pg_trgm; create role anon;create role authenticated;create role service_role;
create schema auth; create table users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;create table orgs(id uuid primary key);create function fn_current_org_id() returns uuid language sql as $$ select null::uuid $$;create function fn_current_role() returns text language sql as $$ select 'owner'::text $$;
create table catalog_items(id uuid primary key default gen_random_uuid(),org_id uuid references orgs,name text,sku text,unit text,cost_price numeric,unit_price numeric,category text,notes text,aliases text[] default '{}',is_active boolean default true,deleted_at timestamptz,updated_at timestamptz default now(),updated_by uuid, unique(org_id,id));`);
await db.exec(
  fs.readFileSync("supabase/migrations/0064_ebh_automatic_prices.sql", "utf8"),
);
await db.exec(
  fs.readFileSync("supabase/migrations/0065_ebh_price_review.sql", "utf8"),
);
await db.exec(
  fs.readFileSync("supabase/migrations/0067_ebh_wire_pricing.sql", "utf8"),
);
await db.exec(
  fs.readFileSync("supabase/migrations/0069_ebh_sku_comparison.sql", "utf8"),
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/0071_ebh_newest_invoice_guard.sql",
    "utf8",
  ),
);
await db.exec(fs.readFileSync("supabase/migrations/0072_ebh_review_create_material.sql", "utf8"));
await db.exec(fs.readFileSync("supabase/migrations/0074_ebh_review_link_material.sql", "utf8"));
await db.exec(fs.readFileSync("supabase/migrations/0075_ebh_review_archived_duplicate.sql", "utf8"));
const org = "00000000-0000-0000-0000-000000000001";
await db.query(`insert into orgs values($1);`, [org]);
await db.query(
  `insert into ebh_price_sync(org_id,account_id,branch_id,gmail_email,enabled) values($1,'999','23','test@example.com',true)`,
  [org],
);
const q = (
  await db.query(
    `insert into ebh_invoice_queue(org_id,message_id,attachment_id,file_name,received_at) values($1,'m','a','invoice.pdf',now()) returning id`,
    [org],
  )
).rows[0].id;
const date = (await db.query(`select current_date::text as d`)).rows[0].d;
let seq = 100;
const invoice = (sku = "BOX1", price = 10) => ({
  invoiceNumber: String(seq++),
  invoiceDate: date,
  accountId: "999",
  branchId: "23",
  lines: [
    {
      lineNumber: 1,
      sku,
      description: "A brand new box",
      orderedAs: null,
      unit: "each",
      quantity: 1,
      supplierPrice: price,
      priceBasis: 1,
      extendedAmount: price,
      internalCost: Math.round(price * 112) / 100,
    },
  ],
});
async function apply(i, dry = false) {
  return (
    await db.query("select ebh_apply_invoice($1,$2,$3,$4) as r", [
      org,
      q,
      JSON.stringify(i),
      dry,
    ])
  ).rows[0].r;
}
let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log("PASS", name);
};
await test("dry run makes no catalog changes", async () => {
  assert.equal((await apply(invoice(), true)).lines[0].status, "created");
  assert.equal(
    (await db.query("select count(*)::int n from catalog_items")).rows[0].n,
    0,
  );
});
let first = invoice();
await test("create with 12% and no selling price", async () => {
  assert.equal((await apply(first)).lines[0].status, "created");
  const c = (await db.query("select * from catalog_items")).rows[0];
  assert.equal(Number(c.cost_price), 11.2);
  assert.equal(c.unit_price, null);
});
await test("replay is idempotent", async () =>
  assert.equal((await apply(first)).duplicate, true));
await test("changed invoice rejected", async () => {
  await assert.rejects(
    () => apply({ ...first, lines: invoice("BOX1", 11).lines }),
    /invoice_content_changed/,
  );
});
await test("same-day price conflict held", async () =>
  assert.equal(
    (await apply(invoice("BOX1", 11))).lines[0].reason,
    "same_day_price_conflict",
  ));
await test("manual price edits held", async () => {
  await db.exec("update catalog_items set cost_price=12");
  assert.equal((await apply(invoice())).lines[0].reason, "manual_price_change");
});
await test("wrong account rejected", async () =>
  assert.rejects(
    () => apply({ ...invoice(), accountId: "other" }),
    /invalid_invoice/,
  ));
await test("unknown unit rejected", async () => {
  let i = invoice();
  i.lines[0].unit = "roll";
  await assert.rejects(() => apply(i), /invalid_line/);
});
await test("duplicate catalog code held", async () => {
  await db.query(
    `insert into catalog_items(org_id,name,sku,unit,cost_price) values($1,'Other','BOX1','each',11)`,
    [org],
  );
  assert.equal(
    (await apply(invoice())).lines[0].reason,
    "duplicate_catalog_sku",
  );
});
await test("ambiguous name not auto-created", async () =>
  assert.equal(
    (await apply(invoice("BOX2"))).lines[0].reason,
    "possible_existing_material",
  ));
await test("simultaneous leases excluded", async () => {
  assert.equal(
    (await db.query("select ebh_claim_sync($1,gen_random_uuid()) ok", [org]))
      .rows[0].ok,
    true,
  );
  assert.equal(
    (await db.query("select ebh_claim_sync($1,gen_random_uuid()) ok", [org]))
      .rows[0].ok,
    false,
  );
});
await test("wire with an existing informal catalog name is held", async () => {
  await db.query(
    `insert into catalog_items(org_id,name,unit,cost_price) values($1,'4c8 Teck','each',22.84)`,
    [org],
  );
  const i = invoice("TECK 4C8 1000V CU");
  Object.assign(i.lines[0], {
    description: "TECK COPPER 1000V",
    quantity: 42,
    unit: "m",
    supplierPrice: 20402.4358,
    priceBasis: 1000,
    extendedAmount: 856.9,
    internalCost: 22.85,
  });
  assert.equal((await apply(i)).lines[0].reason, "possible_existing_material");
});
await test("bad later line rolls back the entire invoice", async () => {
  const before = (
    await db.query("select count(*)::int n from ebh_price_history")
  ).rows[0].n;
  const i = invoice("NEW-ATOMIC");
  i.lines[0].description = "Unique atomic item";
  i.lines.push({ ...i.lines[0], lineNumber: 2, unit: "unknown" });
  await assert.rejects(() => apply(i), /invalid_line/);
  assert.equal(
    (await db.query("select count(*)::int n from ebh_price_history")).rows[0].n,
    before,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from catalog_items where sku='NEW-ATOMIC'",
      )
    ).rows[0].n,
    0,
  );
});
await test("anonymous callers cannot write prices", async () => {
  await db.exec("set role anon");
  try {
    await assert.rejects(() => apply(invoice()), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});
await test("price review rejects an unexpected current cost", async () => {
  await db.query("insert into users values($1)", [org]);
  await db.exec(
    `create or replace function fn_current_org_id() returns uuid language sql as $$ select '${org}'::uuid $$`,
  );
  const i = invoice("APPROVE1");
  i.lines[0].description = "Unique review product";
  await apply(i);
  await db.exec("update catalog_items set cost_price=12 where sku='APPROVE1'");
  i.invoiceNumber = String(seq++);
  await apply(i);
  const h = (
    await db.query(
      "select id from ebh_price_history where supplier_sku='APPROVE1' and status='review'",
    )
  ).rows[0];
  await assert.rejects(
    () => db.query("select ebh_review_price($1,true,99)", [h.id]),
    /cost_changed_refresh_first/,
  );
  await db.query("select ebh_review_price($1,true,12)", [h.id]);
  assert.equal(
    (await db.query("select status from ebh_price_history where id=$1", [h.id]))
      .rows[0].status,
    "approved",
  );
});
await test("a newer held invoice prevents an older automatic price", async () => {
  await db.query(
    `insert into catalog_items(org_id,name,sku,unit,cost_price,updated_at) values($1,'Newest guard','LATEST','each',30,'2026-01-01')`,
    [org],
  );
  const newer = invoice("LATEST", 50);
  newer.lines[0].description = "Newest guard";
  assert.equal(
    (await apply(newer)).lines[0].reason,
    "price_change_over_20_percent",
  );
  const older = invoice("LATEST", 28);
  older.lines[0].description = "Newest guard";
  older.invoiceDate = new Date(Date.parse(date + "T00:00:00Z") - 86400000)
    .toISOString()
    .slice(0, 10);
  assert.equal((await apply(older)).lines[0].reason, "older_invoice");
  assert.equal(
    Number(
      (
        await db.query(
          "select cost_price from catalog_items where sku='LATEST'",
        )
      ).rows[0].cost_price,
    ),
    30,
  );
});
await test("review fills a missing catalog cost", async () => {
  await db.query(`insert into catalog_items(org_id,name,sku,unit,cost_price) values($1,'Missing cost','NULLCOST','each',NULL)`, [org]);
  const h = (await db.query(`insert into ebh_price_history(org_id,invoice_number,invoice_date,line_number,supplier_sku,description,unit,supplier_price,price_basis,new_cost,catalog_item_id,status,reason) select $1,'NULLINV',current_date,1,'NULLCOST','Missing cost','each',10,1,11.2,id,'review','manual_price_change' from catalog_items where sku='NULLCOST' returning id`,[org])).rows[0];
  await db.query('select ebh_review_price($1,true,NULL)', [h.id]);
  assert.equal(Number((await db.query("select cost_price from catalog_items where sku='NULLCOST'")).rows[0].cost_price), 11.2);
});
await test("explicit create action creates a priced material once and audits the review", async () => {
  const h = (await db.query(`insert into ebh_price_history(org_id,invoice_number,invoice_date,line_number,supplier_sku,description,unit,supplier_price,price_basis,new_cost,status,reason) values($1,'REVIEWNEW',current_date,1,'NEWREVIEW','Distinct reviewed material','each',10,1,11.2,'review','possible_existing_material') returning id`, [org])).rows[0];
  const id = (await db.query('select ebh_review_create_material($1) as id',[h.id])).rows[0].id;
  const c = (await db.query('select * from catalog_items where id=$1',[id])).rows[0];
  assert.equal(Number(c.cost_price),11.2); assert.equal(c.unit_price,null);
  assert.equal((await db.query('select status from ebh_price_history where id=$1',[h.id])).rows[0].status,'approved');
  await assert.rejects(() => db.query('select ebh_review_create_material($1)',[h.id]), /already_reviewed/);
});
await test("create action refuses an exact existing SKU without changing review", async () => {
  const h = (await db.query(`insert into ebh_price_history(org_id,invoice_number,invoice_date,line_number,supplier_sku,description,unit,supplier_price,price_basis,new_cost,status,reason) values($1,'REVIEWDUP',current_date,1,'NEWREVIEW','Another description','each',10,1,11.2,'review','possible_existing_material') returning id`, [org])).rows[0];
  await assert.rejects(() => db.query('select ebh_review_create_material($1)',[h.id]), /material_already_exists/);
  assert.equal((await db.query('select status from ebh_price_history where id=$1',[h.id])).rows[0].status,'review');
});
await test("linking an unmatched invoice fills an existing blank cost without creating a material", async () => {
  const c = (await db.query(`insert into catalog_items(org_id,name,sku,unit,cost_price,unit_price) values($1,'Existing unpriced material','LOCAL-SKU','each',NULL,25) returning id`,[org])).rows[0];
  const h = (await db.query(`insert into ebh_price_history(org_id,invoice_number,invoice_date,line_number,supplier_sku,description,unit,supplier_price,price_basis,new_cost,status,reason) values($1,'LINKINV',current_date,1,'SUPPLIER-SKU','Supplier description','each',10,1,11.2,'review','possible_existing_material') returning id`,[org])).rows[0];
  const before = (await db.query('select count(*) as n from catalog_items')).rows[0].n;
  await db.query('select ebh_review_link_material($1,$2,NULL)',[h.id,c.id]);
  const updated = (await db.query('select * from catalog_items where id=$1',[c.id])).rows[0];
  assert.equal(Number(updated.cost_price),11.2); assert.equal(Number(updated.unit_price),25); assert.equal(updated.name,'Existing unpriced material');
  assert.equal((await db.query('select count(*) as n from catalog_items')).rows[0].n,before);
  assert.equal((await db.query("select catalog_item_id from ebh_price_mappings where supplier_sku='SUPPLIERSKU'")).rows[0].catalog_item_id,c.id);
});
await test("a unit mismatch rolls back the attempted link", async () => {
  const c = (await db.query(`insert into catalog_items(org_id,name,sku,unit,cost_price) values($1,'Wrong unit','WRONGUNIT','m',NULL) returning id`,[org])).rows[0];
  const h = (await db.query(`insert into ebh_price_history(org_id,invoice_number,invoice_date,line_number,supplier_sku,description,unit,supplier_price,price_basis,new_cost,status,reason) values($1,'WRONGINV',current_date,1,'WRONGSUPPLIER','Each product','each',10,1,11.2,'review','possible_existing_material') returning id`,[org])).rows[0];
  await assert.rejects(() => db.query('select ebh_review_link_material($1,$2,NULL)',[h.id,c.id]), /material_or_unit_changed/);
  assert.equal((await db.query('select catalog_item_id from ebh_price_history where id=$1',[h.id])).rows[0].catalog_item_id,null);
});
await test("an archived material does not block explicit creation of an active replacement", async () => {
  await db.query(`insert into catalog_items(org_id,name,sku,unit,cost_price,deleted_at) values($1,'Archived product','ARCHIVEDSKU','each',9,now())`,[org]);
  const h = (await db.query(`insert into ebh_price_history(org_id,invoice_number,invoice_date,line_number,supplier_sku,description,unit,supplier_price,price_basis,new_cost,status,reason) values($1,'ARCHINV',current_date,1,'ARCHIVEDSKU','Archived product','each',10,1,11.2,'review','possible_existing_material') returning id`,[org])).rows[0];
  await db.query('select ebh_review_create_material($1)',[h.id]);
  assert.equal((await db.query("select count(*) as n from catalog_items where sku='ARCHIVEDSKU' and deleted_at is null")).rows[0].n,1);
});
console.log(`${passed} database checks passed`);
await db.close();
