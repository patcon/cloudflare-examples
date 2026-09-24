// Adapt a copy of echo's Postgres snapshot so Directus will apply it to SQLite.
//  - info.json says vendor "postgres"; Directus refuses a cross-vendor diff.
//  - Serial ids default to nextval('…_seq'), which SQLite can't parse. Those
//    fields keep has_auto_increment, which is what SQLite uses instead.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const snapshot = process.argv[2];
const edit = (file, fn) => {
  const json = JSON.parse(readFileSync(file, "utf8"));
  if (fn(json) !== false) writeFileSync(file, JSON.stringify(json, null, 2));
};

edit(join(snapshot, "info.json"), (info) => { info.vendor = "sqlite"; });

let fixed = 0;
const fieldsDir = join(snapshot, "fields");
for (const collection of readdirSync(fieldsDir)) {
  for (const name of readdirSync(join(fieldsDir, collection))) {
    edit(join(fieldsDir, collection, name), (field) => {
      if (!/^nextval\(/.test(field.schema?.default_value ?? "")) return false;
      field.schema.default_value = null;
      fixed++;
    });
  }
}
console.log(`sqlite-snapshot: vendor set to sqlite, ${fixed} nextval() defaults removed`);
