import postgres from "postgres";
import { env } from "./whisk.js";

// DATABASE_URL is pooled in transaction mode: no prepared statements across statements.
export const sql = postgres(env("DATABASE_URL"), { prepare: false, max: 5, onnotice: () => {}, connect_timeout: 10, idle_timeout: 20 });
export type Sql = typeof sql;
export type Tx = postgres.TransactionSql<{}>;
