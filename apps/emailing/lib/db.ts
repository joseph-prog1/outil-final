import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const g = globalThis as unknown as { __charlieDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!g.__charlieDb) {
    const dir = path.join(process.cwd(), 'data');
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, 'emailing.db'));
    db.exec('PRAGMA journal_mode = WAL;');
    migrate(db);
    seed(db);
    g.__charlieDb = db;
  }
  return g.__charlieDb;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      job_title TEXT DEFAULT '',
      persona TEXT DEFAULT 'autre',
      source_slug TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      current_step INTEGER DEFAULT 0,
      next_send_at TEXT,
      last_message_id TEXT,
      thread_subject TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
    CREATE INDEX IF NOT EXISTS idx_contacts_next ON contacts(next_send_at);

    CREATE TABLE IF NOT EXISTS templates (
      step INTEGER PRIMARY KEY,
      name TEXT,
      delay_days INTEGER DEFAULT 3,
      subject TEXT DEFAULT '',
      body TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS personas (
      key TEXT PRIMARY KEY,
      label TEXT,
      label_pluriel TEXT,
      accroche TEXT,
      cas_usage TEXT,
      fonctionnalite TEXT,
      objection TEXT,
      sujet_court TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER,
      type TEXT,
      step INTEGER DEFAULT 0,
      meta TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_contact ON events(contact_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);
}

const DEFAULT_SETTINGS: Record<string, string> = {
  google_client_id: '',
  google_client_secret: '',
  google_refresh_token: '',
  google_access_token: '',
  google_token_expiry: '',
  google_email: '',
  smtp_host: 'smtp-relay.brevo.com',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  from_email: '',
  gmail_user: '',
  gmail_app_password: '',
  sender_name: 'Thomas',
  calendly_url: '',
  daily_cap: '40',
  sending_enabled: '0',
  base_url: 'http://localhost:3005',
  send_start: '08:30',
  send_end: '18:30',
  send_days: '1,2,3,4,5',
  min_gap_seconds: '90',
  track_secret: '',
};

const TEMPLATES: Array<{ step: number; name: string; delay_days: number; subject: string; body: string }> = [
  {
    step: 1,
    name: 'Découverte',
    delay_days: 0,
    subject: 'Votre analyse de fonds en 3 minutes',
    body: `Bonjour {{prenom}},

Vous avez téléchargé un de nos guides sur {{source_theme}} — merci pour votre confiance.

Je me permets de vous présenter Charlie : une IA conçue pour les {{label_pluriel}}, qui {{accroche}}.

Concrètement : {{cas_usage}}.

Si vous voulez voir ce que ça donne sur vos propres cas, je vous montre en 20 minutes :
{{calendly}}

Bonne journée,
{{expediteur}}`,
  },
  {
    step: 2,
    name: 'Preuve / fonctionnalité',
    delay_days: 3,
    subject: '',
    body: `Bonjour {{prenom}},

Je reviens vers vous au sujet de Charlie.

{{fonctionnalite}}

Résultat : ce qui prenait une demi-journée se fait en quelques minutes, avec un argumentaire prêt à présenter au client.

20 minutes suffisent pour le voir en vrai : {{calendly}}

{{expediteur}}`,
  },
  {
    step: 3,
    name: 'Objections',
    delay_days: 4,
    subject: '',
    body: `Bonjour {{prenom}},

{{probleme}}

La question qui revient le plus souvent chez les {{label_pluriel}} : {{objection}}

Si vous vous posez la même question, le plus simple est d'en parler 20 minutes : {{calendly}}

{{expediteur}}`,
  },
  {
    step: 4,
    name: 'Dernière opportunité',
    delay_days: 5,
    subject: '',
    body: `Bonjour {{prenom}},

Je clôture mes créneaux de démonstration du mois — il m'en reste quelques-uns.

Si Charlie peut vous faire gagner du temps sur {{sujet_court}}, c'est le moment : {{calendly}}

Et si ce n'est pas d'actualité pour vous, dites-le-moi simplement, je ne vous relancerai pas.

Bonne journée,
{{expediteur}}`,
  },
];

const PERSONAS: Array<Record<string, string>> = [
  {
    key: 'cgp',
    label: 'CGP / CIF',
    label_pluriel: 'conseillers en gestion de patrimoine',
    accroche: 'analyse et compare les fonds à votre place, avec un argumentaire client prêt à l’emploi',
    cas_usage: 'vous passez un contrat au crible et sortez une proposition d’allocation argumentée en quelques minutes, au lieu d’une demi-journée de comparaisons',
    fonctionnalite: 'Le Screener de Charlie passe des milliers de fonds au crible selon vos critères (performance, frais, volatilité, ESG…) et vous sort une sélection justifiée, prête à présenter au client.',
    objection: '« Est-ce que je peux faire confiance aux résultats ? » — chaque recommandation est sourcée et justifiée ligne par ligne. Vous gardez la main sur la décision finale, Charlie fait le travail de fond.',
    sujet_court: 'la sélection et la justification de vos fonds',
    probleme: 'Comparer des dizaines de fonds, justifier chaque allocation au client, refaire l’exercice à chaque arbitrage : c’est des heures chaque semaine.',
  },
  {
    key: 'banquier_prive',
    label: 'Banquier privé',
    label_pluriel: 'banquiers privés',
    accroche: 'produit des propositions d’investissement personnalisées et argumentées, à l’échelle de votre portefeuille de clients',
    cas_usage: 'pour chaque client, vous générez une proposition d’allocation adaptée à son profil, chiffrée et sourcée, en quelques minutes',
    fonctionnalite: 'Charlie combine le Screener (sélection de fonds selon vos contraintes maison) et le Reporting (documents client prêts à envoyer) — la personnalisation d’un family office, au rythme d’une banque privée.',
    objection: '« Est-ce compatible avec nos contraintes de conformité ? » — les critères de sélection sont les vôtres, tout est traçable et justifié, rien n’est envoyé sans votre validation.',
    sujet_court: 'vos propositions d’investissement',
    probleme: 'Personnaliser réellement les propositions pour des dizaines de clients, avec les exigences de conformité d’une banque : les journées n’y suffisent pas.',
  },
  {
    key: 'family_office',
    label: 'Family office',
    label_pluriel: 'family offices',
    accroche: 'consolide l’analyse multi-poches et applique vos exigences (ESG, exclusions, frais) sur l’ensemble des lignes',
    cas_usage: 'vous appliquez une politique d’exclusions ESG sur toutes les poches d’un client et identifiez immédiatement les lignes non conformes, avec les alternatives',
    fonctionnalite: 'Le Screener de Charlie applique vos filtres d’exclusion (ESG, secteurs, frais) sur des milliers de fonds et documente chaque décision — le niveau d’exigence d’un mandat institutionnel, sans l’armée d’analystes.',
    objection: '« Nos critères sont trop spécifiques pour un outil » — les critères sont entièrement paramétrables, et c’est justement sur les politiques sur mesure que Charlie fait gagner le plus de temps.',
    sujet_court: 'l’analyse et la conformité de vos allocations',
    probleme: 'Consolider plusieurs poches, appliquer des politiques d’investissement sur mesure et le documenter proprement : un travail d’équipe entière, souvent fait à la main.',
  },
  {
    key: 'gerant',
    label: 'Gérant / gestionnaire',
    label_pluriel: 'gérants de portefeuille',
    accroche: 'automatise la veille sur vos lignes et la production de vos reportings',
    cas_usage: 'votre reporting mensuel — performances, mouvements, commentaires de gestion — est généré automatiquement, prêt à relire et envoyer',
    fonctionnalite: 'Le Reporting de Charlie produit vos documents périodiques à partir de vos portefeuilles : performances, attribution, commentaires — vous relisez, vous envoyez.',
    objection: '« Un reporting généré, ça se voit » — vous gardez vos modèles et votre ton ; Charlie remplit, vous signez.',
    sujet_court: 'vos reportings et votre veille',
    probleme: 'La production des reportings et la veille sur les lignes mangent le temps qui devrait aller à la gestion elle-même.',
  },
  {
    key: 'assureur',
    label: 'Assurance / courtage',
    label_pluriel: 'courtiers et assureurs',
    accroche: 'analyse les supports en unités de compte et justifie vos préconisations, document à l’appui',
    cas_usage: 'vous comparez les UC de plusieurs contrats et sortez une préconisation argumentée et conforme en quelques minutes',
    fonctionnalite: 'Le Screener de Charlie compare les supports disponibles dans vos contrats (performance, frais, SRI, ESG) et produit la justification écrite que la réglementation vous demande.',
    objection: '« Encore un outil à ajouter à la pile ? » — pas d’intégration lourde : vous partez de vos contrats, Charlie fait l’analyse, vous récupérez le document.',
    sujet_court: 'l’analyse de vos supports en UC',
    probleme: 'Justifier chaque préconisation, documenter le devoir de conseil, suivre des centaines de supports : la charge administrative explose.',
  },
  {
    key: 'autre',
    label: 'Autre',
    label_pluriel: 'professionnels du patrimoine',
    accroche: 'analyse les fonds et produit des recommandations d’investissement argumentées en quelques minutes',
    cas_usage: 'vous obtenez une analyse complète d’un fonds ou d’une allocation — performance, frais, risques, ESG — prête à partager',
    fonctionnalite: 'Charlie combine un Screener (sélection de fonds selon vos critères) et un Reporting (documents prêts à envoyer) pour faire en minutes ce qui prend des heures.',
    objection: '« Est-ce vraiment adapté à mon activité ? » — c’est exactement l’objet d’une démo de 20 minutes : on part de vos cas réels, pas d’un discours commercial.',
    sujet_court: 'l’analyse de fonds',
    probleme: 'L’analyse de fonds et la production de documents d’investissement restent un travail long, répétitif et difficile à déléguer.',
  },
];

function seed(db: DatabaseSync) {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);
  // Secret de tracking généré une fois
  const secret = db.prepare("SELECT value FROM settings WHERE key = 'track_secret'").get() as { value: string } | undefined;
  if (!secret || !secret.value) {
    const random = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    db.prepare("UPDATE settings SET value = ? WHERE key = 'track_secret'").run(random);
  }

  const insertTemplate = db.prepare(
    'INSERT OR IGNORE INTO templates (step, name, delay_days, subject, body) VALUES (?, ?, ?, ?, ?)'
  );
  for (const t of TEMPLATES) insertTemplate.run(t.step, t.name, t.delay_days, t.subject, t.body);

  const insertPersona = db.prepare(
    `INSERT OR IGNORE INTO personas (key, label, label_pluriel, accroche, cas_usage, fonctionnalite, objection, sujet_court)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const p of PERSONAS) {
    insertPersona.run(p.key, p.label, p.label_pluriel, p.accroche, p.cas_usage, p.fonctionnalite, p.objection, p.sujet_court);
  }
  // La colonne probleme est utilisée par l'email 3 — ajoutée après coup si absente
  try {
    db.exec("ALTER TABLE personas ADD COLUMN probleme TEXT DEFAULT ''");
  } catch {
    /* colonne déjà présente */
  }
  const updProbleme = db.prepare("UPDATE personas SET probleme = ? WHERE key = ? AND (probleme IS NULL OR probleme = '')");
  for (const p of PERSONAS) updProbleme.run(p.probleme, p.key);
}

export function getSetting(key: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

export function getSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}
