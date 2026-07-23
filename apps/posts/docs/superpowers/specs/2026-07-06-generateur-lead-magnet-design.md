# Générateur de lead magnet vers Notion

Date : 2026-07-06
Statut : implémenté
Branche : feature/lead-magnet

## Contexte

Les posts Charlie promettent une ressource en DM ("Commentez CHARLIE et je vous
envoie le guide"). Cette ressource, le lead magnet, était à produire à la main.
Ce module la génère en un clic depuis l'onglet Bibliothèque, directement dans
une database Notion, pour un partage par lien public.

## Décisions produit (validées avec Sacha)

- **Format auto-détecté** : Claude lit le post et son CTA et choisit le format
  qui correspond à la promesse (guide, checklist, comparatif, template).
- **Profondeur** : guide complet, 5 à 8 sections actionnables, exemples CGP.
- **Destination** : database Notion dédiée "Lead Magnets Charlie"
  (`d85f55953d33438399c869becfe2b421`, créée le 2026-07-06).
- **Partage** : l'utilisateur active "Publier sur le web" sur la page Notion
  (l'API Notion ne peut pas le faire) puis envoie le lien en DM.

## Architecture (flux en 2 étapes: brouillon relu puis publié)

```
LibraryView (bouton "Générer le lead magnet" par entrée)
  → POST /api/generate-lead-magnet { ..., dry_run: true }
      Claude (LEAD_MAGNET_SYSTEM_PROMPT) → brouillon JSON
      { format, titre, accroche, sections[], conclusion, charlie_pitch }
  → LeadMagnetPreview: aperçu ÉDITABLE dans l'app (titre, format, accroche,
    sections, conclusion, pitch; sections supprimables). Rien n'est publié.
  → POST /api/push-lead-magnet { magnet (relu), keyword, source_excerpt }
      Notion REST API → 2 niveaux:
      1. fiche de suivi dans la database (propriétés internes, jamais partagée)
      2. SOUS-PAGE de contenu pur (titre + contenu, aucune propriété
         dépliable): c'est elle qu'on publie sur le web
      + section finale garantie par le code: "Ce que Charlie automatise"
        (pitch rédigé par Claude) + callout contact (LEAD_MAGNET_CONTACT)
  → library.updateEntry(id, { lead_magnet }) : persiste l'URL dans IndexedDB
```

- Le champ `lead_magnet` est optionnel sur `LibraryEntry` (rétrocompatible,
  inclus dans l'export/import de sauvegarde existant).
- Contenu exigé niveau expert (le lecteur est un pro de la gestion de
  patrimoine: pas de bases du métier, matériel directement réutilisable) avec
  fil automatisation manuel vs IA. Règles dans LEAD_MAGNET_SYSTEM_PROMPT.
- Erreurs Notion relayées avec le message de l'API (ex: database non partagée
  avec l'intégration).
- La database cible vit dans le Notion de Thomas (page "Système LinkedIn
  CGP"), token de son intégration dans server/.env. Pour tester sur un autre
  workspace: créer une intégration interne (notion.so/profile/integrations),
  la connecter à une database au même schéma, renseigner NOTION_API_KEY et
  NOTION_DATABASE_ID.

## Configuration requise (server/.env)

- `NOTION_API_KEY` : token d'une intégration interne Notion
  (créée sur notion.so/profile/integrations, connectée à la database).
- `NOTION_DATABASE_ID` : id de la database cible (par défaut celle créée).

## Non-objectifs

- Publication web automatique (impossible via l'API Notion).
- Export PDF (le partage passe par le lien Notion public).
- Régénération incrémentale : regénérer remplace le lien dans la Bibliothèque,
  l'ancienne page Notion reste (suppression manuelle si besoin).
