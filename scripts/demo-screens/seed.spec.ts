import { test } from "@playwright/test";
import { execSync } from "node:child_process";
import { signUp, createCompany, password } from "../../e2e/helpers";

// Demo data for marketing screenshots. Synthetic only (.test addresses).
const sql = (q: string) =>
  execSync("docker exec -i supabase_db_maskinflyt psql -U postgres -At -v ON_ERROR_STOP=1", { input: q }).toString().trim();
const admin = "http://127.0.0.1:54321/auth/v1/admin/users";
const serviceKey = process.env.SERVICE_ROLE_KEY!;

async function newUser(email: string) {
  const r = await fetch(admin, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const j = (await r.json()) as { id: string };
  if (!j.id) throw new Error(JSON.stringify(j));
  return j.id;
}

test("seed demo company", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "kari@fjordkran.test", "Kari", "Nordmann");
  await createCompany(page, "Fjordkran AS", "914778271");
  const org = sql("select id from organizations where name='Fjordkran AS'");
  const drivers = [
    ["ola@fjordkran.test", "Ola", "Hansen"],
    ["per@fjordkran.test", "Per", "Johansen"],
    ["ingrid@fjordkran.test", "Ingrid", "Berg"],
    ["lars@fjordkran.test", "Lars", "Nilsen"],
  ];
  const ids: string[] = [];
  for (const [email, first, last] of drivers) {
    const id = await newUser(email);
    ids.push(id);
    sql(`update profiles set first_name='${first}', last_name='${last}', locale='nb' where id='${id}';
         insert into memberships (organization_id,user_id,role) values ('${org}','${id}','driver');`);
  }
  const veh = sql(`insert into vehicles (organization_id,type,name,reg_number,crane_tm,hourly_rate,min_billable_minutes) values
    ('${org}','crane_truck','Kranbil 1 – 42 tm','ZK41207',42,165000,120),
    ('${org}','crane_truck_grab','Kranbil 2 med grabb','ZK58833',28,145000,120),
    ('${org}','tipper','Tippbil 3-akslet','ZT20419',null,115000,60),
    ('${org}','excavator','Gravemaskin 14 t',null,null,125000,120)
    returning id`).split("\n");
  const cus = sql(`insert into customers (organization_id,kind,name,org_number,contact_name,phone,email,street,postal_code,city) values
    ('${org}','company','Vestbygg Entreprenør AS','917523466','Sindre Moe','91234567','post@vestbygg.test','Sandviksveien 12','5035','Bergen'),
    ('${org}','company','Nordtak Montasje AS','921904452','Hilde Lie','92345678','hilde@nordtak.test','Fjordgata 4','5003','Bergen'),
    ('${org}','company','Åsane Grunnarbeid AS','926113597','Knut Vik','93456789','knut@asanegrunn.test','Myrdalsvegen 20','5130','Nyborg'),
    ('${org}','private','Marte Solberg',null,null,'94567890','marte@solberg.test','Kalfarveien 31','5018','Bergen'),
    ('${org}','company','Hordaland Betong AS','930288103','Eirik Dahl','95678901','eirik@hbetong.test','Kokstadflaten 7','5257','Kokstad')
    returning id`).split("\n");
  // Jobs around today: [days from today (-1 = yesterday, done), start hour, hours, customer, vehicle, driver, address, description]
  const jobs: [number, number, number, number, number | null, number | null, string, string][] = [
    [-1, 7, 4, 0, 0, 0, "Sandviksveien 12, Bergen", "Løfte takstoler, 6 stk."],
    [-1, 8, 3, 2, 2, 2, "Myrdalsvegen 20, Nyborg", "Masse ut, 4 lass."],
    [-1, 12, 3, 1, 1, 1, "Fjordgata 4, Bergen", "Takplater opp på tak."],
    [0, 7, 6, 4, 0, 0, "Kokstadflaten 7, Kokstad", "Betongelementer, montasje."],
    [0, 9, 4, 2, 3, 3, "Myrdalsvegen 20, Nyborg", "Grøft for vann og avløp."],
    [0, 13, 3, 3, 1, 1, "Kalfarveien 31, Bergen", "Boblebad inn i hagen."],
    [1, 7, 5, 0, 0, 0, "Sandviksveien 12, Bergen", "Stålbjelker til 3. etasje."],
    [1, 8, 4, 2, 2, 2, "Myrdalsvegen 20, Nyborg", "Pukk inn, 3 lass."],
    [1, 10, 3, 1, 1, 1, "Fjordgata 4, Bergen", "Vinduer opp, 12 stk."],
    [1, 14, 2, 3, null, null, "Kalfarveien 31, Bergen", "Flytte container."],
    [2, 7, 4, 4, 0, 0, "Kokstadflaten 7, Kokstad", "Hulldekker."],
    [2, 9, 6, 2, 3, 3, "Myrdalsvegen 20, Nyborg", "Graving av tomt."],
    [2, 12, 3, 0, 1, 1, "Sandviksveien 12, Bergen", "Gipsplater opp."],
    [3, 7, 3, 1, 0, 0, "Fjordgata 4, Bergen", "Ventilasjonsaggregat på taket."],
    [3, 10, 4, 2, 2, 2, "Myrdalsvegen 20, Nyborg", "Masse ut, 5 lass."],
    // More today, so the day view is full.
    [0, 7, 4.5, 2, 2, 2, "Myrdalsvegen 20, Nyborg", "Masse ut, 3 lass."],
    [0, 7.5, 3.5, 0, 1, 1, "Sandviksveien 12, Bergen", "Gipsplater opp."],
    [0, 12.5, 3, 1, 2, 2, "Fjordgata 4, Bergen", "Pukk til tak."],
    [0, 14, 3, 4, 3, 3, "Kokstadflaten 7, Kokstad", "Tomt for lager."],
  ];
  const values = jobs.map(([d, h, len, c, v, dr, addr, desc]) => {
    const day = "date_trunc('day', now() at time zone 'Europe/Oslo')";
    const start = `(${day} + interval '${d} day ${h * 60} minute') at time zone 'Europe/Oslo'`;
    const end = `(${day} + interval '${d} day ${(h + len) * 60} minute') at time zone 'Europe/Oslo'`;
    return `('${org}','${cus[c]}',${v === null ? "null" : `'${veh[v]}'`},${dr === null ? "null" : `'${ids[dr]}'`},'${addr}','${desc}',${start},${end})`;
  });
  sql(`insert into jobs (organization_id,customer_id,vehicle_id,driver_id,address,description,starts_at,ends_at) values ${values.join(",")};`);
  // Yesterday is done; Ola has arrived at today's first job.
  sql(`update jobs set status='done', progress='finished', progress_at=ends_at
         where organization_id='${org}' and ends_at < date_trunc('day', now() at time zone 'Europe/Oslo') at time zone 'Europe/Oslo';
       update jobs set progress='arrived', progress_at=now() - interval '40 min'
         where organization_id='${org}' and driver_id='${ids[0]}' and starts_at::date = (now() at time zone 'Europe/Oslo')::date;`);
});
