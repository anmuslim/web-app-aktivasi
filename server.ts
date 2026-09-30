import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import net from 'net';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Client as SSHClient } from 'ssh2';
import mysql from 'mysql2/promise';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_FILE = path.resolve(process.cwd(), 'database.json');

const DEFAULT_PROFILES = [
  'INTERNET_10M',
  'INTERNET_20M',
  'INTERNET_30M',
  'INTERNET_50M',
  'INTERNET_100M',
  'INTERNET_150M',
  'INTERNET_200M'
];

const DEFAULT_USERS = [
  {
    id: '1',
    username: 'admin',
    name: 'Administrator',
    password: 'admin',
    role: 'admin',
    createdAt: '2026-09-30T00:00:00.000Z'
  }
];

// Fallback in-memory database
let memoryStore = {
  oltConfigs: {} as Record<string, any>,
  templates: {} as Record<string, string>,
  terminalShortcuts: {} as Record<string, any>,
  speedProfiles: DEFAULT_PROFILES,
  users: DEFAULT_USERS as any[]
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
      : DEFAULT_PROFILES;
    memoryStore.users = Array.isArray(parsed.users) && parsed.users.length > 0
      ? parsed.users
      : DEFAULT_USERS;
    console.log(`[Storage] Loaded initial data from database.json: ${Object.keys(memoryStore.oltConfigs).length} OLTs, ${memoryStore.users.length} Users`);
  }
} catch (e: any) {
  console.warn('[Storage] Could not parse database.json, using defaults:', e.message);
}

// MySQL Configuration
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'whusnet_olt_pro',
  password: process.env.MYSQL_PASSWORD || 'Strategi*1',
  database: process.env.MYSQL_DATABASE || 'whusnet_olt',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool: any = null;
let mysqlAvailable = false;

async function initDb() {
  try {
    pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    mysqlAvailable = true;
    console.log('✅ MySQL Database Terhubung!');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS olt_configs (
        id VARCHAR(100) PRIMARY KEY,
        code TEXT NOT NULL,
        username VARCHAR(100),
        password VARCHAR(100),
        subtabs JSON
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS templates (
        name VARCHAR(100) PRIMARY KEY,
        body TEXT NOT NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS shortcuts (
        name VARCHAR(100) PRIMARY KEY,
        body TEXT NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'ZTE C320'
      )
    `);

    try {
      await connection.query("ALTER TABLE shortcuts ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT 'ZTE C320'");
    } catch {
      // Column already exists
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS speed_profiles (
        name VARCHAR(100) PRIMARY KEY
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(100),
        password VARCHAR(100) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        createdAt VARCHAR(50)
      )
    `);

    // Insert default admin if users table is empty
    const [existingUsers]: any = await connection.query('SELECT COUNT(*) as count FROM users');
    if (existingUsers[0]?.count === 0 && memoryStore.users.length > 0) {
      for (const u of memoryStore.users) {
        await connection.query(
          'INSERT IGNORE INTO users (id, username, name, password, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
          [u.id, u.username, u.name, u.password, u.role, u.createdAt || new Date().toISOString()]
        );
      }
    }

    connection.release();
    console.log('🚀 Tabel Database Siap Digunakan.');
  } catch (err: any) {
    mysqlAvailable = false;
    console.warn('⚠️ MySQL tidak tersedia, menggunakan penyimpanan file database.json / in-memory store.');
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
  let currentTerminalState = 'NORMAL';

  ws.on('message', (msg) => {
    try {
      const payload = JSON.parse(msg.toString());
      if (payload.type === 'connect') {
        const { ip, protocol = 'telnet', user, password } = payload;
        type = protocol;

        if (connection) {
          if (connection.destroy) connection.destroy();
          else if (connection.end) connection.end();
        }

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
              ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;32m[SSH CONNECTED TO ${ip}]\x1b[0m\r\n` }));
            }
            connection.shell({ term: 'xterm-256color' }, (err: any, stream: any) => {
              if (err) {
                if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'status', data: `[SSH SHELL ERROR: ${err.message}]` }));
                return;
              }
              connection.shellStream = stream;
              stream.on('data', (data: Buffer) => handleIncomingData(data.toString()));
            });
          }).on('error', (err: any) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;31m[SSH ERROR: ${err.message}]\x1b[0m\r\n` }));
            }
          }).connect({ host: ip, port: 22, username: user || 'admin', password: password || '', readyTimeout: 10000 });
        } else {
          connection = new net.Socket();
          connection.connect(23, ip, () => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;32m[TELNET CONNECTED TO ${ip}]\x1b[0m\r\n` }));
            }
            connection.write(Buffer.from([IAC, DONT, ECHO, IAC, WILL, SUPPRESS_GO_AHEAD]));
          });
          connection.on('data', (chunk: Buffer) => processTelnetStream(connection, chunk, handleIncomingData));
          connection.on('error', (err: any) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;31m[TCP ERROR: ${err.message}]\x1b[0m\r\n` }));
            }
          });
          connection.on('close', () => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;33m[TELNET CONNECTION CLOSED BY OLT]\x1b[0m\r\n` }));
            }
          });
        }
      }
      if (payload.type === 'input' && connection) {
        const stream = type === 'ssh' ? connection.shellStream : connection;
        if (stream && typeof stream.write === 'function') {
          stream.write(payload.data);
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
      const [olts]: any = await pool.query('SELECT * FROM olt_configs');
      const [tpls]: any = await pool.query('SELECT * FROM templates');
      const [shorts]: any = await pool.query('SELECT * FROM shortcuts');
      const [profiles]: any = await pool.query('SELECT * FROM speed_profiles');
      const [users]: any = await pool.query('SELECT * FROM users');

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

      return res.json({
        oltConfigs,
        templates,
        terminalShortcuts,
        speedProfiles,
        users: userList.length > 0 ? userList : memoryStore.users
      });
    } catch (err: any) {
      console.warn('⚠️ Gagal memuat dari MySQL, beralih ke cache memory:', err.message);
    }
  }

  // Fallback to local memory / database.json
  res.json({
    oltConfigs: memoryStore.oltConfigs,
    templates: memoryStore.templates,
    terminalShortcuts: memoryStore.terminalShortcuts,
    speedProfiles: memoryStore.speedProfiles,
    users: memoryStore.users
  });
});

app.post('/api/save', async (req, res) => {
  const { oltConfigs, templates, terminalShortcuts, speedProfiles, users } = req.body;

  // Update memory store and persist to database.json
  memoryStore = {
    oltConfigs: oltConfigs !== undefined ? oltConfigs : memoryStore.oltConfigs,
    templates: templates !== undefined ? templates : memoryStore.templates,
    terminalShortcuts: terminalShortcuts !== undefined ? terminalShortcuts : memoryStore.terminalShortcuts,
    speedProfiles: Array.isArray(speedProfiles) && speedProfiles.length > 0 ? speedProfiles : memoryStore.speedProfiles,
    users: Array.isArray(users) && users.length > 0 ? users : memoryStore.users
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

// Vite middleware in dev, static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`==========================================`);
    console.log(`🌐 Whusnet OLT Pro Running on port ${PORT}`);
    console.log(`📍 URL: http://0.0.0.0:${PORT}`);
    console.log(`==========================================`);
  });
}

startServer();
