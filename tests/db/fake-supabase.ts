/**
 * Minimal supabase-js look-alike backed by PGlite. It implements only the query-builder calls the
 * server code uses (select/eq/neq/gt/gte/lte/in/order/limit/single/maybeSingle, insert, update,
 * upsert, rpc) and returns rows the way PostgREST does (dates/timestamps as strings), so the real
 * service modules can be exercised against the real schema in tests.
 */
import type { PGlite } from "@electric-sql/pglite";

type Filter = { col: string; op: string; val: unknown };
type Result = { data: unknown; error: { code?: string; message: string } | null };

const SET_RETURNING = new Set(["claim_message_jobs", "claim_message_job"]);
const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

class Builder implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private cols = "*";
  private filters: Filter[] = [];
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private returning = false;
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";

  constructor(private db: PGlite, private table: string) {}

  select(cols = "*") {
    if (cols.includes("(")) throw new Error("fake supabase: embedded selects are not supported");
    if (this.op === "select") this.cols = cols;
    else this.returning = true;
    return this;
  }
  insert(row: Record<string, unknown> | Record<string, unknown>[]) { this.op = "insert"; this.payload = row; return this; }
  update(patch: Record<string, unknown>) { this.op = "update"; this.payload = patch; return this; }
  upsert(row: Record<string, unknown>, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { this.op = "upsert"; this.payload = row; this.opts = opts; return this; }
  private f(op: string, col: string, val: unknown) { this.filters.push({ col, op, val }); return this; }
  eq(c: string, v: unknown) { return this.f("=", c, v); }
  neq(c: string, v: unknown) { return this.f("<>", c, v); }
  gt(c: string, v: unknown) { return this.f(">", c, v); }
  gte(c: string, v: unknown) { return this.f(">=", c, v); }
  lte(c: string, v: unknown) { return this.f("<=", c, v); }
  in(c: string, v: unknown[]) { return this.f("in", c, v); }
  order(col: string, o: { ascending?: boolean } = {}) { this.orderBy = { col, asc: o.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  private where(params: unknown[]): string {
    if (!this.filters.length) return "";
    const parts = this.filters.map(({ col, op, val }) => {
      if (op === "in") { params.push(val); return `${q(col)} = any($${params.length})`; }
      if (val === null && op === "=") return `${q(col)} is null`;
      params.push(val);
      return `${q(col)} ${op} $${params.length}`;
    });
    return ` where ${parts.join(" and ")}`;
  }

  private async run(): Promise<Result> {
    const params: unknown[] = [];
    const t = `public.${q(this.table)}`;
    let sql: string;
    if (this.op === "select") {
      const cols = this.cols === "*" ? "*" : this.cols.split(",").map((c) => q(c.trim())).join(", ");
      sql = `select row_to_json(x) as r from (select ${cols} from ${t}${this.where(params)}${
        this.orderBy ? ` order by ${q(this.orderBy.col)} ${this.orderBy.asc ? "asc" : "desc"}` : ""
      }${this.max ? ` limit ${this.max}` : ""}) x`;
    } else if (this.op === "update") {
      const patch = this.payload as Record<string, unknown>;
      const sets = Object.entries(patch).map(([k, v]) => { params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v); return `${q(k)} = $${params.length}`; });
      const where = this.where(params);
      sql = `with r as (update ${t} set ${sets.join(", ")}${where} returning *) select row_to_json(r) as r from r`;
    } else {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Record<string, unknown>];
      const keys = Object.keys(rows[0]!);
      const values = rows.map((row) => `(${keys.map((k) => { const v = row[k]; params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v); return `$${params.length}`; }).join(", ")})`);
      let conflict = "";
      if (this.op === "upsert") {
        const target = (this.opts.onConflict ?? "").split(",").map((c) => q(c.trim())).join(", ");
        conflict = this.opts.ignoreDuplicates
          ? ` on conflict (${target}) do nothing`
          : ` on conflict (${target}) do update set ${keys.map((k) => `${q(k)} = excluded.${q(k)}`).join(", ")}`;
      }
      sql = `with r as (insert into ${t} (${keys.map(q).join(", ")}) values ${values.join(", ")}${conflict} returning *) select row_to_json(r) as r from r`;
    }
    try {
      const res = await this.db.query<{ r: Record<string, unknown> }>(sql, params);
      const rows = res.rows.map((x) => x.r);
      const wantRows = this.op === "select" || this.returning;
      if (this.mode === "single") {
        return rows.length === 1 && wantRows ? { data: rows[0], error: null } : { data: null, error: { code: "PGRST116", message: "expected one row" } };
      }
      if (this.mode === "maybe") return { data: rows[0] ?? null, error: null };
      return { data: wantRows ? rows : null, error: null };
    } catch (e) {
      const err = e as { code?: string; message: string };
      return { data: null, error: { code: err.code, message: err.message } };
    }
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, bad);
  }
}

export function fakeSupabase(db: PGlite) {
  return {
    from: (table: string) => new Builder(db, table),
    rpc: async (fn: string, args: Record<string, unknown> = {}): Promise<Result> => {
      const names = Object.keys(args);
      const call = `public.${q(fn)}(${names.map((n, i) => `${q(n)} => $${i + 1}`).join(", ")})`;
      const params = names.map((n) => (args[n] !== null && typeof args[n] === "object" && !Array.isArray(args[n]) ? JSON.stringify(args[n]) : args[n]));
      const sql = SET_RETURNING.has(fn)
        ? `select to_jsonb(f) as r from ${call} f`
        : `select to_jsonb(${call}) as r`;
      try {
        const res = await db.query<{ r: unknown }>(sql, params);
        return { data: SET_RETURNING.has(fn) ? res.rows.map((x) => x.r) : (res.rows[0]?.r ?? null), error: null };
      } catch (e) {
        const err = e as { code?: string; message: string };
        return { data: null, error: { code: err.code, message: err.message } };
      }
    },
  };
}
