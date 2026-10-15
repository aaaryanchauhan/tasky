/**
 * TEST-ONLY stand-in for a Supabase project (PostgREST + GoTrue subset) running on PGlite with the
 * real migrations. It lets the real Next.js app be driven end-to-end without Docker. It is NOT a
 * substitute for `supabase start`; it implements just the calls this app makes.
 *
 *   npx tsx tests/e2e/fake-supabase-server.ts          # listens on :54321
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { PGlite } from "@electric-sql/pglite";
import { createDb } from "../db/harness";

export const JWT_SECRET = "e2e-only-secret-not-for-anything-real";
export const ADMIN_EMAIL = "owner@tigerfitness.test";
export const ADMIN_PASSWORD = "correct-horse-battery";
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

const b64 = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function sign(payload: Record<string, unknown>): string {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verify(token: string): Record<string, unknown> | null {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const expect = createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, "base64url");
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return null;
  const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  return payload.exp && payload.exp < Date.now() / 1000 ? null : payload;
}

export async function startFakeSupabase(port = 54321) {
  const db: PGlite = await createDb();
  const adminId = (await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [ADMIN_EMAIL])).rows[0]!.id;
  await db.query("insert into public.profiles (id, role) values ($1, 'admin')", [adminId]);
  // a second signed-up user WITHOUT an admin profile, to prove the app refuses them
  const strangerId = (await db.query<{ id: string }>("insert into auth.users (email) values ('stranger@tigerfitness.test') returning id")).rows[0]!.id;

  const users: Record<string, { id: string; password: string }> = {
    [ADMIN_EMAIL]: { id: adminId, password: ADMIN_PASSWORD },
    "stranger@tigerfitness.test": { id: strangerId, password: "stranger-password" },
  };

  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const session = (email: string) => {
    const u = users[email]!;
    const now = Math.floor(Date.now() / 1000);
    const user = { id: u.id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    return {
      access_token: sign({ sub: u.id, role: "authenticated", aud: "authenticated", email, iat: now, exp: now + 3600 }),
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: `refresh-${email}`,
      user,
    };
  };

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let d = "";
      req.on("data", (c) => (d += c));
      req.on("end", () => resolve(d));
    });

  // ── PostgREST subset ──────────────────────────────────────────────────
  const EMBED_FK: Record<string, string> = { members: "member_id", billing_periods: "billing_period_id" };

  function selectList(spec: string, table: string): string {
    if (!spec || spec === "*") return `${q("t")}.*`;
    const parts: string[] = [];
    let depth = 0, cur = "";
    for (const ch of spec) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
    }
    parts.push(cur);
    return parts
      .map((p) => {
        p = p.trim();
        const m = /^(\w+)\((.*)\)$/.exec(p);
        if (m) {
          const emb = m[1]!;
          const fk = EMBED_FK[emb];
          if (!fk) throw new Error(`unsupported embed ${emb} on ${table}`);
          const inner = m[2]!.split(",").map((c) => q(c.trim())).join(", ");
          return `(select row_to_json(e) from (select ${inner} from public.${q(emb)} where id = t.${q(fk)}) e) as ${q(emb)}`;
        }
        return p === "*" ? "t.*" : `t.${q(p)}`;
      })
      .join(", ");
  }

  function filterSql(key: string, raw: string, params: unknown[]): string | null {
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    const col = `t.${q(key)}`;
    const push = (v: unknown) => { params.push(v); return `$${params.length}`; };
    switch (op) {
      case "eq": return `${col}::text = ${push(val)}`;
      case "neq": return `${col}::text <> ${push(val)}`;
      case "gt": return `${col} > ${push(val)}`;
      case "gte": return `${col} >= ${push(val)}`;
      case "lt": return `${col} < ${push(val)}`;
      case "lte": return `${col} <= ${push(val)}`;
      case "ilike": return `${col}::text ilike ${push(val.replace(/\*/g, "%"))}`;
      case "is": return val === "null" ? `${col} is null` : `${col} is not null`;
      case "in": return `${col}::text = any(${push(val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")))})`;
      default: throw new Error(`unsupported filter ${op}`);
    }
  }

  function whereSql(url: URL, params: unknown[]): string {
    const clauses: string[] = [];
    for (const [k, v] of url.searchParams) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
      if (k === "or") {
        const inner = v.replace(/^\(|\)$/g, "").split(/,(?=\w+\.)/);
        const ors = inner.map((c) => {
          const [col, ...rest] = c.split(".");
          return filterSql(col!, rest.join("."), params);
        });
        clauses.push(`(${ors.join(" or ")})`);
      } else {
        clauses.push(filterSql(k, v, params)!);
      }
    }
    return clauses.length ? ` where ${clauses.join(" and ")}` : "";
  }

  async function withRole<T>(claims: Record<string, unknown> | null, fn: () => Promise<T>): Promise<T> {
    const role = claims?.role === "service_role" ? "service_role" : claims ? "authenticated" : "anon";
    await db.exec("begin");
    try {
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims ?? { role: "anon" })]);
      await db.exec(`set local role ${role}`);
      const out = await fn();
      await db.exec("commit");
      return out;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  }

  async function rest(req: IncomingMessage, res: ServerResponse, url: URL) {
    const auth = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const claims = auth ? verify(auth) : null;
    const rel = url.pathname.replace(/^\/rest\/v1\//, "");
    const prefer = String(req.headers.prefer ?? "");
    const wantsObject = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const bodyText = await readBody(req);
    const body = bodyText ? JSON.parse(bodyText) : null;

    try {
      const result = await serial(() =>
        withRole(claims, async () => {
          if (rel.startsWith("rpc/")) {
            const fn = rel.slice(4);
            const meta = await db.query<{ names: string[] | null; types: string[]; retset: boolean }>(
              `select p.proargnames as names, (select array_agg(format_type(t, null)) from unnest(string_to_array(p.proargtypes::text, ' ')::oid[]) t) as types, p.proretset as retset
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn]);
            const m = meta.rows[0];
            if (!m) return { status: 404, json: { message: `function ${fn} not found` } };
            const names = Object.keys(body ?? {});
            const params: unknown[] = [];
            const args = names.map((n) => {
              const idx = (m.names ?? []).indexOf(n);
              const type = m.types[idx]!;
              const v = (body as Record<string, unknown>)[n];
              params.push(type.endsWith("[]") ? (v === null ? null : `{${(v as string[]).join(",")}}`) : type === "jsonb" ? JSON.stringify(v) : v);
              return `${q(n)} => $${params.length}::${type}`;
            });
            const call = `public.${q(fn)}(${args.join(", ")})`;
            const r = m.retset
              ? await db.query<{ r: unknown }>(`select to_jsonb(f) r from ${call} f`, params)
              : await db.query<{ r: unknown }>(`select to_jsonb(${call}) r`, params);
            return { status: 200, json: m.retset ? r.rows.map((x) => x.r) : (r.rows[0]?.r ?? null) };
          }

          const table = rel;
          const params: unknown[] = [];
          if (req.method === "GET") {
            let sql = `select row_to_json(x) r from (select ${selectList(url.searchParams.get("select") ?? "*", table)} from public.${q(table)} t${whereSql(url, params)}`;
            const order = url.searchParams.get("order");
            if (order) sql += ` order by ${order.split(",").map((o) => { const [c, d] = o.split("."); return `t.${q(c!)} ${d === "desc" ? "desc nulls last" : "asc"}`; }).join(", ")}`;
            if (url.searchParams.get("limit")) sql += ` limit ${Number(url.searchParams.get("limit"))}`;
            sql += ") x";
            const r = await db.query<{ r: unknown }>(sql, params);
            return { status: 200, json: r.rows.map((x) => x.r) };
          }
          if (req.method === "POST" || req.method === "PATCH") {
            let sql: string;
            if (req.method === "PATCH") {
              const sets = Object.entries(body as Record<string, unknown>).map(([k, v]) => { params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v); return `${q(k)} = $${params.length}`; });
              sql = `with r as (update public.${q(table)} t set ${sets.join(", ")}${whereSql(url, params)} returning t.*) select row_to_json(r) r from r`;
            } else {
              const rows = Array.isArray(body) ? body : [body];
              const keys = [...new Set(rows.flatMap((r: Record<string, unknown>) => Object.keys(r)))];
              const vals = rows.map((row: Record<string, unknown>) => `(${keys.map((k) => { const v = row[k]; params.push(v === undefined ? null : v !== null && typeof v === "object" ? JSON.stringify(v) : v); return `$${params.length}`; }).join(", ")})`);
              const conflict = url.searchParams.get("on_conflict");
              let on = "";
              if (conflict) {
                const target = conflict.split(",").map((c) => q(c)).join(", ");
                on = prefer.includes("ignore-duplicates") ? ` on conflict (${target}) do nothing` : ` on conflict (${target}) do update set ${keys.map((k) => `${q(k)} = excluded.${q(k)}`).join(", ")}`;
              }
              sql = `with r as (insert into public.${q(table)} (${keys.map(q).join(", ")}) values ${vals.join(", ")}${on} returning *) select row_to_json(r) r from r`;
            }
            const r = await db.query<{ r: unknown }>(sql, params);
            const rows = r.rows.map((x) => x.r);
            return { status: req.method === "POST" ? 201 : 200, json: prefer.includes("return=representation") ? rows : null };
          }
          return { status: 405, json: { message: "method not allowed" } };
        }),
      );
      if (wantsObject && Array.isArray(result.json)) {
        if (result.json.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
        return send(res, result.status, result.json[0]);
      }
      return send(res, result.status, result.json === null ? undefined : result.json);
    } catch (e) {
      const err = e as { code?: string; message: string };
      const status = err.code === "42501" ? 403 : err.code === "23505" ? 409 : 400;
      return send(res, status, { code: err.code, message: err.message, details: null, hint: null });
    }
  }


  // ── Storage subset (upload / sign / remove / serve), RLS enforced through storage.objects ──────
  const blobs = new Map<string, { bytes: Buffer; type: string }>();
  const readBuffer = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
    });

  async function storage(req: IncomingMessage, res: ServerResponse, url: URL) {
    const rel = url.pathname.replace(/^\/storage\/v1\//, "");
    const auth = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const claims = auth ? verify(auth) : null;
    const decode = (p: string) => p.split("/").map(decodeURIComponent).join("/");

    // serve a previously signed link (no auth header: the token is the credential)
    if (req.method === "GET" && rel.startsWith("object/sign/")) {
      const [bucketAndPath] = [rel.slice("object/sign/".length)];
      const token = url.searchParams.get("token") ?? "";
      const t = verify(token);
      const key = decode(bucketAndPath);
      const blob = blobs.get(key);
      if (!t || t.url !== key || !blob) return send(res, 400, { message: "invalid or expired token" });
      res.writeHead(200, { "content-type": blob.type, "content-length": String(blob.bytes.length), "cache-control": "private, max-age=3600" });
      return res.end(blob.bytes);
    }

    const signToken = (key: string, ttl: number) => sign({ url: key, exp: Math.floor(Date.now() / 1000) + ttl });

    try {
      if (req.method === "POST" && rel.startsWith("object/sign/")) {
        const rest = decode(rel.slice("object/sign/".length));
        const body = JSON.parse((await readBody(req)) || "{}");
        const [bucket, ...pathParts] = rest.split("/");
        const sign1 = async (path: string) => {
          const found = await serial(() =>
            withRole(claims, async () => (await db.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, path])).rows.length),
          );
          if (!found) return null;
          return `/object/sign/${bucket}/${path}?token=${signToken(`${bucket}/${path}`, Number(body.expiresIn ?? 3600))}`;
        };
        if (pathParts.length === 0) {
          const out = [];
          for (const path of body.paths as string[]) {
            const signedURL = await sign1(path);
            out.push({ path, signedURL, error: signedURL ? null : "Object not found" });
          }
          return send(res, 200, out);
        }
        const signedURL = await sign1(pathParts.join("/"));
        return signedURL ? send(res, 200, { signedURL }) : send(res, 400, { error: "Object not found", message: "Object not found", statusCode: "404" });
      }

      if (req.method === "POST" && rel.startsWith("object/")) {
        const [bucket, ...pathParts] = decode(rel.slice("object/".length)).split("/");
        const path = pathParts.join("/");
        const bytes = await readBuffer(req);
        const type = String(req.headers["content-type"] ?? "").split(";")[0]!;
        const b = (await serial(async () => (await db.query<{ file_size_limit: string; allowed_mime_types: string[] }>("select file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket])).rows[0]));
        if (!b) return send(res, 404, { message: "Bucket not found" });
        if (bytes.length > Number(b.file_size_limit)) return send(res, 413, { message: "The object exceeded the maximum allowed size" });
        if (!b.allowed_mime_types.includes(type)) return send(res, 415, { message: "mime type not supported" });
        await serial(() =>
          withRole(claims, async () => {
            await db.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, path, (claims as { sub?: string } | null)?.sub ?? null]);
          }),
        );
        blobs.set(`${bucket}/${path}`, { bytes, type });
        return send(res, 200, { Id: "x", Key: `${bucket}/${path}` });
      }

      if (req.method === "DELETE" && rel.startsWith("object/")) {
        const bucket = decode(rel.slice("object/".length));
        const body = JSON.parse((await readBody(req)) || "{}");
        for (const path of body.prefixes as string[]) {
          const n = await serial(() => withRole(claims, async () => (await db.query("delete from storage.objects where bucket_id = $1 and name = $2 returning 1", [bucket, path])).rows.length));
          if (n) blobs.delete(`${bucket}/${path}`);
        }
        return send(res, 200, []);
      }
    } catch (e) {
      const err = e as { code?: string; message: string };
      return send(res, err.code === "42501" ? 403 : 400, { message: err.message, statusCode: err.code === "42501" ? "403" : "400", error: err.message });
    }
    return send(res, 404, { message: "not found" });
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    try {
      if (url.pathname === "/auth/v1/token") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const grant = url.searchParams.get("grant_type");
        if (grant === "password") {
          const u = users[String(body.email).toLowerCase()];
          if (!u || u.password !== body.password) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
          return send(res, 200, session(String(body.email).toLowerCase()));
        }
        if (grant === "refresh_token") {
          const email = String(body.refresh_token).replace("refresh-", "");
          return users[email] ? send(res, 200, session(email)) : send(res, 400, { error_code: "refresh_token_not_found", msg: "bad refresh" });
        }
      }
      if (url.pathname === "/auth/v1/user") {
        const claims = verify(req.headers.authorization?.replace(/^Bearer /, "") ?? "");
        if (!claims) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
        return send(res, 200, { id: claims.sub, aud: "authenticated", role: "authenticated", email: claims.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
      }
      if (url.pathname === "/auth/v1/logout") return send(res, 204, undefined);
      if (url.pathname.startsWith("/rest/v1/")) return await rest(req, res, url);
      if (url.pathname.startsWith("/storage/v1/")) return await storage(req, res, url);
      // test-only: let the harness run SQL as superuser (seeding / assertions)
      if (url.pathname === "/__sql" && req.method === "POST") {
        const { sql, params } = JSON.parse(await readBody(req));
        const r = await serial(async () => { await db.exec("reset role"); return db.query(sql, params ?? []); });
        return send(res, 200, r.rows);
      }
      send(res, 404, { message: "not found" });
    } catch (e) {
      send(res, 500, { message: (e as Error).message });
    }
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return { db, adminId, close: () => new Promise<void>((r) => server.close(() => r())) };
}

if (process.argv[1]?.endsWith("fake-supabase-server.ts")) {
  startFakeSupabase().then(() => console.log("fake supabase listening on :54321"));
}
