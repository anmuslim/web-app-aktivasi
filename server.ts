import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import net from 'net';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Client as SSHClient } from 'ssh2';
import mysql from 'mysql2/promise';
import {
  INITIAL_OLT_CONFIG,
  INITIAL_TEMPLATES,
  INITIAL_SHORTCUTS,
  DEFAULT_SPEED_PROFILES,
  DEFAULT_USERS,
  DEFAULT_ROLES
} from './constants.ts';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_FILE = path.resolve(process.cwd(), 'database.json');

// Fallback in-memory database with rich defaults
let memoryStore: {
  oltConfigs: any;
  templates: any;
  terminalShortcuts: any;
  speedProfiles: any[];
  users: any[];
  roles: any[];
} = {
  oltConfigs: { ...INITIAL_OLT_CONFIG },
  templates: { ...INITIAL_TEMPLATES },
  terminalShortcuts: { ...INITIAL_SHORTCUTS },
  speedProfiles: [...DEFAULT_SPEED_PROFILES],
  users: [...DEFAULT_USERS],
  roles: [...DEFAULT_ROLES]
};

// Load database.json if available
try {
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    memoryStore.oltConfigs = parsed.oltConfigs || {};
    memoryStore.templates = parsed.templates || {};
    memoryStore.terminalShortcuts = parsed.terminalShortcuts || {};
    memoryStore.speedProfiles = Array.isArray(parsed.speedProfiles) && parsed.speedProfiles.length > 0
      ? parsed.speedProfiles
      : DEFAULT_SPEED_PROFILES;
    memoryStore.users = Array.isArray(parsed.users) && parsed.users.length > 0
      ? parsed.users
      : DEFAULT_USERS;
    memoryStore.roles = Array.isArray(parsed.roles) && parsed.roles.length > 0
      ? parsed.roles
      : DEFAULT_ROLES;
    console.log(`[Storage] Loaded initial data from database.json: ${Object.keys(memoryStore.oltConfigs).length} OLTs, ${memoryStore.users.length} Users, ${memoryStore.roles.length} Roles`);
  }
} catch (e: any) {
  console.warn('[Storage] Could not parse database.json, using defaults:', e.message);
}

// MySQL Configuration
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'whusnet_web_aktivasi',
  password: process.env.MYSQL_PASSWORD || 'Strategi*1',
  database: process.env.MYSQL_DATABASE || 'web_aktivasi',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool: any = null;
let mysqlAvailable = false;

