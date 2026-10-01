import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

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

    console.log('[3/4] Melakukan sinkronisasi data awal dari database.json...');
    const dbJsonPath = path.resolve(process.cwd(), 'database.json');
    if (fs.existsSync(dbJsonPath)) {
      try {
        const raw = fs.readFileSync(dbJsonPath, 'utf-8');
        const data = JSON.parse(raw);

        // 1. Seed OLT Configs
        if (data.oltConfigs && typeof data.oltConfigs === 'object') {
          for (const [id, cfg] of Object.entries<any>(data.oltConfigs)) {
            await connection.query(
              `INSERT INTO olt_configs (id, code, username, password, subtabs)
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE code = VALUES(code), username = VALUES(username), password = VALUES(password), subtabs = VALUES(subtabs)`,
              [id, cfg.code || id, cfg.username || '', cfg.password || '', JSON.stringify(cfg.subtabs || {})]
            );
          }
          console.log(`  ✓ OLT Configs (${Object.keys(data.oltConfigs).length} node tersimpan)`);
        }

        // 2. Seed Templates
        if (data.templates && typeof data.templates === 'object') {
          for (const [name, body] of Object.entries<any>(data.templates)) {
            await connection.query(
              `INSERT INTO templates (name, body)
               VALUES (?, ?)
               ON DUPLICATE KEY UPDATE body = VALUES(body)`,
              [name, String(body)]
            );
          }
          console.log(`  ✓ Templates (${Object.keys(data.templates).length} template tersimpan)`);
        }

        // 3. Seed Shortcuts
        if (data.terminalShortcuts && typeof data.terminalShortcuts === 'object') {
          for (const [name, s] of Object.entries<any>(data.terminalShortcuts)) {
            const body = typeof s === 'object' && s !== null ? s.body : String(s);
            const category = typeof s === 'object' && s !== null ? s.category : 'ZTE C320';
            await connection.query(
              `INSERT INTO shortcuts (name, body, category)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE body = VALUES(body), category = VALUES(category)`,
              [name, body, category]
            );
          }
          console.log(`  ✓ Shortcuts (${Object.keys(data.terminalShortcuts).length} shortcut tersimpan)`);
        }

        // 4. Seed Speed Profiles
        if (Array.isArray(data.speedProfiles)) {
          for (const p of data.speedProfiles) {
            await connection.query(
              `INSERT IGNORE INTO speed_profiles (name) VALUES (?)`,
              [String(p)]
            );
          }
          console.log(`  ✓ Speed Profiles (${data.speedProfiles.length} profile tersimpan)`);
        }

        // 5. Seed Users
        if (Array.isArray(data.users) && data.users.length > 0) {
          for (const u of data.users) {
            await connection.query(
              `INSERT INTO users (id, username, name, password, role, createdAt)
               VALUES (?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)`,
              [u.id, u.username, u.name || u.username, u.password || 'admin', u.role || 'admin', u.createdAt || new Date().toISOString()]
            );
          }
          console.log(`  ✓ Users (${data.users.length} akun tersimpan)`);
        }
      } catch (err: any) {
        console.warn('  ⚠️ Gagal membaca data awal dari database.json:', err.message);
      }
    }

    console.log('[4/4] Menghasilkan file schema.sql mandiri...');
    generateSchemaSql();

    console.log('----------------------------------------------------');
    console.log(`🎉 Berhasil! Skema database MySQL \`${DB_CONFIG.database}\` telah dibuat dan siap digunakan.`);
    console.log('----------------------------------------------------');
  } catch (err: any) {
    console.warn('\n⚠️ [Catatan MySQL]: Tidak dapat terhubung ke MySQL server pada saat build.');
    console.warn(`   Detail: ${err.message}`);
    console.warn(`   Target: host=${DB_CONFIG.host}, user=${DB_CONFIG.user}, db=${DB_CONFIG.database}`);
    console.log('   Membuat file `schema.sql` cadangan agar dapat diimport kapan saja...');
    generateSchemaSql();
    console.log('   File `schema.sql` siap di-import secara manual jika service MySQL belum aktif.\n');
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch {}
    }
  }
}

function generateSchemaSql() {
  const sql = `-- Skema Database MySQL untuk Whusnet OLT Pro / Web Aktivasi
-- Database: web_aktivasi
-- User: whusnet_web_aktivasi
-- Host: localhost

CREATE DATABASE IF NOT EXISTS \`web_aktivasi\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`web_aktivasi\`;

-- 1. Tabel OLT Configs
CREATE TABLE IF NOT EXISTS \`olt_configs\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`code\` TEXT NOT NULL,
  \`username\` VARCHAR(100) DEFAULT '',
  \`password\` VARCHAR(100) DEFAULT '',
  \`subtabs\` JSON,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabel Templates
CREATE TABLE IF NOT EXISTS \`templates\` (
  \`name\` VARCHAR(100) NOT NULL,
  \`body\` MEDIUMTEXT NOT NULL,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabel Shortcuts
CREATE TABLE IF NOT EXISTS \`shortcuts\` (
  \`name\` VARCHAR(100) NOT NULL,
  \`body\` MEDIUMTEXT NOT NULL,
  \`category\` VARCHAR(100) NOT NULL DEFAULT 'ZTE C320',
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabel Speed Profiles
CREATE TABLE IF NOT EXISTS \`speed_profiles\` (
  \`name\` VARCHAR(100) NOT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabel Users
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

-- Seed Data Admin Bawaan
INSERT IGNORE INTO \`users\` (\`id\`, \`username\`, \`name\`, \`password\`, \`role\`, \`createdAt\`)
VALUES ('1', 'admin', 'Administrator', 'admin', 'admin', '2026-09-30T00:00:00.000Z');
`;

  fs.writeFileSync(path.resolve(process.cwd(), 'schema.sql'), sql, 'utf-8');
}

main();
