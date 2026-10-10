// Runs before traffic switches to a new deploy (migrate in whisk.yaml). The platform takes a
// snapshot first and restores it if this exits non-zero. Each file in migrations/ runs once, in
// name order; then a brand-new install gets the sample page.
import { readdir, readFile } from "node:fs/promises";
import { sql } from "./db.js";
import { seedIfEmpty } from "./seed.js";

await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
const files = (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort();
for (const f of files.filter((f) => !done.has(f))) {
  const text = await readFile(`migrations/${f}`, "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(text);
    await tx`insert into schema_migrations (name) values (${f})`;
  });
  console.log(`applied ${f}`);
}
if (await seedIfEmpty(sql)) console.log("added the sample status page");
await sql.end();
