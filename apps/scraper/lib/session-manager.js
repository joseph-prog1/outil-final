const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_DIR = path.join(process.cwd(), '.sessions');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'dev-key-change-in-prod';

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32),
    iv
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text) => {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32),
    iv
  );
  let decrypted = decipher.update(Buffer.from(parts[1], 'hex'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

const saveSession = (userId, storageState) => {
  const sessionFile = path.join(SESSION_DIR, `${userId}.json`);
  const encrypted = encrypt(JSON.stringify(storageState));
  fs.writeFileSync(sessionFile, JSON.stringify({ encrypted, createdAt: new Date() }));
  console.log(`[SESSION] Saved for user ${userId}`);
};

const loadSession = (userId) => {
  const sessionFile = path.join(SESSION_DIR, `${userId}.json`);
  if (!fs.existsSync(sessionFile)) {
    console.log(`[SESSION] Not found for user ${userId}`);
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    const storageState = JSON.parse(decrypt(data.encrypted));
    console.log(`[SESSION] Loaded for user ${userId}`);
    return storageState;
  } catch (error) {
    console.error(`[SESSION] Error loading session:`, error);
    return null;
  }
};

const deleteSession = (userId) => {
  const sessionFile = path.join(SESSION_DIR, `${userId}.json`);
  if (fs.existsSync(sessionFile)) {
    fs.unlinkSync(sessionFile);
    console.log(`[SESSION] Deleted for user ${userId}`);
  }
};

const listSessions = () => {
  return fs.readdirSync(SESSION_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
};

module.exports = {
  saveSession,
  loadSession,
  deleteSession,
  listSessions,
};