async function seedMysqlDatabase(db: any, force = false) {
  try {
    const [existingOlts]: any = await db.query('SELECT COUNT(*) as count FROM olt_configs');
    const needOltSeed = force || existingOlts[0]?.count === 0;

    if (needOltSeed) {
      const sourceOlts = Object.keys(memoryStore.oltConfigs).length > 0 ? memoryStore.oltConfigs : INITIAL_OLT_CONFIG;
      if (force) await db.query('DELETE FROM olt_configs');
      for (const [id, cfg] of Object.entries<any>(sourceOlts)) {
        await db.query(
          `INSERT INTO olt_configs (id, code, username, password, subtabs)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE code = VALUES(code), username = VALUES(username), password = VALUES(password), subtabs = VALUES(subtabs)`,
          [id, cfg.code || id, cfg.username || '', cfg.password || '', JSON.stringify(cfg.subtabs || {})]
        );
      }
      console.log(`[MySQL Seed] Berhasil mengisi ${Object.keys(sourceOlts).length} node OLT.`);
    }

    const [existingTemplates]: any = await db.query('SELECT COUNT(*) as count FROM templates');
    if (force || existingTemplates[0]?.count === 0) {
      const sourceTemplates = Object.keys(memoryStore.templates).length > 0 ? memoryStore.templates : INITIAL_TEMPLATES;
      if (force) await db.query('DELETE FROM templates');
      for (const [name, body] of Object.entries<any>(sourceTemplates)) {
        await db.query(
          `INSERT INTO templates (name, body)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE body = VALUES(body)`,
          [name, String(body)]
        );
      }
      console.log(`[MySQL Seed] Berhasil mengisi ${Object.keys(sourceTemplates).length} template.`);
    }

    const [existingShortcuts]: any = await db.query('SELECT COUNT(*) as count FROM shortcuts');
    if (force || existingShortcuts[0]?.count === 0) {
      const sourceShortcuts = Object.keys(memoryStore.terminalShortcuts).length > 0 ? memoryStore.terminalShortcuts : INITIAL_SHORTCUTS;
      if (force) await db.query('DELETE FROM shortcuts');
      for (const [name, s] of Object.entries<any>(sourceShortcuts)) {
        const body = typeof s === 'object' && s !== null ? s.body : String(s);
        const category = typeof s === 'object' && s !== null ? s.category : 'ZTE C320';
        await db.query(
          `INSERT INTO shortcuts (name, body, category)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE body = VALUES(body), category = VALUES(category)`,
          [name, body, category]
        );
      }
      console.log(`[MySQL Seed] Berhasil mengisi ${Object.keys(sourceShortcuts).length} shortcut.`);
    }

    const [existingProfiles]: any = await db.query('SELECT COUNT(*) as count FROM speed_profiles');
    if (force || existingProfiles[0]?.count === 0) {
      const sourceProfiles = memoryStore.speedProfiles.length > 0 ? memoryStore.speedProfiles : DEFAULT_SPEED_PROFILES;
      if (force) await db.query('DELETE FROM speed_profiles');
      for (const p of sourceProfiles) {
        await db.query(
          'INSERT IGNORE INTO speed_profiles (name) VALUES (?)',
          [String(p)]
        );
      }
      console.log(`[MySQL Seed] Berhasil mengisi ${sourceProfiles.length} speed profile.`);
    }

    const [existingUsers]: any = await db.query('SELECT COUNT(*) as count FROM users');
    if (force || existingUsers[0]?.count === 0) {
      const sourceUsers = memoryStore.users.length > 0 ? memoryStore.users : DEFAULT_USERS;
      if (force) await db.query('DELETE FROM users');
      for (const u of sourceUsers) {
        await db.query(
          `INSERT INTO users (id, username, name, password, role, createdAt)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)`,
          [u.id, u.username, u.name || u.username, u.password || 'admin', u.role || 'admin', u.createdAt || new Date().toISOString()]
        );
      }
      console.log(`[MySQL Seed] Berhasil mengisi ${sourceUsers.length} akun user.`);
    }

    try {
      const [existingRoles]: any = await db.query('SELECT COUNT(*) as count FROM roles');
      if (force || existingRoles[0]?.count === 0) {
        const sourceRoles = (memoryStore.roles && memoryStore.roles.length > 0) ? memoryStore.roles : DEFAULT_ROLES;
        if (force) await db.query('DELETE FROM roles');
        for (const r of sourceRoles) {
          await db.query(
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
        console.log(`[MySQL Seed] Berhasil mengisi ${sourceRoles.length} master role.`);
      }
    } catch (e: any) {
      // Roles table might not exist yet during initial pass
    }
  } catch (err: any) {
    console.warn('[MySQL Seed Error]:', err.message);
  }
}

async function initDb() {
  try {
    // Pastikan database ada terlebih dahulu jika memungkinkan
    try {
      const rootConn = await mysql.createConnection({
        host: dbConfig.host,
        user: dbConfig.user,
        password: dbConfig.password
      });
      await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
      await rootConn.end();
    } catch {
      // Abaikan jika user hanya memiliki hak akses langsung ke database
    }

    pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    mysqlAvailable = true;
    console.log(`✅ MySQL Database '${dbConfig.database}' Terhubung!`);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS olt_configs (
        id VARCHAR(100) PRIMARY KEY,
        code TEXT NOT NULL,
        username VARCHAR(100),
        password VARCHAR(100),
        subtabs JSON,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS templates (
        name VARCHAR(100) PRIMARY KEY,
        body MEDIUMTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS shortcuts (
        name VARCHAR(100) PRIMARY KEY,
        body MEDIUMTEXT NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'ZTE C320',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    try {
      await connection.query("ALTER TABLE shortcuts ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT 'ZTE C320'");
    } catch {
      // Column already exists
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS speed_profiles (
        name VARCHAR(100) PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(100),
        password VARCHAR(100) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        createdAt VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        allowedMenus JSON,
        canEditOtherUsers BOOLEAN DEFAULT FALSE,
        canDeleteUsers BOOLEAN DEFAULT FALSE,
        canManageRoles BOOLEAN DEFAULT FALSE,
        isSystem BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Auto-seed initial data if empty
    await seedMysqlDatabase(connection, false);

    connection.release();
    console.log('🚀 Tabel Database Siap Digunakan.');
  } catch (err: any) {
    mysqlAvailable = false;
    console.warn('⚠️ MySQL tidak tersedia, menggunakan penyimpanan file database.json / in-memory store:', err.message);
  }
}

initDb();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

/**
 * Telnet Protocol Logic
 */
const IAC = 255;
const WILL = 251;
const WONT = 252;
const DO = 253;
const DONT = 254;
const ECHO = 1;
const SUPPRESS_GO_AHEAD = 3;

const PATTERNS = {
  USERNAME: /(?:username|login|user name|user):\s*$/i,
  PASSWORD: /(?:password|kata sandi|login password):\s*$/i,
  NOECHO: /--More--|Press any key|Processing\.\.\.|Please wait/i,
  NORMAL: /(?:[>#\]]|\(config[^\)]*\)#)\s*$/
};

function determineState(text: string): 'USERNAME' | 'PASSWORD' | 'NOECHO' | 'NORMAL' | null {
  if (PATTERNS.USERNAME.test(text)) return 'USERNAME';
  if (PATTERNS.PASSWORD.test(text)) return 'PASSWORD';
  if (PATTERNS.NOECHO.test(text)) return 'NOECHO';
  if (PATTERNS.NORMAL.test(text)) return 'NORMAL';
  return null;
}

function processTelnetStream(socket: net.Socket, chunk: Buffer, onData: (text: string) => void) {
  const cleanBuffer: number[] = [];
  let i = 0;
  while (i < chunk.length) {
    const byte = chunk[i];
    if (byte === IAC) {
      const cmd = chunk[i + 1];
      const opt = chunk[i + 2];
      if (cmd === DO || cmd === WILL) {
        const response = (opt === ECHO) ? DONT : (cmd === DO ? WILL : DO);
        socket.write(Buffer.from([IAC, response, opt]));
      }
      i += 3;
    } else {
      cleanBuffer.push(byte);
      i++;
    }
  }
  if (cleanBuffer.length > 0) {
    onData(Buffer.from(cleanBuffer).toString('utf8'));
  }
}

wss.on('connection', (ws) => {
  let connection: any = null;
  let type = 'telnet';
  let isSimulated = false;
  let simulatedPrompt = 'ZXHN-C320#';
  let simulatedBuffer = '';
  let currentTerminalState = 'NORMAL';

  ws.on('message', (msg) => {
    try {
      const payload = JSON.parse(msg.toString());
      if (payload.type === 'connect') {
        const { ip, protocol = 'telnet', port, user, password, mode } = payload;
        type = protocol;

        if (connection) {
          if (connection.destroy) connection.destroy();
          else if (connection.end) connection.end();
          connection = null;
        }

        // SIMULATION MODE
        if (mode === 'simulation') {
          isSimulated = true;
          ws.send(JSON.stringify({
            type: 'connection_status',
            connected: true,
            mode: 'simulation'
          }));
          ws.send(JSON.stringify({
            type: 'status',
            data: `\r\n\x1b[1;32m[CONNECTED: MODE SIMULASI CLI OLT ZTE C320 (${ip || '10.123.123.15'})]\x1b[0m\r\n` +
                  `\x1b[1;33mTerminal siap menerima perintah CLI OLT.\x1b[0m\r\n\r\n` +
                  `${simulatedPrompt} `
          }));
          return;
        }

        isSimulated = false;
        const targetPort = port ? parseInt(port, 10) : (protocol === 'ssh' ? 22 : 23);
        ws.send(JSON.stringify({
          type: 'status',
          data: `\r\n\x1b[1;36m[MENGHUBUNGKAN KE ${ip}:${targetPort} VIA ${protocol.toUpperCase()}...]\x1b[0m\r\n`
        }));

        const handleIncomingData = (text: string) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'data', data: text }));
            const newState = determineState(text);
            if (newState && newState !== currentTerminalState) {
              currentTerminalState = newState;
              ws.send(JSON.stringify({ type: 'state', data: newState }));
            }
          }
        };

        if (protocol === 'ssh') {
          connection = new SSHClient();
          connection.on('ready', () => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'connection_status',
                connected: true,
                mode: 'ssh'
              }));
              ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;32m[SSH TERHUBUNG KE ${ip}:${targetPort}]\x1b[0m\r\n` }));
            }
            connection.shell({ term: 'xterm-256color' }, (err: any, stream: any) => {
              if (err) {
                if (ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({ type: 'status', data: `[SSH SHELL ERROR: ${err.message}]` }));
                  ws.send(JSON.stringify({ type: 'connection_status', connected: false, error: err.message }));
                }
                return;
              }
              connection.shellStream = stream;
              stream.on('data', (data: Buffer) => handleIncomingData(data.toString()));
            });
          }).on('error', (err: any) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'connection_status',
                connected: false,
                error: err.message
              }));
              ws.send(JSON.stringify({
                type: 'status',
                data: `\r\n\x1b[1;31m[SSH GAGAL: ${err.message}]\x1b[0m\r\n\x1b[33mTips: Pastikan port 22 terbuka, kredensial benar, dan IP ${ip} dapat dijangkau.\x1b[0m\r\n\x1b[36mGunakan [Mode Simulasi] jika ingin mencoba tanpa koneksi fisik OLT.\x1b[0m\r\n`
              }));
            }
          }).connect({
            host: ip,
            port: targetPort,
            username: user || 'admin',
            password: password || '',
            readyTimeout: 10000
          });
        } else {
          connection = new net.Socket();
          connection.setTimeout(10000);
          connection.on('timeout', () => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'connection_status',
                connected: false,
                error: 'Connection timed out'
              }));
              ws.send(JSON.stringify({
                type: 'status',
                data: `\r\n\x1b[1;31m[TIMEOUT: Gagal terhubung ke ${ip}:${targetPort} dalam 10 detik]\x1b[0m\r\n` +
                      `\x1b[33mTips: Host '${ip}' tidak merespons. Periksa rute IP/VPN, firewall, atau gunakan [Mode Simulasi] untuk pengujian template.\x1b[0m\r\n`
              }));
            }
            connection.destroy();
          });

          connection.connect(targetPort, ip, () => {
            connection.setTimeout(0);            // matikan idle timeout setelah terhubung
            connection.setKeepAlive(true, 30000); // jaga koneksi tetap hidup (opsional)
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'connection_status',
                connected: true,
                mode: 'telnet'
              }));
              ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;32m[TELNET TERHUBUNG KE ${ip}:${targetPort}]\x1b[0m\r\n` }));
            }
            connection.write(Buffer.from([IAC, DONT, ECHO, IAC, WILL, SUPPRESS_GO_AHEAD]));
          });
          connection.on('data', (chunk: Buffer) => processTelnetStream(connection, chunk, handleIncomingData));
          connection.on('error', (err: any) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'connection_status',
                connected: false,
                error: err.message
              }));
              ws.send(JSON.stringify({
                type: 'status',
                data: `\r\n\x1b[1;31m[TCP ERROR: ${err.message}]\x1b[0m\r\n` +
                      `\x1b[33mTips: Host '${ip}' tidak dapat dijangkau dari server ini (${err.code || 'UNREACHABLE'}).\x1b[0m\r\n` +
                      `\x1b[36mSolusi: Aktifkan [Mode Simulasi] untuk menguji eksekusi CLI OLT secara interaktif.\x1b[0m\r\n`
              }));
            }
          });
          connection.on('close', () => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'connection_status',
                connected: false
              }));
              ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;33m[KONEKSI TELNET DITUTUP OLEH OLT / JARINGAN]\x1b[0m\r\n` }));
            }
          });
        }
      }

      if (payload.type === 'input') {
        if (isSimulated) {
          const char = payload.data;
          if (char === '\r' || char === '\n') {
            const line = simulatedBuffer.trim();
            simulatedBuffer = '';
            let response = '';

            if (line.startsWith('show gpon onu uncfg')) {
              response = `OnuIndex              Sn                  State\r\n` +
                         `--------------------------------------------------\r\n` +
                         `gpon-onu_1/1/1:1      ZTEGC1234567        ready\r\n` +
                         `gpon-onu_1/1/1:2      ZTEGC89ABCDE        ready\r\n`;
            } else if (line.startsWith('show gpon onu state')) {
              response = `OnuIndex          AdminState  OmciState    OpmState\r\n` +
                         `--------------------------------------------------\r\n` +
                         `gpon-onu_1/1/1:1  enable      enable       Working\r\n` +
                         `gpon-onu_1/1/1:2  enable      enable       Working\r\n`;
            } else if (line.startsWith('show gpon onu detail-info') || line.startsWith('show pon power')) {
              response = `Rx optical power: -19.45 dBm\r\nTx optical power: +2.34 dBm\r\nLaser bias current: 15.2 mA\r\nSupply voltage: 3.28 V\r\nTemperature: 42.5 C\r\nStatus: Normal Optical Link\r\n`;
            } else if (line.startsWith('show running-config') || line.startsWith('show onu running')) {
              response = `interface gpon-onu_1/1/1:1\r\n  name ODP-DYG-01_user01\r\n  tcont 1 name INET profile INTERNET_50M\r\n  gemport 1 name INET tcont 1\r\n  service-port 1 vport 1 user-vlan 1010 vlan 1010\r\n!\r\n`;
            } else if (line.startsWith('show gpon onu by sn')) {
              response = `OnuIndex              Sn                  State\r\n--------------------------------------------------\r\ngpon-onu_1/1/1:1      ZTEGC1234567        working\r\n`;
            } else if (line.startsWith('conf t') || line === 'configure terminal') {
              simulatedPrompt = 'ZXHN-C320(config)#';
            } else if (line.startsWith('interface gpon-onu') || line.startsWith('interface gpon-olt')) {
              simulatedPrompt = 'ZXHN-C320(config-if)#';
            } else if (line.startsWith('pon-onu-mng')) {
              simulatedPrompt = 'ZXHN-C320(gpon-onu-mng)#';
            } else if (line === 'exit') {
              if (simulatedPrompt.includes('mng') || simulatedPrompt.includes('if')) {
                simulatedPrompt = 'ZXHN-C320(config)#';
              } else if (simulatedPrompt.includes('config')) {
                simulatedPrompt = 'ZXHN-C320#';
              } else {
                simulatedPrompt = 'ZXHN-C320>';
              }
            } else if (line === 'end') {
              simulatedPrompt = 'ZXHN-C320#';
            } else if (line === 'wr' || line === 'write') {
              response = `Building configuration...\r\n[OK]\r\n`;
            } else if (line.startsWith('terminal length')) {
              response = '';
            } else if (line) {
              response = `[OK] Command executed: ${line}\r\n`;
            }

            ws.send(JSON.stringify({
              type: 'data',
              data: `\r\n${response}${simulatedPrompt} `
            }));
          } else if (char === '\x7f' || char === '\b') {
            if (simulatedBuffer.length > 0) {
              simulatedBuffer = simulatedBuffer.slice(0, -1);
              ws.send(JSON.stringify({ type: 'data', data: '\b \b' }));
            }
          } else {
            simulatedBuffer += char;
            ws.send(JSON.stringify({ type: 'data', data: char }));
          }
          return;
        }

        if (connection) {
          const stream = type === 'ssh' ? connection.shellStream : connection;
          if (stream && typeof stream.write === 'function') {
            stream.write(payload.data);
          }
        }
      }
    } catch (e) {
      console.error('WS Error:', e);
    }
  });

  ws.on('close', () => {
    if (connection) {
      if (connection.destroy) connection.destroy();
      else if (connection.end) connection.end();
      connection = null;
    }
  });
});

/**
 * Endpoints API
 */

// User Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'Username dan password harus diisi!' });
  }

  const users = memoryStore.users || [];
  const found = users.find(
    (u: any) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password
  );

  if (!found) {
    return res.status(401).json({ status: 'error', message: 'Username atau password salah!' });
  }

  return res.json({
    status: 'success',
    user: {
      id: found.id,
      username: found.username,
      name: found.name || found.username,
      role: found.role || 'admin',
      createdAt: found.createdAt
    }
  });
});

app.get('/api/data', async (_req, res) => {
  if (mysqlAvailable && pool) {
    try {
      let [olts]: any = await pool.query('SELECT * FROM olt_configs');

      // Auto seed if tables are empty
      if (olts.length === 0) {
        console.log('[MySQL] Database terhubung namun kosong. Mengisi dengan data bawaan...');
        await seedMysqlDatabase(pool, false);
        const [reloadedOlts]: any = await pool.query('SELECT * FROM olt_configs');
        olts = reloadedOlts;
      }

      const [tpls]: any = await pool.query('SELECT * FROM templates');
      const [shorts]: any = await pool.query('SELECT * FROM shortcuts');
      const [profiles]: any = await pool.query('SELECT * FROM speed_profiles');
      const [users]: any = await pool.query('SELECT * FROM users');
      let rolesList: any[] = [];
      try {
        const [dbRoles]: any = await pool.query('SELECT * FROM roles');
        if (dbRoles && dbRoles.length > 0) {
          rolesList = dbRoles.map((r: any) => ({
            id: r.id,
            name: r.name,
            description: r.description || '',
            allowedMenus: typeof r.allowedMenus === 'string' ? JSON.parse(r.allowedMenus) : (r.allowedMenus || ['generator']),
            canEditOtherUsers: Boolean(r.canEditOtherUsers),
            canDeleteUsers: Boolean(r.canDeleteUsers),
            canManageRoles: Boolean(r.canManageRoles),
            isSystem: Boolean(r.isSystem)
          }));
        }
      } catch {}

      const oltConfigs: Record<string, any> = {};
      olts.forEach((row: any) => {
        oltConfigs[row.id] = {
          code: row.code,
          username: row.username,
          password: row.password,
          subtabs: typeof row.subtabs === 'string' ? JSON.parse(row.subtabs) : (row.subtabs || {})
        };
      });

      const templates: Record<string, string> = {};
      tpls.forEach((row: any) => { templates[row.name] = row.body; });

      const terminalShortcuts: Record<string, any> = {};
      shorts.forEach((row: any) => {
        terminalShortcuts[row.name] = {
          body: row.body,
          category: row.category || 'ZTE C320'
        };
      });

      const speedProfiles = profiles.map((row: any) => row.name);
      const userList = users.map((row: any) => ({
        id: row.id,
        username: row.username,
        name: row.name,
        password: row.password,
        role: row.role || 'admin',
        createdAt: row.createdAt
      }));

      const finalOltConfigs = Object.keys(oltConfigs).length > 0 ? oltConfigs : memoryStore.oltConfigs;
      const finalTemplates = Object.keys(templates).length > 0 ? templates : memoryStore.templates;
      const finalShortcuts = Object.keys(terminalShortcuts).length > 0 ? terminalShortcuts : memoryStore.terminalShortcuts;
      const finalProfiles = speedProfiles.length > 0 ? speedProfiles : memoryStore.speedProfiles;
      const finalUsers = userList.length > 0 ? userList : memoryStore.users;

      return res.json({
        oltConfigs: finalOltConfigs,
        templates: finalTemplates,
        terminalShortcuts: finalShortcuts,
        speedProfiles: finalProfiles,
        users: finalUsers,
        roles: rolesList.length > 0 ? rolesList : (memoryStore.roles && memoryStore.roles.length > 0 ? memoryStore.roles : DEFAULT_ROLES)
      });
    } catch (err: any) {
      console.warn('⚠️ Gagal memuat dari MySQL, beralih ke cache memory:', err.message);
    }
  }

  // Fallback to local memory / database.json / constants
  res.json({
    oltConfigs: Object.keys(memoryStore.oltConfigs).length > 0 ? memoryStore.oltConfigs : INITIAL_OLT_CONFIG,
    templates: Object.keys(memoryStore.templates).length > 0 ? memoryStore.templates : INITIAL_TEMPLATES,
    terminalShortcuts: Object.keys(memoryStore.terminalShortcuts).length > 0 ? memoryStore.terminalShortcuts : INITIAL_SHORTCUTS,
    speedProfiles: memoryStore.speedProfiles.length > 0 ? memoryStore.speedProfiles : DEFAULT_SPEED_PROFILES,
    users: memoryStore.users.length > 0 ? memoryStore.users : DEFAULT_USERS,
    roles: memoryStore.roles && memoryStore.roles.length > 0 ? memoryStore.roles : DEFAULT_ROLES
  });
});

// Manual Seed / Reset Endpoint
app.all('/api/seed', async (req, res) => {
  const force = req.query.force === 'true' || req.body?.force === true;
  memoryStore = {
    oltConfigs: { ...INITIAL_OLT_CONFIG },
    templates: { ...INITIAL_TEMPLATES },
    terminalShortcuts: { ...INITIAL_SHORTCUTS },
    speedProfiles: [...DEFAULT_SPEED_PROFILES],
    users: [...DEFAULT_USERS],
    roles: [...DEFAULT_ROLES]
  };
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(memoryStore, null, 2), 'utf-8');
  } catch {}

  if (mysqlAvailable && pool) {
    await seedMysqlDatabase(pool, force);
  }
  return res.json({
    status: 'success',
    message: 'Data awal berhasil di-seed ke database MySQL & lokal!',
    data: memoryStore
  });
});

// Diagnostic Host & Port Connection Checker
app.get('/api/test-connection', (req, res) => {
  const host = String(req.query.host || '').trim();
  const port = parseInt(String(req.query.port || '23'), 10);
  if (!host) {
    return res.status(400).json({ reachable: false, message: 'Host/IP address diperlukan' });
  }

  const startTime = Date.now();
  const sock = new net.Socket();
  sock.setTimeout(3000);

  sock.on('connect', () => {
    const latency = Date.now() - startTime;
    sock.destroy();
    res.json({ reachable: true, host, port, latency, message: `Host ${host}:${port} terjangkau (${latency}ms)` });
  });

  sock.on('timeout', () => {
    sock.destroy();
    res.json({ reachable: false, host, port, message: `Timeout (3s): Host ${host}:${port} tidak merespons` });
  });

  sock.on('error', (err: any) => {
    sock.destroy();
    res.json({ reachable: false, host, port, message: `Gagal terhubung (${err.code || err.message})` });
  });

  sock.connect(port, host);
});

app.post('/api/save', async (req, res) => {
  const { oltConfigs, templates, terminalShortcuts, speedProfiles, users, roles } = req.body;

  // Update memory store and persist to database.json
  memoryStore = {
    oltConfigs: oltConfigs !== undefined ? oltConfigs : memoryStore.oltConfigs,
    templates: templates !== undefined ? templates : memoryStore.templates,
    terminalShortcuts: terminalShortcuts !== undefined ? terminalShortcuts : memoryStore.terminalShortcuts,
    speedProfiles: Array.isArray(speedProfiles) && speedProfiles.length > 0 ? speedProfiles : memoryStore.speedProfiles,
    users: Array.isArray(users) && users.length > 0 ? users : memoryStore.users,
    roles: Array.isArray(roles) && roles.length > 0 ? roles : (memoryStore.roles || DEFAULT_ROLES)
  };

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(memoryStore, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('⚠️ Gagal menyimpan ke database.json:', err.message);
  }

  if (mysqlAvailable && pool) {
    let connection: any = null;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      if (oltConfigs) {
        await connection.query('DELETE FROM olt_configs');
        for (const [id, cfg] of Object.entries<any>(oltConfigs)) {
          await connection.query(
            'INSERT INTO olt_configs (id, code, username, password, subtabs) VALUES (?, ?, ?, ?, ?)',
            [id, cfg.code, cfg.username || '', cfg.password || '', JSON.stringify(cfg.subtabs || {})]
          );
        }
      }

      if (templates) {
        await connection.query('DELETE FROM templates');
        for (const [name, body] of Object.entries<any>(templates)) {
          await connection.query('INSERT INTO templates (name, body) VALUES (?, ?)', [name, body]);
        }
      }

      if (terminalShortcuts) {
        await connection.query('DELETE FROM shortcuts');
        for (const [name, val] of Object.entries<any>(terminalShortcuts)) {
          let body = '';
          let category = 'ZTE C320';
          if (val && typeof val === 'object') {
            body = val.body || '';
            category = val.category || 'ZTE C320';
          } else if (typeof val === 'string') {
            body = val;
          }
          await connection.query('INSERT INTO shortcuts (name, body, category) VALUES (?, ?, ?)', [name, body, category]);
        }
      }

      if (Array.isArray(speedProfiles)) {
        await connection.query('DELETE FROM speed_profiles');
        for (const name of speedProfiles) {
          if (name && name.trim()) {
            await connection.query('INSERT INTO speed_profiles (name) VALUES (?)', [name.trim()]);
          }
        }
      }

      if (Array.isArray(users)) {
        await connection.query('DELETE FROM users');
        for (const u of users) {
          await connection.query(
            'INSERT INTO users (id, username, name, password, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            [u.id, u.username, u.name || u.username, u.password || 'admin', u.role || 'admin', u.createdAt || new Date().toISOString()]
          );
        }
      }

      if (Array.isArray(roles)) {
        try {
          await connection.query('DELETE FROM roles');
          for (const r of roles) {
            await connection.query(
              'INSERT INTO roles (id, name, description, allowedMenus, canEditOtherUsers, canDeleteUsers, canManageRoles, isSystem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
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
        } catch (e: any) {
          console.warn('⚠️ Gagal menyimpan tabel roles di MySQL:', e.message);
        }
      }

      await connection.commit();
      console.log('✅ Data berhasil disinkronkan ke MySQL.');
    } catch (err: any) {
      if (connection) await connection.rollback();
      console.warn('⚠️ Gagal sinkronisasi ke MySQL (data tetap tersimpan di lokal):', err.message);
    } finally {
      if (connection) connection.release();
    }
  }

  res.json({ status: 'success' });
});

// Vite middleware in dev, static files in production / preview
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.argv.includes('preview') || 
                       process.argv.includes('--production') ||
                       (process.argv.includes('start') && fs.existsSync(path.resolve('dist', 'index.html')));

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve('dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.use((_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      console.warn('⚠️ Folder dist/ belum ada. Menggunakan Vite dev middleware...');
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    }
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`==========================================`);
    console.log(`🌐 Whusnet OLT Pro Running on port ${PORT} [${isProduction ? 'PRODUCTION / PREVIEW' : 'DEV'}]`);
    console.log(`📍 URL: http://0.0.0.0:${PORT}`);
    console.log(`==========================================`);
  });
}

startServer();
