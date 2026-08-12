const { app, BrowserWindow, shell } = require('electron');
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

// Hardcoded EVE Developer Credentials & Environment Variables
const CLIENT_ID = ;
const CLIENT_SECRET = ;
const REDIRECT_URI = 'http://localhost:5000/auth/callback';;
const PORT = 5000;

const server = express();
server.use(express.json());

// Enable CORS for Electron file:// renderer fetches
server.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

let db;
let dbFilePath;
const ESI_BASE = 'https://esi.evetech.net/latest';
const SCOPES = 'esi-wallet.read_character_wallet.v1';
let mainWindow;

// -------------------------------------------------------------
// DATABASE INITIALIZATION (SQL.JS WASM)
// -------------------------------------------------------------
async function initDatabase() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
  });

  dbFilePath = path.join(app.getPath('userData'), 'ratting_tracker.db');
  console.log(`[Database] File location: ${dbFilePath}`);

  if (fs.existsSync(dbFilePath)) {
    const fileBuffer = fs.readFileSync(dbFilePath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      character_id INTEGER,
      character_name TEXT,
      ref_type TEXT,
      amount REAL,
      entry_date TEXT,
      entry_timestamp INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS characters (
      character_id INTEGER PRIMARY KEY,
      character_name TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER
    )
  `);

  saveDatabase();
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbFilePath, buffer);
}

function executeQuery(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// -------------------------------------------------------------
// HELPER FUNCTIONS
// -------------------------------------------------------------
function getSavedCharacters() {
  if (!db) return [];
  return executeQuery(`SELECT character_id, character_name, access_token, refresh_token, expires_at FROM characters`);
}

async function getValidToken(char) {
  if (Date.now() < char.expires_at - 60000) return char.access_token;
  
  const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const response = await axios.post('https://login.eveonline.com/v2/oauth/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: char.refresh_token }),
    { headers: { Authorization: `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const newAccessToken = response.data.access_token;
  const newRefreshToken = response.data.refresh_token;
  const newExpiresAt = Date.now() + (response.data.expires_in * 1000);

  db.run(
    `UPDATE characters SET access_token = ?, refresh_token = ?, expires_at = ? WHERE character_id = ?`,
    [newAccessToken, newRefreshToken, newExpiresAt, char.character_id]
  );
  saveDatabase();

  return newAccessToken;
}

async function syncWalletToDatabase(char) {
  if (!db) return;
  try {
    const token = await getValidToken(char);
    const response = await axios.get(`${ESI_BASE}/characters/${char.character_id}/wallet/journal/`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { page: 1 }
    });

    response.data.forEach(entry => {
      const ref = (entry.ref_type || '').toLowerCase();
      const isBounty = [
        'bounty_prizes', 'bounty_prize', 'bounty_payout', 
        'bounty_payouts', 'bounty_reimbursement', 'ess_escrow_transfer'
      ].includes(ref) || ref.includes('bounty');

      if (isBounty) {
        db.run(`
          INSERT OR IGNORE INTO journal_entries 
          (id, character_id, character_name, ref_type, amount, entry_date, entry_timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          String(entry.id),
          char.character_id,
          char.character_name,
          ref,
          entry.amount || 0,
          entry.date,
          new Date(entry.date).getTime()
        ]);
      }
    });

    saveDatabase();
    console.log(`[DB Sync] ${char.character_name}: Processed ESI entries.`);
  } catch (err) {
    console.error(`Sync failed for character ID ${char.character_id}:`, err.message);
  }
}

// -------------------------------------------------------------
// EXPRESS BACKEND API
// -------------------------------------------------------------
server.get('/auth/login', (req, res) => {
  const authUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_id=${CLIENT_ID}&scope=${encodeURIComponent(SCOPES)}&state=eve_ratting_app`;
  res.redirect(authUrl);
});

server.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  try {
    const tokenResponse = await axios.post('https://login.eveonline.com/v2/oauth/token', 
      new URLSearchParams({ grant_type: 'authorization_code', code }), 
      { headers: { Authorization: `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const verifyResponse = await axios.get('https://login.eveonline.com/oauth/verify', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const charId = verifyResponse.data.CharacterID;
    const charName = verifyResponse.data.CharacterName;
    const expiresAt = Date.now() + (expires_in * 1000);

    db.run(`
      INSERT INTO characters (character_id, character_name, access_token, refresh_token, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(character_id) DO UPDATE SET
        character_name = excluded.character_name,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at
    `, [charId, charName, access_token, refresh_token, expiresAt]);

    saveDatabase();

    await syncWalletToDatabase({
      character_id: charId,
      character_name: charName,
      access_token,
      refresh_token,
      expires_at: expiresAt
    });

    if (mainWindow) mainWindow.focus();
    res.send('<html><body style="background:#0e1015;color:#4caf50;font-family:sans-serif;padding:20px;text-align:center;"><h2>Character Authorized & Synced!</h2><p style="color:#aaa;">You may close this browser tab and return to the app.</p></body></html>');
  } catch (error) {
    console.error('SSO Error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed');
  }
});

server.get('/api/characters', (req, res) => {
  try {
    const chars = getSavedCharacters();
    res.json(chars.map(c => ({ id: c.character_id, name: c.character_name })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.post('/api/sync', async (req, res) => {
  try {
    const chars = getSavedCharacters();
    for (const char of chars) {
      await syncWalletToDatabase(char);
    }
    res.json({ success: true, message: 'Wallet sync complete.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.get('/api/stats/sessions', (req, res) => {
  if (!db) return res.json({ sessions: [] });

  const allEntries = executeQuery(`SELECT * FROM journal_entries ORDER BY entry_timestamp ASC`);
  if (!allEntries || allEntries.length === 0) return res.json({ sessions: [] });

  const GAP_THRESHOLD_MS = 40 * 60 * 1000;
  const sessions = [];
  let currentSession = null;

  allEntries.forEach(entry => {
    if (!currentSession) {
      currentSession = {
        startTime: entry.entry_timestamp,
        endTime: entry.entry_timestamp,
        totalIsk: entry.amount,
        entries: [entry]
      };
    } else if (entry.entry_timestamp - currentSession.endTime <= GAP_THRESHOLD_MS) {
      currentSession.endTime = entry.entry_timestamp;
      currentSession.totalIsk += entry.amount;
      currentSession.entries.push(entry);
    } else {
      const durationHours = Math.max((currentSession.endTime - currentSession.startTime) / (1000 * 60 * 60), 0.33);
      sessions.push({
        id: `session_${currentSession.startTime}`,
        startTime: new Date(currentSession.startTime).toISOString(),
        endTime: new Date(currentSession.endTime).toISOString(),
        totalIsk: currentSession.totalIsk,
        durationHours: durationHours.toFixed(2),
        iskPerHour: currentSession.totalIsk / durationHours,
        entryCount: currentSession.entries.length,
        entries: currentSession.entries
      });

      currentSession = {
        startTime: entry.entry_timestamp,
        endTime: entry.entry_timestamp,
        totalIsk: entry.amount,
        entries: [entry]
      };
    }
  });

  if (currentSession) {
    const durationHours = Math.max((currentSession.endTime - currentSession.startTime) / (1000 * 60 * 60), 0.33);
    sessions.push({
      id: `session_${currentSession.startTime}`,
      startTime: new Date(currentSession.startTime).toISOString(),
      endTime: new Date(currentSession.endTime).toISOString(),
      totalIsk: currentSession.totalIsk,
      durationHours: durationHours.toFixed(2),
      iskPerHour: currentSession.totalIsk / durationHours,
      entryCount: currentSession.entries.length,
      entries: currentSession.entries
    });
  }

  res.json({ sessions: sessions.reverse() });
});

server.get('/api/stats/lifetime', (req, res) => {
  if (!db) return res.json({ totalIsk: 0, totalEntries: 0 });

  const result = executeQuery(`
    SELECT 
      SUM(amount) as totalIsk, 
      COUNT(*) as totalEntries,
      MIN(entry_timestamp) as firstEntry,
      MAX(entry_timestamp) as lastEntry
    FROM journal_entries
  `);

  const row = result[0] || {};
  res.json({
    totalIsk: row.totalIsk || 0,
    totalEntries: row.totalEntries || 0,
    firstEntry: row.firstEntry ? new Date(row.firstEntry).toISOString() : null,
    lastEntry: row.lastEntry ? new Date(row.lastEntry).toISOString() : null
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// -------------------------------------------------------------
// ELECTRON APP LIFECYCLE
// -------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    title: "EVE Ratting Tracker - Lifetime Analytics",
    backgroundColor: '#0e1015',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
}

app.whenReady().then(async () => {
  await initDatabase();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});