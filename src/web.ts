// What every page route shares: who is asking, drawing a page in the layout, and reading forms.
import type { Context } from "hono";
import { demoOn, isGuest, withGuest } from "./demo.js";
import * as store from "./store.js";
import { layout, type Html } from "./views/layout.js";
import { message } from "./views/public.js";
import { identity, type Identity } from "./whisk.js";

export const who = (c: Context): Identity => withGuest(c, identity((n) => c.req.header(n)));

export const render = async (c: Context, title: string, body: Html, opts: { staff?: boolean; status?: 200 | 400 | 403 | 404 | 502; s?: store.Settings } = {}) => {
  const id = who(c);
  const s = opts.s ?? (await store.settings());
  return c.html(layout({ s, id, title, body, staff: opts.staff, demo: { on: demoOn(), guest: isGuest(id) } }), opts.status ?? 200);
};

export const notFound = (c: Context) => render(c, "Not found", message("Not found"), { status: 404 });

// Messages shown after a redirect, by key, so no text travels in the address.
const flashes: Readonly<Record<string, string>> = {
  saved: "Saved.",
  created: "Created.",
  posted: "Update posted.",
  deleted: "Deleted.",
  added: "Added.",
  removed: "Removed.",
  revoked: "Key turned off.",
  statuses: "Statuses saved.",
};
export const flash = (c: Context) => flashes[c.req.query("ok") ?? ""];

export const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\r\n/g, "\n").slice(0, max) : "");
export const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : 0;
};
export const idParam = (c: Context, name = "id") => posInt(c.req.param(name));

// Form fields that repeat (checkboxes) come back as a string or a list.
export const many = (v: unknown): readonly string[] => (Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)]);
export const form = (c: Context) => c.req.parseBody({ all: true }) as Promise<Record<string, unknown>>;
