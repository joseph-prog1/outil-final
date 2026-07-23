# Charlie AI Emailing

Outil de prospection email automatisée : séquences de 4 emails personnalisées par métier, envoi via Gmail, prise de RDV (Calendly), tracking des ouvertures / clics / réponses. **100 % gratuit** — aucune API payante (Gmail + SQLite natif de Node).

## Démarrage

```bash
npm install
npm run dev        # http://localhost:3005
```

## Mise en route (5 étapes)

1. **Contacts** → « Importer newsletter-contacts-uniques-….csv ». Les métiers sont automatiquement rattachés à un persona (CGP, banquier privé, family office, gérant, assurance, autre) ; les désinscrits sont exclus.
2. **Réglages** → compte d'envoi, lien Calendly, quota journalier (40 par défaut), fenêtre d'envoi. Envoyez-vous un **email de test**. Trois options d'envoi :
   - **Connexion Google (recommandé)** : bouton « Connecter mon compte Gmail » directement dans l'app. Envoi via votre Gmail + **détection automatique des réponses**, sans mot de passe d'application. Préparation unique (~5 min, guide pas à pas intégré dans Réglages) : créer une clé OAuth gratuite sur console.cloud.google.com (projet → activer Gmail API → écran de consentement avec votre email en utilisateur test → ID client Web avec l'URI de redirection `http://localhost:3005/api/google/callback`). En mode « test », la connexion expire tous les 7 jours (un clic pour renouveler).
   - **Relais SMTP gratuit** : [Brevo](https://www.brevo.com/fr/) (300 emails/jour) ou [SMTP2GO](https://www.smtp2go.com) (1 000/mois, sans logo). Pas de détection automatique des réponses — bouton « A répondu » dans Contacts.
   - **Gmail direct** : [mot de passe d'application](https://myaccount.google.com/apppasswords) (nécessite la validation en 2 étapes). Active aussi la détection des réponses (IMAP).
3. **Séquences** → relisez / ajustez les 4 emails et les contenus par persona. L'aperçu montre le rendu final.
4. **Campagne** → « Activer des contacts » (commencez avec 20-50), puis « Démarrer la campagne ».
5. **Dashboard** → suivez envois, ouvertures, clics, réponses et RDV.

## Fonctionnement

- **Séquence** : Email 1 (découverte) → J+3 Email 2 (preuve) → J+7 Email 3 (objections) → J+12 Email 4 (dernière opportunité). Les emails 2-4 partent dans le **même fil** (« Re: … »).
- **Arrêt automatique** : si le contact répond (détection toutes les 10 min via la connexion Google ou IMAP), prend RDV ou se désinscrit, la séquence s'arrête. Sans détection configurée, utilisez le bouton « A répondu ».
- **Envoi automatique** : un cycle toutes les 5 minutes tant que l'app tourne, dans la fenêtre d'envoi et sous le quota journalier, avec espacement aléatoire entre les emails.
- **Désinscription** : lien en pied de chaque email (obligation légale).
- **Personnalisation sans IA payante** : templates + variables par persona (`{{accroche}}`, `{{cas_usage}}`…) + thème du guide téléchargé (`{{source_theme}}`).

## Tracking ouvertures / clics

Le pixel d'ouverture et les liens traqués pointent vers l'« URL publique » des Réglages. En local pur ils ne sont pas joignables par les destinataires ; pour les activer gratuitement :

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3005
```

puis collez l'URL `https://….trycloudflare.com` dans Réglages → URL publique. Réponses, envois et RDV fonctionnent même sans ça.

## Données

Tout est dans `data/emailing.db` (SQLite). Supprimer ce fichier remet l'outil à zéro (les templates par défaut sont recréés).
