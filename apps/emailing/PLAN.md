# Plan – Système de prospection email Charlie

**Objectif** : convertir les personnes ayant répondu à Thomas (LinkedIn) en rendez-vous commerciaux, via des séquences d'emails personnalisées et automatisées, avec suivi des performances.

**Approche retenue** : système sur mesure (pas d'outil SaaS type Lemlist).

---

## 1. Architecture du système

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  LISTE PROSPECTS │ → │  PERSONNALISATION │ → │     ENVOI        │
│  (SQLite/CSV)    │    │  (templates + IA) │    │  (Gmail API)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        ↑                                               ↓
┌─────────────────┐                          ┌─────────────────┐
│  ENRICHISSEMENT  │                          │    TRACKING      │
│  (email, métier) │                          │  (ouvertures,    │
└─────────────────┘                          │  clics, réponses,│
                                             │  RDV pris)       │
                                             └─────────────────┘
```

### 1.1 Liste de prospects (base de données)

- **Source principale** : la base `contacts.db` du bot LinkedIn (`Screener/linkedin-comment-to-dm-bot/data/`), filtrée sur les contacts ayant répondu à Thomas. ⚠️ La copie locale est vide — récupérer la base de la machine qui fait tourner le bot (Mathis ?).
- **Source secondaire** : import manuel CSV/Excel (contacts hors bot).
- **⚠️ Point bloquant identifié** : `contacts.db` ne contient **pas d'adresse email** (nom, prénom, URL profil LinkedIn, texte du thread seulement). Les réponses ont eu lieu sur LinkedIn. Il faut une étape d'**enrichissement** :
  - manuel (profil LinkedIn → email pro visible, site de la société) ;
  - ou outil type Dropcontact / Hunter.io (RGPD-friendly pour Dropcontact, ~24 €/mois) ;
  - ou demander l'email dans le fil LinkedIn (« je t'envoie ça par mail, tu me donnes ton adresse ? ») — le plus fiable et le plus naturel vu qu'ils ont déjà répondu.

Schéma cible de la table `prospects` :

| Champ | Exemple |
|---|---|
| nom, prénom | — |
| email | à enrichir |
| profil LinkedIn | depuis contacts.db |
| métier / persona | CGP, gérant privé, family office, banquier privé, autre |
| société | — |
| contexte | résumé de son échange avec Thomas (thread_text) |
| statut séquence | non_démarré / email_1 / email_2 / … / répondu / rdv_pris / stop |
| dates d'envoi, ouvertures, clics | tracking |

### 1.2 Personnalisation (templates + IA)

- **Templates par persona** (voir §3) avec variables : `{prénom}`, `{société}`, `{accroche_contextuelle}`, `{cas_usage_métier}`, `{fonctionnalité_mise_en_avant}`.
- **Génération IA (API Claude)** : pour chaque prospect, générer l'accroche personnalisée à partir du contexte LinkedIn (ce qu'il a dit à Thomas) + son métier. Le corps reste le template validé à la main → contrôle du message, personnalisation là où ça compte.
- Mode **revue avant envoi** au début (validation manuelle de chaque email généré), passage en automatique quand la qualité est confirmée.

### 1.3 Envoi (Gmail API)

- Envoi via **Gmail API** depuis le compte de Thomas (recommandé : c'est à lui qu'ils ont répondu, la continuité est naturelle et la délivrabilité meilleure) — à défaut un compte dédié.
- **Séquenceur** : script Python + tâche planifiée (cron/launchd). Cadence : J0, J+3, J+7, J+12 (jours ouvrés, heures d'envoi 8h30–11h).
- **Arrêt automatique** de la séquence dès qu'une réponse est détectée (lecture de la boîte via Gmail API) ou qu'un RDV est pris.
- **Limites de volume** : 30–50 emails/jour max au début (délivrabilité), montée progressive.
- Lien de **désinscription** simple en pied d'email (obligation légale + protège la réputation d'envoi).

### 1.4 Prise de rendez-vous

- Lien **Calendly** (gratuit pour 1 type d'événement) ou **Google Calendar – plage de rendez-vous** dans chaque email.
- Événement type : « Démo Charlie – 30 min ».
- Webhook Calendly (ou scan du calendrier) → statut `rdv_pris` dans la base → arrêt de la séquence.

### 1.5 Tracking

| Indicateur | Méthode | Fiabilité |
|---|---|---|
| Ouvertures | pixel invisible (image 1×1 servie par un petit endpoint) | moyenne (proxys Apple/Gmail gonflent les chiffres) |
| Clics | liens réécrits via URL de redirection maison | bonne |
| Réponses | Gmail API (détection dans la boîte) | très bonne |
| RDV pris | Calendly webhook / calendrier | très bonne |

- Le pixel et les redirections nécessitent un **petit serveur exposé** (ex. Cloudflare Workers / Vercel gratuit, ou le serveur du bot existant).
- **Dashboard** : simple page (ou même un script qui sort un tableau) : envoyés / ouverts / cliqués / répondus / RDV, par email de la séquence et par persona.

---

## 2. Séquence d'emails (storytelling en 4 temps)

Fil narratif : *découverte → preuve → projection → dernière porte*. Chaque email est court (< 120 mots), orienté bénéfices, un seul CTA : réserver un créneau.

| # | Jour | Thème | Angle |
|---|---|---|---|
| 1 | J0 | **Découverte** | Rappel du contexte (« suite à ton échange avec Thomas »), le problème que Charlie résout pour *son* métier, comment ça marche en 2 phrases, 1 cas d'usage concret, CTA démo. |
| 2 | J+3 | **Preuve** | Résultat client / témoignage chiffré, focus sur la fonctionnalité la plus pertinente pour son persona (Screener ou Reporting), CTA. |
| 3 | J+7 | **Projection + objections** | « À quoi ressemblerait votre quotidien avec Charlie » + réponse à l'objection n°1 de son persona (temps d'installation, sécurité des données, prix…), CTA. |
| 4 | J+12 | **Dernière opportunité** | Court, direct, urgence douce (« je clos les créneaux démo de [mois] »), porte ouverte (« si ce n'est pas le moment, dites-le-moi et je n'insiste pas »), CTA. |

---

## 3. Personnalisation par persona

| Persona | Problématique | Fonctionnalité à mettre en avant | Cas d'usage exemple |
|---|---|---|---|
| CGP / conseiller en gestion de patrimoine | temps passé à comparer les fonds, justifier les allocations aux clients | **Screener** | sélection de fonds argumentée en minutes |
| Gérant privé / allocataire | production des reportings, veille sur les lignes | **Reporting** | reporting client généré automatiquement |
| Family office | consolidation multi-supports, exigences ESG | Screener + exclusions ESG | filtrage ESG type chantier Cardif |
| Banquier privé | volume de clients, personnalisation des propositions | Screener + Reporting | propositions d'allocation personnalisées à l'échelle |

*(À affiner avec Thomas : lister les métiers réellement présents dans les réponses.)*

---

## 4. Délivrabilité (à ne pas négliger)

- Envoi depuis le **compte réel de Thomas** = meilleure option (historique d'envoi, domaine établi, et ce sont des contacts « tièdes » qui le connaissent).
- Vérifier **SPF / DKIM / DMARC** du domaine d'envoi.
- Volume progressif, texte varié (la personnalisation IA aide), pas de pièces jointes, peu de liens (CTA + désinscription max).
- Éviter les mots spam (« gratuit », « offre », excès de majuscules/points d'exclamation).

---

## 5. Phases d'exécution

- **Phase 1 – Fondations** *(sans code, démarrable tout de suite)*
  1. Récupérer la vraie `contacts.db` + extraire les contacts « ayant répondu ».
  2. Définir les personas réels avec Thomas, enrichir les emails.
  3. Rédiger les 4 emails × personas, faire valider par Thomas.
  4. Créer le lien Calendly « Démo Charlie ».
- **Phase 2 – Moteur d'envoi**
  5. Base `prospects` + import depuis contacts.db/CSV.
  6. Génération personnalisée (templates + API Claude) avec mode revue.
  7. Envoi Gmail API + séquenceur + détection de réponses (stop auto).
- **Phase 3 – Tracking**
  8. Endpoint pixel + redirections de clics, webhook Calendly.
  9. Dashboard de suivi (envoyés / ouverts / cliqués / répondus / RDV) par email et persona.
- **Phase 4 – Itération**
  10. A/B test des objets, ajustement des messages selon les stats, montée en volume.

---

## 6. Décisions à prendre / points ouverts

1. **Compte d'envoi** : Thomas est-il OK pour envoyer depuis sa boîte (accès Gmail API sur son compte) ?
2. **Emails des prospects** : enrichissement outil, manuel, ou demande directe dans le fil LinkedIn ?
3. **Récupérer la base réelle** du bot (machine de Mathis ?).
4. **Calendly vs Google Calendar** pour la prise de RDV.
5. Hébergement du petit serveur de tracking (Cloudflare Workers gratuit suffit).
