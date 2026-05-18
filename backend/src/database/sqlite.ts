// Lớp truy cập SQLite qua node:sqlite (built-in từ Node 22.5+).
//
// KHÔNG cần better-sqlite3 (native compile) nữa. node:sqlite là WASM-based,
// chạy mọi Node version >= 22.5 trên mọi OS mà không cần Visual Studio,
// Python, hay bất kỳ build tool nào.
//
// API: DatabaseSync (sync, giống better-sqlite3).
// Experimental warning sẽ hiện 1 lần — acceptable cho local dev tool.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { TABLES, type TableConfig } from "../config/tables";

// Wrapper interface để repository.ts không phải biết implementation detail.
export interface DbStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface DbInstance {
  exec(sql: string): void;
  prepare(sql: string): DbStatement;
  close(): void;
  transaction<T>(fn: (args: T) => void): (args: T) => void;
}

let dbInstance: DbInstance | null = null;

export function getDataDir(): string {
  const cwd = process.cwd();
  const dataDir = cwd.endsWith("backend") ? join(cwd, "data") : join(cwd, "backend", "data");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(dataDir, "blobs"), { recursive: true });
  return dataDir;
}

export function getDb(): DbInstance {
  if (dbInstance) return dbInstance;
  const dataDir = getDataDir();
  const dbPath = join(dataDir, "genposter.db");
  mkdirSync(dirname(dbPath), { recursive: true });

  const raw = new DatabaseSync(dbPath);
  // WAL mode cho perf single-user.
  raw.exec("PRAGMA journal_mode = WAL");
  raw.exec("PRAGMA synchronous = NORMAL");
  raw.exec("PRAGMA foreign_keys = ON");

  // Wrap DatabaseSync thành DbInstance interface.
  const db: DbInstance = {
    exec: (sql: string) => raw.exec(sql),
    prepare: (sql: string) => {
      const stmt = raw.prepare(sql);
      return {
        run: (...params: unknown[]) => stmt.run(...(params as Array<string | number | null | bigint | Uint8Array>)) as unknown as { changes: number; lastInsertRowid: number | bigint },
        get: (...params: unknown[]) => stmt.get(...(params as Array<string | number | null | bigint | Uint8Array>)),
        all: (...params: unknown[]) => stmt.all(...(params as Array<string | number | null | bigint | Uint8Array>)),
      };
    },
    close: () => raw.close(),
    transaction: <T>(fn: (args: T) => void) => {
      // node:sqlite DatabaseSync không có .transaction() built-in.
      // Simulate bằng BEGIN/COMMIT/ROLLBACK.
      return (args: T) => {
        raw.exec("BEGIN");
        try {
          fn(args);
          raw.exec("COMMIT");
        } catch (err) {
          raw.exec("ROLLBACK");
          throw err;
        }
      };
    },
  };

  initSchema(db);
  dbInstance = db;
  return db;
}

function initSchema(db: DbInstance): void {
  for (const table of TABLES) {
    createTable(db, table);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS blobs (
      blob_key TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

function createTable(db: DbInstance, table: TableConfig): void {
  const tableName = quoteIdent(table.name);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      pk TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);

  for (const field of table.indexedFields ?? []) {
    const colName = quoteIdent(`idx_${field}`);
    const indexName = quoteIdent(`idx_${table.name}_${field}`);
    try {
      db.exec(
        `ALTER TABLE ${tableName} ADD COLUMN ${colName} TEXT GENERATED ALWAYS AS (json_extract(payload, '$.${field}')) VIRTUAL;`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("duplicate column") && !message.includes("already exists")) throw err;
    }
    db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${colName});`);
  }
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
