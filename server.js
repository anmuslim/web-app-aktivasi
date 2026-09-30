
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import net from 'net';
import http from 'http';
import { Client as SSHClient } from 'ssh2';
import mysql from 'mysql2/promise';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = 3001;

// ==========================================
// KONFIGURASI DATABASE - WAJIB DISESUAIKAN
// ==========================================
const dbConfig = {
    host: 'localhost',
    user: 'whusnet_olt_pro',
    password: 'Strategi*1', // GANTI DENGAN PASSWORD ANDA
    database: 'whusnet_olt',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

/**
 * Inisialisasi Database & Cek Koneksi
 */
async function initDb() {
    try {
        console.log("------------------------------------------");
        console.log("🕒 Mencoba menghubungkan ke MySQL...");
        const connection = await pool.getConnection();
        console.log("✅ Database Terhubung!");

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
        } catch (colErr) {
            // Column already exists, ignore
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS speed_profiles (
                name VARCHAR(100) PRIMARY KEY
            )
        `);

        connection.release();
        console.log("🚀 Tabel Database Siap Digunakan.");
        console.log("------------------------------------------");
    } catch (err) {
        console.error("❌ ERROR DATABASE:");
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error("   Kesalahan: Password/User MySQL salah.");
        } else if (err.code === 'ECONNREFUSED') {
            console.error("   Kesalahan: Service MySQL tidak jalan (sudo systemctl start mysql).");
        } else {
            console.error("   Detail:", err.message);
        }
        console.log("------------------------------------------");
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

function determineState(text) {
    if (PATTERNS.USERNAME.test(text)) return 'USERNAME';
    if (PATTERNS.PASSWORD.test(text)) return 'PASSWORD';
    if (PATTERNS.NOECHO.test(text)) return 'NOECHO';
    if (PATTERNS.NORMAL.test(text)) return 'NORMAL';
    return null; 
}

function processTelnetStream(socket, chunk, onData) {
    let cleanBuffer = [];
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
    let connection = null;
    let type = 'telnet';
    let currentTerminalState = 'NORMAL';

    ws.on('message', (msg) => {
        try {
            const payload = JSON.parse(msg.toString());
            if (payload.type === 'connect') {
                const { ip, protocol = 'telnet', user, password } = payload;
                type = protocol;
                
                // Cleanup existing if any
                if (connection) {
                    if (connection.destroy) connection.destroy();
                    else if (connection.end) connection.end();
                }

                const handleIncomingData = (text) => {
                    ws.send(JSON.stringify({ type: 'data', data: text }));
                    const newState = determineState(text);
                    if (newState && newState !== currentTerminalState) {
                        currentTerminalState = newState;
                        ws.send(JSON.stringify({ type: 'state', data: newState }));
                    }
                };

                if (protocol === 'ssh') {
                    connection = new SSHClient();
                    connection.on('ready', () => {
                        ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;32m[SSH CONNECTED TO ${ip}]\x1b[0m\r\n` }));
                        connection.shell({ term: 'xterm-256color' }, (err, stream) => {
                            if (err) return ws.send(JSON.stringify({ type: 'status', data: `[SSH SHELL ERROR: ${err.message}]` }));
                            connection.shellStream = stream;
                            stream.on('data', (data) => handleIncomingData(data.toString()));
                        });
                    }).on('error', (err) => {
                        ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;31m[SSH ERROR: ${err.message}]\x1b[0m\r\n` }));
                    }).connect({ host: ip, port: 22, username: user || 'admin', password: password || '', readyTimeout: 10000 });
                } else {
                    connection = new net.Socket();
                    connection.connect(23, ip, () => {
                        ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;32m[TELNET CONNECTED TO ${ip}]\x1b[0m\r\n` }));
                        connection.write(Buffer.from([IAC, DONT, ECHO, IAC, WILL, SUPPRESS_GO_AHEAD]));
                    });
                    connection.on('data', (chunk) => processTelnetStream(connection, chunk, handleIncomingData));
                    connection.on('error', (err) => ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;31m[TCP ERROR: ${err.message}]\x1b[0m\r\n` })));
                    connection.on('close', () => ws.send(JSON.stringify({ type: 'status', data: `\r\n\x1b[1;33m[TELNET CONNECTION CLOSED BY OLT]\x1b[0m\r\n` })));
                }
            }
            if (payload.type === 'input' && connection) {
                const stream = type === 'ssh' ? connection.shellStream : connection;
                if (stream) stream.write(payload.data);
            }
        } catch (e) { console.error("WS Error:", e); }
    });

    ws.on('close', () => {
        if (connection) {
            console.log("🔌 WS closed, disconnecting OLT session.");
            if (connection.destroy) connection.destroy();
            else if (connection.end) connection.end();
            connection = null;
        }
    });
});

/**
 * Endpoints API
 */
app.get('/api/data', async (req, res) => {
    try {
        const [olts] = await pool.query("SELECT * FROM olt_configs");
        const [tpls] = await pool.query("SELECT * FROM templates");
        const [shorts] = await pool.query("SELECT * FROM shortcuts");
        const [profiles] = await pool.query("SELECT * FROM speed_profiles");

        const oltConfigs = {};
        olts.forEach(row => {
            oltConfigs[row.id] = {
                code: row.code,
                username: row.username,
                password: row.password,
                subtabs: typeof row.subtabs === 'string' ? JSON.parse(row.subtabs) : (row.subtabs || {})
            };
        });

        const templates = {};
        tpls.forEach(row => templates[row.name] = row.body);

        const terminalShortcuts = {};
        shorts.forEach(row => {
            terminalShortcuts[row.name] = {
                body: row.body,
                category: row.category || 'ZTE C320'
            };
        });

        const speedProfiles = profiles.map(row => row.name);

        console.log(`📥 Data dimuat: ${olts.length} OLT, ${tpls.length} Template, ${speedProfiles.length} Profiles`);
        res.json({ oltConfigs, templates, terminalShortcuts, speedProfiles });
    } catch (err) {
        console.error("❌ Gagal memuat data dari DB:", err.message);
        res.status(500).json({ error: "Database error" });
    }
});

app.post('/api/save', async (req, res) => {
    const { oltConfigs, templates, terminalShortcuts, speedProfiles } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query("DELETE FROM olt_configs");
        for (const [id, cfg] of Object.entries(oltConfigs)) {
            await connection.query(
                "INSERT INTO olt_configs (id, code, username, password, subtabs) VALUES (?, ?, ?, ?, ?)",
                [id, cfg.code, cfg.username || '', cfg.password || '', JSON.stringify(cfg.subtabs || {})]
            );
        }

        await connection.query("DELETE FROM templates");
        for (const [name, body] of Object.entries(templates)) {
            await connection.query("INSERT INTO templates (name, body) VALUES (?, ?)", [name, body]);
        }

        await connection.query("DELETE FROM shortcuts");
        for (const [name, val] of Object.entries(terminalShortcuts)) {
            let body = '';
            let category = 'ZTE C320';
            if (val && typeof val === 'object') {
                body = val.body || '';
                category = val.category || 'ZTE C320';
            } else if (typeof val === 'string') {
                body = val;
            }
            await connection.query("INSERT INTO shortcuts (name, body, category) VALUES (?, ?, ?)", [name, body, category]);
        }

        await connection.query("DELETE FROM speed_profiles");
        if (Array.isArray(speedProfiles)) {
            for (const name of speedProfiles) {
                if (name && name.trim()) {
                    await connection.query("INSERT INTO speed_profiles (name) VALUES (?)", [name.trim()]);
                }
            }
        }

        await connection.commit();
        console.log("✅ Data berhasil disinkronkan ke MySQL.");
        res.json({ status: 'success' });
    } catch (err) {
        await connection.rollback();
        console.error("❌ Gagal menyimpan ke DB:", err.message);
        res.status(500).json({ error: "Failed to save data" });
    } finally {
        connection.release();
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`==========================================`);
    console.log(`🌐 Whusnet Bridge Server Running`);
    console.log(`📍 URL: http://0.0.0.0:${PORT}`);
    console.log(`==========================================`);
});
