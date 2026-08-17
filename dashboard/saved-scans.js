import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export function createSavedScanStore(dbPath = ':memory:') {
    if (dbPath !== ':memory:') {
        mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(`
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            suite_id TEXT,
            site_url TEXT
        );
        CREATE TABLE IF NOT EXISTS scan_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            name TEXT NOT NULL,
            mime TEXT,
            data BLOB NOT NULL,
            FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
        );
    `);
    ensureColumn(db, 'scans', 'site_url', 'TEXT');

    const insertScan = db.prepare('INSERT INTO scans (created_at, suite_id, site_url) VALUES (?, ?, ?)');
    const insertFile = db.prepare(
        'INSERT INTO scan_files (scan_id, kind, name, mime, data) VALUES (?, ?, ?, ?, ?)'
    );
    const listStmt = db.prepare(`
        SELECT
            s.id AS id,
            s.created_at AS createdAt,
            s.suite_id AS suiteId,
            s.site_url AS siteUrl,
            COUNT(f.id) AS fileCount,
            COALESCE(SUM(length(f.data)), 0) AS size
        FROM scans s
        LEFT JOIN scan_files f ON f.scan_id = s.id
        GROUP BY s.id
        ORDER BY s.created_at DESC, s.id DESC
    `);
    const getScan = db.prepare(
        'SELECT id, created_at AS createdAt, suite_id AS suiteId, site_url AS siteUrl FROM scans WHERE id = ?'
    );
    const listFiles = db.prepare(
        'SELECT kind, name, mime, data FROM scan_files WHERE scan_id = ? ORDER BY kind, name'
    );
    const deleteScan = db.prepare('DELETE FROM scans WHERE id = ?');

    return {
        save({ suiteId = null, siteUrl = null, files = [] } = {}) {
            const createdAt = new Date().toISOString();
            const result = insertScan.run(createdAt, suiteId, siteUrl);
            const id = Number(result.lastInsertRowid);
            for (const file of files) {
                const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
                insertFile.run(id, file.kind, file.name, file.mime ?? null, data);
            }
            return summarize(id, createdAt, suiteId, siteUrl, files);
        },
        list() {
            return listStmt.all().map((row) => ({
                id: Number(row.id),
                createdAt: row.createdAt,
                suiteId: row.suiteId,
                siteUrl: row.siteUrl,
                fileCount: Number(row.fileCount),
                size: Number(row.size),
                href: `/api/saved-scans/${row.id}/download`,
            }));
        },
        get(id) {
            const scan = getScan.get(Number(id));
            if (!scan) {
                return null;
            }
            const files = listFiles.all(Number(id)).map((file) => ({
                kind: file.kind,
                name: file.name,
                mime: file.mime,
                data: Buffer.from(file.data),
            }));
            return {
                id: Number(scan.id),
                createdAt: scan.createdAt,
                suiteId: scan.suiteId,
                siteUrl: scan.siteUrl,
                files,
            };
        },
        delete(id) {
            const info = deleteScan.run(Number(id));
            return info.changes > 0;
        },
        deleteMany(ids) {
            const deleted = [];
            for (const id of ids) {
                if (this.delete(id)) {
                    deleted.push(Number(id));
                }
            }
            return deleted;
        },
        close() {
            db.close();
        },
    };
}

function ensureColumn(db, table, column, ddl) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.some((entry) => entry.name === column)) {
        return;
    }
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

function summarize(id, createdAt, suiteId, siteUrl, files) {
    return {
        id,
        createdAt,
        suiteId,
        siteUrl,
        fileCount: files.length,
        size: files.reduce((total, file) => {
            const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
            return total + data.length;
        }, 0),
        href: `/api/saved-scans/${id}/download`,
    };
}
