# Charlie Post Reformulator

Outil local pour reformuler des posts LinkedIn performants et les adapter à la niche Charlie (CGP, banquiers privés, asset managers) avec apprentissage continu.

## 🚀 Architecture

**Full-stack avec Claude Haiku 4.5**
- **Frontend** : React 19 + TypeScript + Vite
- **Backend** : Node.js + Express (Claude API sécurisée)
- **Storage** : IndexedDB local (posts gagnants, hooks)
- **LLM** : Claude Haiku 4.5 pour reformulation + apprentissage

## 📋 Prérequis

- **Node.js** (v18+)
- **Clé API Claude** ([obtenir ici](https://console.anthropic.com/))

## ⚡ Quick Start

### 1. Clone et installe

```bash
# Server
cd server
npm install

# Client (nouveau terminal)
cd client
npm install
```

### 2. Configure les variables d'environnement

**Server** (`server/.env`) :
```bash
cp server/.env.example server/.env
# Édite et ajoute ta clé Claude: CLAUDE_API_KEY=sk-ant-...
```

**Client** (`client/.env.local`) :
```bash
cp client/.env.example client/.env.local
# Laisse VITE_SERVER_URL=http://localhost:5001 (défaut)
```

### 3. Lance le serveur et le frontend

**Terminal 1** (Serveur) :
```bash
cd server
node index.js
# Doit afficher: ✓ Serveur Charlie lancé sur http://localhost:5001
```

**Terminal 2** (Frontend) :
```bash
cd client
npm run dev
# Doit afficher: Local: http://localhost:5173
```

### 4. Ouvre le navigateur

Va sur **http://localhost:5173** 🚀

## 💡 Comment utiliser

### Onglet "✨ Reformulateur"

1. Colle un post LinkedIn/Twitter
2. Entre ta clé Claude API (première utilisation)
3. Clique "Reformuler"
4. Reçois 3 variantes avec :
   - **Variante 1, 2, 3** : Texte complet + CTA intégré
   - **Angle** : Positionnement détecté
   - **Trigger émotionnel** : Émotion clé activée
   - **Mot-clé CTA** : Pour les commentaires
   - **Nombre de caractères** : Vérif < 700 chars ✓

5. Clique "🔍 Vérifier style" pour valider les règles Charlie

### Onglet "🧠 Apprentissage"

Deux sections pour améliorer continuellement :

**Posts Gagnants** :
- Colle un post performant (externe ou interne)
- Claude analyse automatiquement :
  - Hook percutant
  - Angle de positionnement
  - Trigger émotionnel
  - Pourquoi ça marche
- Sauvegardé localement ✓

**Hooks Forts** :
- Ajoute des hooks excellents trouvés partout
- Enrichissent le contexte d'apprentissage
- Intégrés automatiquement dans chaque reformulation

**L'apprentissage est privé** (IndexedDB en navigateur, jamais envoyé au serveur)

## 🎨 Règles de Style Charlie (Non-négociables)

Chaque variante doit :
- ❌ Pas de tirets (`-` ou `—`)
- ❌ Pas de superlatifs (meilleur, incroyable, révolutionnaire, etc.)
- ✓ **Max 700 caractères** (CTA inclus)
- ✓ Ton précis avec données concrètes
- ✓ Structure : Hook → Corps → Transition → CTA structuré

**CTA Structuré** (exemple) :
```
Hook (accroche)

Corps (valeur + exemple + contexte Charlie)

Transition + Action + Urgence :
"Intéressé? Commentez CHARLIE ci-dessous et je vous l'envoie en DM. 
Les premiers à répondre seront traités en priorité."
```

## 📁 Structure du projet

```
charlie-post-reformulator/
├── server/
│   ├── index.js                   # Express app + POST /api/reformulate (seul serveur)
│   ├── .env.example
│   ├── .env                       # À créer (pas commité)
│   └── package.json
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ReformulationForm.tsx
│   │   │   ├── VariantsDisplay.tsx
│   │   │   ├── StyleLinter.tsx
│   │   │   ├── LearningBooks.tsx
│   │   │   └── ...
│   │   ├── hooks/
│   │   │   ├── useClaudeAPI.ts    # POST /api/reformulate
│   │   │   ├── useLearningDB.ts   # IndexedDB
│   │   │   └── useStyleLinter.ts  # Validation local
│   │   ├── utils/
│   │   │   └── styleRules.ts      # Règles Charlie
│   │   └── ...
│   ├── .env.local                 # À créer (pas commité)
│   ├── .env.example
│   └── package.json
│
├── .gitignore
└── README.md
```

## 🔒 Sécurité

- **Clé API Claude** : Reste sur le serveur (`server/.env` dans `.gitignore`)
- **Frontend** : Pas d'appels directs à Claude (pas d'exposition de clé)
- **IndexedDB** : 100% local et privé (jamais envoyé au serveur)
- **Données** : Jamais loggées ou stockées côté serveur

## 📊 Coûts Claude

- **Model** : Claude Haiku 4.5 (économique)
- **Prix** : ~$0.80 par 1M input tokens, ~$4 par 1M output tokens
- **Par reformulation** : ~500 tokens en/sortie (~$0.002 par post)

## 🚀 Déploiement (futur)

Pour partager en production :

**Backend** : Railway, Render, Heroku
```bash
# Build et push
git push heroku main
```

**Frontend** : Vercel, Netlify
```bash
npm run build
# Puis deployer le dossier dist/
```

## 🐛 Troubleshooting

### "Erreur réseau : Impossible de joindre le serveur"
→ Vérifie que le serveur tourne sur le bon port (défaut: 5001)
→ Vérifie que `VITE_SERVER_URL` dans `client/.env.local` est correct

### "IndexedDB non disponible"
→ Rafraîchis la page ou vide le cache du navigateur

### "Réponse Claude invalide"
→ Vérifies que ta clé API est valide et a des crédits disponibles

## 📬 Questions ?

Ouvre une issue GitHub ou discute directement.

---

**v1.0** • Full-stack • Claude Haiku 4.5 • Node.js + React • IndexedDB local
