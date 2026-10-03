import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import {
  INITIAL_OLT_CONFIG,
  INITIAL_TEMPLATES,
  INITIAL_SHORTCUTS,
  DEFAULT_SPEED_PROFILES,
  DEFAULT_USERS,
  DEFAULT_ROLES
} from '../constants.ts';

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'whusnet_web_aktivasi',
  password: process.env.MYSQL_PASSWORD || 'Strategi*1',
  database: process.env.MYSQL_DATABASE || 'web_aktivasi',
};

async function main() {
  console.log('----------------------------------------------------');
  console.log('🔄 Memulai Inisialisasi Skema Database MySQL...');
  console.log(`📌 Target Host     : ${DB_CONFIG.host}`);
  console.log(`📌 Target Database : ${DB_CONFIG.database}`);
  console.log(`📌 Target User     : ${DB_CONFIG.user}`);
  console.log('----------------------------------------------------');

  let connection: any = null;

  try {
    // 1. Hubungkan ke MySQL server untuk membuat database jika belum ada
    try {
      connection = await mysql.createConnection({
        host: DB_CONFIG.host,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password,
      });

      console.log(`[1/4] Membuat database \`${DB_CONFIG.database}\` jika belum ada...`);
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
      await connection.query(`USE \`${DB_CONFIG.database}\`;`);
    } catch (err: any) {
      console.log(`[Info] Mencoba koneksi langsung ke database \`${DB_CONFIG.database}\`...`);
      connection = await mysql.createConnection({
        host: DB_CONFIG.host,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password,
        database: DB_CONFIG.database,
      });
    }

    console.log('[2/4] Membuat tabel skema database...');

    // Tabel olt_configs
    await connection.query(`
      CREATE TABLE IF NOT EXISTS olt_configs (
        id VARCHAR(100) NOT NULL PRIMARY KEY,
        code TEXT NOT NULL,
        username VARCHAR(100) DEFAULT '',
        password VARCHAR(100) DEFAULT '',
        subtabs JSON,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Tabel templates
    await connection.query(`
      CREATE TABLE IF NOT EXISTS templates (
        name VARCHAR(100) NOT NULL PRIMARY KEY,
        body MEDIUMTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Tabel shortcuts
    await connection.query(`
      CREATE TABLE IF NOT EXISTS shortcuts (
        name VARCHAR(100) NOT NULL PRIMARY KEY,
        body MEDIUMTEXT NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'ZTE C320',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await connection.query("ALTER TABLE shortcuts ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT 'ZTE C320'");
    } catch {
      // Column already exists
    }

    // Tabel speed_profiles
    await connection.query(`
      CREATE TABLE IF NOT EXISTS speed_profiles (
        name VARCHAR(100) NOT NULL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Tabel users
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) NOT NULL PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        password VARCHAR(100) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'operator',
        createdAt VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Tabel roles
    await connection.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id VARCHAR(100) NOT NULL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        allowedMenus JSON,
        canEditOtherUsers BOOLEAN DEFAULT FALSE,
        canDeleteUsers BOOLEAN DEFAULT FALSE,
        canManageRoles BOOLEAN DEFAULT FALSE,
        isSystem BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('[3/4] Melakukan sinkronisasi & seeding data awal ke MySQL...');
    
    // Tentukan sumber data awal (database.json atau constants.ts)
    let oltData: Record<string, any> = INITIAL_OLT_CONFIG;
    let tplData: Record<string, string> = INITIAL_TEMPLATES;
    let shortcutData: Record<string, any> = INITIAL_SHORTCUTS;
    let speedData: string[] = DEFAULT_SPEED_PROFILES;
    let userData: any[] = DEFAULT_USERS;
    let roleData: any[] = DEFAULT_ROLES;

    const dbJsonPath = path.resolve(process.cwd(), 'database.json');
    if (fs.existsSync(dbJsonPath)) {
      try {
        const raw = fs.readFileSync(dbJsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.oltConfigs && Object.keys(parsed.oltConfigs).length > 0) oltData = parsed.oltConfigs;
        if (parsed.templates && Object.keys(parsed.templates).length > 0) tplData = parsed.templates;
        if (parsed.terminalShortcuts && Object.keys(parsed.terminalShortcuts).length > 0) shortcutData = parsed.terminalShortcuts;
        if (Array.isArray(parsed.speedProfiles) && parsed.speedProfiles.length > 0) speedData = parsed.speedProfiles;
        if (Array.isArray(parsed.users) && parsed.users.length > 0) userData = parsed.users;
        if (Array.isArray(parsed.roles) && parsed.roles.length > 0) roleData = parsed.roles;
      } catch (err: any) {
        console.warn('  ⚠️ Menggunakan fallback constants:', err.message);
      }
    }

    // 1. Seed OLT Configs
    for (const [id, cfg] of Object.entries<any>(oltData)) {
      await connection.query(
        `INSERT INTO olt_configs (id, code, username, password, subtabs)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE code = VALUES(code), username = VALUES(username), password = VALUES(password), subtabs = VALUES(subtabs)`,
        [id, cfg.code || id, cfg.username || '', cfg.password || '', JSON.stringify(cfg.subtabs || {})]
      );
    }
    console.log(`  ✓ OLT Configs (${Object.keys(oltData).length} node berhasil disinkronkan)`);

    // 2. Seed Templates
    for (const [name, body] of Object.entries<any>(tplData)) {
      await connection.query(
        `INSERT INTO templates (name, body)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE body = VALUES(body)`,
        [name, String(body)]
      );
    }
    console.log(`  ✓ Templates (${Object.keys(tplData).length} template tersimpan)`);

    // 3. Seed Shortcuts
    for (const [name, s] of Object.entries<any>(shortcutData)) {
      const body = typeof s === 'object' && s !== null ? s.body : String(s);
      const category = typeof s === 'object' && s !== null ? s.category : 'ZTE C320';
      await connection.query(
        `INSERT INTO shortcuts (name, body, category)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE body = VALUES(body), category = VALUES(category)`,
        [name, body, category]
      );
    }
    console.log(`  ✓ Shortcuts (${Object.keys(shortcutData).length} shortcut tersimpan)`);

    // 4. Seed Speed Profiles
    for (const p of speedData) {
      await connection.query(
        `INSERT IGNORE INTO speed_profiles (name) VALUES (?)`,
        [String(p)]
      );
    }
    console.log(`  ✓ Speed Profiles (${speedData.length} profile tersimpan)`);

    // 5. Seed Users
    for (const u of userData) {
      await connection.query(
        `INSERT INTO users (id, username, name, password, role, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)`,
        [u.id, u.username, u.name || u.username, u.password || 'admin', u.role || 'admin', u.createdAt || new Date().toISOString()]
      );
    }
    console.log(`  ✓ Users (${userData.length} akun tersimpan)`);

    // 6. Seed Roles
    for (const r of roleData) {
      await connection.query(
        `INSERT INTO roles (id, name, description, allowedMenus, canEditOtherUsers, canDeleteUsers, canManageRoles, isSystem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), allowedMenus = VALUES(allowedMenus), canEditOtherUsers = VALUES(canEditOtherUsers), canDeleteUsers = VALUES(canDeleteUsers), canManageRoles = VALUES(canManageRoles)`,
        [
          r.id,
          r.name,
          r.description || '',
          JSON.stringify(r.allowedMenus || ['generator']),
          r.canEditOtherUsers ? 1 : 0,
          r.canDeleteUsers ? 1 : 0,
          r.canManageRoles ? 1 : 0,
          r.isSystem ? 1 : 0
        ]
      );
    }
    console.log(`  ✓ Roles (${roleData.length} master role tersimpan)`);

    console.log('[4/4] Menghasilkan file schema.sql lengkap dengan data bawaan...');
    generateSchemaSql(oltData, tplData, shortcutData, speedData, userData);

    console.log('----------------------------------------------------');
    console.log(`🎉 Berhasil! Skema database MySQL \`${DB_CONFIG.database}\` telah dibuat dan terisi data.`);
    console.log('----------------------------------------------------');
  } catch (err: any) {
    console.warn('\n⚠️ [Catatan MySQL]: Tidak dapat terhubung ke MySQL server pada saat build.');
    console.warn(`   Detail: ${err.message}`);
    console.warn(`   Target: host=${DB_CONFIG.host}, user=${DB_CONFIG.user}, db=${DB_CONFIG.database}`);
    console.log('   Membuat file `schema.sql` cadangan lengkap dengan data bawaan...');
    generateSchemaSql(INITIAL_OLT_CONFIG, INITIAL_TEMPLATES, INITIAL_SHORTCUTS, DEFAULT_SPEED_PROFILES, DEFAULT_USERS);
    console.log('   File `schema.sql` siap di-import secara manual jika service MySQL belum aktif.\n');
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch {}
    }
  }
}

function escapeSql(str: string): string {
  if (typeof str !== 'string') return "''";
  return "'" + str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, (char) => {
    switch (char) {
      case "\0": return "\\0";
      case "\x08": return "\\b";
      case "\x09": return "\\t";
      case "\x1a": return "\\z";
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "\"":
      case "'":
      case "\\":
      case "%":
        return "\\" + char;
      default:
        return char;
    }
  }) + "'";
}

function generateSchemaSql(
  oltData: Record<string, any>,
  tplData: Record<string, string>,
  shortcutData: Record<string, any>,
  speedData: string[],
  userData: any[]
) {
  let sql = `-- ============================================================
-- Skema & Data Database MySQL untuk Whusnet OLT Pro / Web Aktivasi
-- Database : web_aktivasi
-- User     : whusnet_web_aktivasi
-- Password : Strategi*1
-- Host     : localhost
-- ============================================================

CREATE DATABASE IF NOT EXISTS \`web_aktivasi\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`web_aktivasi\`;

-- ------------------------------------------------------------
-- 1. Tabel OLT Configs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`olt_configs\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`code\` TEXT NOT NULL,
  \`username\` VARCHAR(100) DEFAULT '',
  \`password\` VARCHAR(100) DEFAULT '',
  \`subtabs\` JSON,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. Tabel Templates
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`templates\` (
  \`name\` VARCHAR(100) NOT NULL,
  \`body\` MEDIUMTEXT NOT NULL,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. Tabel Shortcuts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`shortcuts\` (
  \`name\` VARCHAR(100) NOT NULL,
  \`body\` MEDIUMTEXT NOT NULL,
  \`category\` VARCHAR(100) NOT NULL DEFAULT 'ZTE C320',
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. Tabel Speed Profiles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`speed_profiles\` (
  \`name\` VARCHAR(100) NOT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. Tabel Users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`username\` VARCHAR(100) NOT NULL,
  \`name\` VARCHAR(100) NOT NULL,
  \`password\` VARCHAR(100) NOT NULL,
  \`role\` VARCHAR(50) NOT NULL DEFAULT 'operator',
  \`createdAt\` VARCHAR(50),
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uniq_username\` (\`username\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED DATA BAWAAN / INITIAL DATA
-- ============================================================

-- Data OLT Configs
`;

  for (const [id, cfg] of Object.entries<any>(oltData)) {
    const code = escapeSql(cfg.code || id);
    const user = escapeSql(cfg.username || '');
    const pass = escapeSql(cfg.password || '');
    const subtabs = escapeSql(JSON.stringify(cfg.subtabs || {}));
    sql += `INSERT INTO \`olt_configs\` (\`id\`, \`code\`, \`username\`, \`password\`, \`subtabs\`) VALUES (${escapeSql(id)}, ${code}, ${user}, ${pass}, ${subtabs}) ON DUPLICATE KEY UPDATE \`code\`=${code}, \`username\`=${user}, \`password\`=${pass}, \`subtabs\`=${subtabs};\n`;
  }

  sql += `\n-- Data Templates\n`;
  for (const [name, body] of Object.entries<any>(tplData)) {
    const bodyEsc = escapeSql(String(body));
    sql += `INSERT INTO \`templates\` (\`name\`, \`body\`) VALUES (${escapeSql(name)}, ${bodyEsc}) ON DUPLICATE KEY UPDATE \`body\`=${bodyEsc};\n`;
  }

  sql += `\n-- Data Shortcuts\n`;
  for (const [name, s] of Object.entries<any>(shortcutData)) {
    const body = typeof s === 'object' && s !== null ? s.body : String(s);
    const category = typeof s === 'object' && s !== null ? s.category : 'ZTE C320';
    const bodyEsc = escapeSql(body);
    const catEsc = escapeSql(category);
    sql += `INSERT INTO \`shortcuts\` (\`name\`, \`body\`, \`category\`) VALUES (${escapeSql(name)}, ${bodyEsc}, ${catEsc}) ON DUPLICATE KEY UPDATE \`body\`=${bodyEsc}, \`category\`=${catEsc};\n`;
  }

  sql += `\n-- Data Speed Profiles\n`;
  for (const p of speedData) {
    sql += `INSERT IGNORE INTO \`speed_profiles\` (\`name\`) VALUES (${escapeSql(String(p))});\n`;
  }

  sql += `\n-- Data Akun Pengguna\n`;
  for (const u of userData) {
    const uId = escapeSql(String(u.id));
    const uName = escapeSql(u.username);
    const uFullName = escapeSql(u.name || u.username);
    const uPass = escapeSql(u.password || 'admin');
    const uRole = escapeSql(u.role || 'admin');
    const uCreated = escapeSql(u.createdAt || '2026-09-30T00:00:00.000Z');
    sql += `INSERT INTO \`users\` (\`id\`, \`username\`, \`name\`, \`password\`, \`role\`, \`createdAt\`) VALUES (${uId}, ${uName}, ${uFullName}, ${uPass}, ${uRole}, ${uCreated}) ON DUPLICATE KEY UPDATE \`name\`=${uFullName}, \`role\`=${uRole};\n`;
  }

  fs.writeFileSync(path.resolve(process.cwd(), 'schema.sql'), sql, 'utf-8');
}

main();
