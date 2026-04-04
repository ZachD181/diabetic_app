const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run the schema.");
  }

  const schemaSql = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  });

  try {
    await pool.query(schemaSql);
    console.log("Schema applied successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
