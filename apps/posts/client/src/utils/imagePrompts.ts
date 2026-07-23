// Direction artistique Charlie pour les miniatures LinkedIn.
// Pipeline en deux temps: Claude (directeur artistique) choisit 3 archétypes
// parmi le catalogue de références et écrit un brief par archétype via
// /api/image-briefs; puis Gemini (Nano Banana Pro) exécute chaque brief en
// recevant EN ENTRÉE le logo Charlie exact + la miniature de référence de
// l'archétype (server/assets/references/). Les templates ci-dessous sont en
// anglais: Gemini suit mieux les consignes de mise en page en anglais, seul
// le texte à afficher reste en français.

export type Archetype =
  | 'versus'
  | 'partenariat'
  | 'workflow'
  | 'diagramme_produit'
  | 'mockup_iphone'
  | 'bar_chart'
  | 'typo_geante'
  | 'icone_3d'
  // Nouveaux archétypes (sans image de référence: rendus via STYLE_CORE_SOLO)
  | 'chiffre_cle'
  | 'citation'
  | 'avant_apres'
  | 'checklist'
  | 'timeline'
  | 'grille_sources';

export interface ImageBrief {
  archetype: Archetype | string;
  titre: string;
  sous_ligne?: string;
  // Mots du titre à mettre en orange brique
  mots_orange?: string[];
  // Contenu spécifique à l'archétype (étapes, nom du concurrent, données du
  // graphique...), rédigé par le directeur artistique
  contenu: string;
  justification?: string;
}

export interface ImagePrompt {
  text: string;
  archetype: string;
}

// Bloc commun: références d'entrée + ADN visuel + interdits.
// "image 1" = logo Charlie, "image 2" = miniature de référence de l'archétype.
const STYLE_CORE = `
INPUT IMAGES:
- Image 1 is the official Charlie logo. COPY IT PIXEL-FAITHFULLY, as if composited into the layout: exact glyph shapes, exact proportions, flat black. Never redraw, restyle, recolor, distort or reinterpret it — not even "close": a redrawn or approximated logo makes the whole image unusable.
- Image 2 is a style reference from the Charlie brand catalog. Replicate its art direction faithfully — background color and paper-grain texture, typography style, color palette, composition logic, spacing, shadow softness — but create NEW content as described below. Never copy the text or the specific subject of the reference.
- Any FURTHER input image is a logo or illustration supplied by the user: reproduce it EXACTLY as provided (same shapes, same colors, same proportions), like a pasted asset. Never redesign, stylize, recolor to the brand palette, or approximate it.

CHARLIE VISUAL DNA (non-negotiable):
- Background: warm cream paper (#F7F3EC, may drift to pale peach #F2E4DA in subtle radial corners), with a fine uniform paper-grain texture. Never dark, never pure white, never busy.
- Ink: soft near-black (#1A1A1A), never pure #000.
- Accent: brick orange / terracotta (#C05A2E to #E07020). Warm taupe (#CFC5B8) as secondary neutral.
- Maximum 3 active colors per image (cream + black + one orange). Signal red (#D9251C) is reserved exclusively for a crossing-out X.
- Headline typography: high-contrast editorial serif (Tiempos / GT Sedona / Freight Display style). Labels and captions: neutral grotesque sans-serif (Inter / Helvetica style), often uppercase with wide letter-spacing.
- Minimalism: at least 65% of the canvas is empty cream background. Generous constant margins (8-10% each side). One single idea per image.
- All rendered text is in FRENCH with flawless spelling and accents, razor-sharp and legible.
- TEXT SOBRIETY (critical): keep on-image text to the absolute minimum. A great thumbnail is read in one second — the visual carries the message, not paragraphs. NO descriptive sentence, NO concluding tagline/slogan, NO footnote, NO redundant subtitle. Prefer one strong short headline plus only the labels the layout strictly needs.
- NO DUPLICATION (critical): the same word, number or label NEVER appears twice on the image. If the main visual element (giant figure, quote, logo pair) already shows an information, no title, label or caption may repeat it. Example of failure to avoid: a headline "60% sans procédures formalisées" placed above a giant "60%" — the figure appears twice.

NEVER: dark or saturated backgrounds; garish gradients or neon; glossy generic 3D, chrome, glass, lens flares; photorealistic humans, faces, hands, stock photos; circuit boards, glowing neural networks, robots, holograms; emojis; watermarks or "AI generated" mentions; more than ~6 visible words (12 for workflow/diagram infographics); descriptive sentences, paragraphs, taglines or footnotes of any kind; hard shadows or outer glow; blue/green/purple/pink (except an official partner logo reproduced as-is); chaotic AI-slop aesthetics. The reference is premium editorial print (The Economist, Anthropic brand), not AI illustration.
`;

// Style core pour les archétypes SANS image de référence de style: seule
// l'image du logo Charlie est fournie en entrée (image 1). L'ADN visuel est
// donc décrit intégralement en mots.
const STYLE_CORE_SOLO = `
INPUT IMAGE:
- Image 1 is the official Charlie logo. COPY IT PIXEL-FAITHFULLY, as if composited into the layout — small, flat black, in the top-left corner: exact glyph shapes, exact proportions. Never redraw, restyle, recolor, distort or reinterpret it — not even "close": a redrawn or approximated logo makes the whole image unusable.
- Any FURTHER input image is a logo or illustration supplied by the user: reproduce it EXACTLY as provided (same shapes, same colors, same proportions), like a pasted asset. Never redesign, stylize, recolor to the brand palette, or approximate it.

CHARLIE VISUAL DNA (non-negotiable):
- Background: warm cream paper (#F7F3EC, may drift to pale peach #F2E4DA in subtle radial corners), fine uniform paper-grain texture. Never dark, never pure white, never busy.
- Ink: soft near-black (#1A1A1A), never pure #000.
- Accent: brick orange / terracotta (#C05A2E to #E07020). Warm taupe (#CFC5B8) as secondary neutral.
- Maximum 3 active colors per image (cream + black + one orange). Signal red (#D9251C) reserved only for a crossing-out X.
- Headline typography: high-contrast editorial serif (Tiempos / GT Sedona / Freight Display style). Labels/captions: neutral grotesque sans-serif (Inter / Helvetica), often uppercase, wide letter-spacing.
- Minimalism: at least 65% of the canvas is empty cream. Generous constant margins (8-10% each side). One single idea per image.
- All rendered text is in FRENCH with flawless spelling and accents, razor-sharp and legible.
- TEXT SOBRIETY (critical): keep on-image text to the absolute minimum — the visual carries the message. NO descriptive sentence, NO tagline, NO footnote, NO redundant subtitle.
- NO DUPLICATION (critical): the same word, number or label NEVER appears twice on the image. If the main visual element already shows an information, no title, label or caption may repeat it. Example of failure to avoid: a headline "60% sans procédures formalisées" above a giant "60%".

NEVER: dark or saturated backgrounds; garish gradients or neon; glossy generic 3D, chrome, glass, lens flares; photorealistic humans, faces, hands, stock photos; circuit boards, glowing neural networks, robots, holograms; emojis; watermarks or "AI generated" mentions; more than ~6 visible words (12 for checklist/timeline layouts); descriptive sentences, paragraphs, taglines or footnotes; hard shadows or outer glow; blue/green/purple/pink (except an official partner logo reproduced as-is); chaotic AI-slop aesthetics. The reference is premium editorial print (The Economist, Anthropic brand), not AI illustration.
`;

function titleSpec(brief: ImageBrief): string {
  if (!brief.titre) {
    return `TITLE: extract a punchy French title (6 words max) from the CONTENT below and display it in the layout's title position.`;
  }
  const orange =
    brief.mots_orange && brief.mots_orange.length > 0
      ? ` Render these exact words of the title in brick orange (#C05A2E): ${brief.mots_orange
          .map((w) => `"${w}"`)
          .join(', ')}; all other words in near-black.`
      : '';
  const sub = brief.sous_ligne
    ? `\nSUBTITLE (smaller, discreet, below the title): "${brief.sous_ligne}"`
    : '';
  return `TITLE TO DISPLAY: "${brief.titre}".${orange}${sub}
If any word or figure of this title is already rendered as the main visual element of the layout (giant number, quote, split labels...), OMIT it from the title instead of repeating it.`;
}

const ARCHETYPE_TEMPLATES: Record<string, (brief: ImageBrief) => string> = {
  // ref-01 — logo Charlie | logo concurrent barré d'une croix rouge
  versus: (brief) => `
${STYLE_CORE}
ARCHETYPE — VERSUS (bold comparative announcement), like the reference image.

Split composition on plain cream background. Left half: the Charlie logo (image 1, as-is, flat black). Right half: the other product/company logo, both optically the same height, vertically centered on the horizontal midline. Between them: a single thin vertical black line, centered, about 40% of image height.

Over the right-hand logo, draw a large bold red X (#D9251C): two thick, slightly hand-drawn marker strokes extending beyond the logo edges. The Charlie logo stays untouched. Below the crossed-out logo, its product name in bold black grotesque sans-serif.

CONTENT: ${brief.contenu}
${brief.titre ? titleSpec(brief) : 'No headline: the two logos ARE the message.'}
`,

  // ref-02 — logo Charlie | logo partenaire, ultra épuré
  partenariat: (brief) => `
${STYLE_CORE}
ARCHETYPE — PARTNERSHIP (co-branding lockup), like the reference image.

Extremely clean split composition on plain cream background. Left half: the Charlie logo (image 1, as-is). Right half: the partner logo reproduced accurately in its official colors. Both optically the same height, vertically centered. Between them: a single thin vertical black line, centered, about 40% of image height. No cross, no extra decoration.

CONTENT: ${brief.contenu}
${brief.titre ? titleSpec(brief) : 'No headline: the two logos ARE the message.'}
`,

  // ref-03 — infographie workflow N étapes
  workflow: (brief) => `
${STYLE_CORE}
ARCHETYPE — WORKFLOW INFOGRAPHIC (pedagogical steps), like the reference image.

Cream-to-pale-peach background with paper grain. The Charlie "C" monogram from image 1, small, flat black, in the top-left corner. Centered near the top: the headline in uppercase editorial serif on one or two short lines. Below it, a thin short horizontal divider. No subtitle, no description text.

Lower half: a horizontal left-to-right flow of flat solid terracotta (#C05A2E) pictogram icons, rounded modern style, one per step, connected by thin terracotta arrows. Use 3 to 4 steps MAXIMUM. Below the icons, a thin baseline with filled terracotta circles numbered in white, one per step. Under each number, a very short step label (1-3 words only) in bold uppercase sans-serif, dark brown-black, evenly spaced. No sentences, no sub-labels, no paragraphs anywhere.

${titleSpec(brief)}
STEPS (3-4 max, each a 1-3 word label — ignore any extra): ${brief.contenu}
`,

  // ref-04 — diagramme produit hub & flux
  diagramme_produit: (brief) => `
${STYLE_CORE}
ARCHETYPE — PRODUCT DIAGRAM (hub and flow), like the reference image.

Pale rosy-cream background. Top, centered: the Charlie logo (image 1, as-is), then the headline in large editorial serif on one or two short lines (final key word in italic orange). No kicker line, no subtitle, no description sentence.

Lower half: a left-to-right flow diagram — 2 to 3 small white rounded chips with soft shadows (input sources, 1-2 word labels) connected by dotted gray lines to a central terracotta circular hub containing the white Charlie "C" monogram, ringed by thin concentric circles; then an orange arrow to a dark-terracotta capsule holding only 2-3 words of white text (never a sentence); then thin lines fanning out to 2-3 white output chips (1-2 word labels). Optional single row of short phase labels in uppercase letter-spaced sans-serif. Keep it airy — no paragraphs, no full sentences anywhere.

${titleSpec(brief)}
DIAGRAM CONTENT (keep every label to 1-3 words, capsule to 2-3 words, no sentences): ${brief.contenu}
`,

  // ref-05 — mockup iPhone vertical
  mockup_iphone: (brief) => `
${STYLE_CORE}
ARCHETYPE — IPHONE MOCKUP (embodied product, vertical), like the reference image.

Cream background. A minimalist black-outlined iPhone (thick black contour, notch, very rounded corners) centered, taking about 80% of the height. The screen shows the SAME cream as the background. Stacked and centered inside the screen: the requested wordmark/text elements, the large black Charlie "C" monogram from image 1 as centerpiece, and a single thin hand-drawn wavy black line crossing the screen like a signature thread. Tagline at the bottom of the screen.

${titleSpec(brief)}
SCREEN CONTENT: ${brief.contenu}
`,

  // ref-06 — bar chart éditorial before/after
  bar_chart: (brief) => `
${STYLE_CORE}
ARCHETYPE — EDITORIAL BAR CHART (The Economist / FT style), like the reference image.

Cream background (#F5F0E5). The Charlie "C" monogram from image 1, small, flat black, in the top-left corner. Giant centered serif headline in black. A compact square-bullet legend with two short labels only. Very discreet dotted horizontal gridlines. Flat bars (2 to 3 categories max): vivid orange (#E07020) for the first series vs warm taupe (#CFC5B8) for the second, with the value in serif above each bar. Short category labels in serif under the axis. NOTHING ELSE: no subtitle, no chart-title line, no Y-axis title, no change/delta annotation, no footnote, no caption.

${titleSpec(brief)}
CHART DATA (render only these bars, their values and short labels — no extra text): ${brief.contenu}
`,

  // ref-07 — carte typographique géante
  typo_geante: (brief) => `
${STYLE_CORE}
ARCHETYPE — GIANT TYPE CARD (major announcement), like the reference image.

Warm sand-beige background (#E5DCC8) with a soft vertical gradient toward light cream at the bottom. Top-left corner: the Charlie logo (image 1, as-is), small. The announcement name in ENORMOUS uppercase display letters (geometric, slightly techno/squarish) filling most of the width, filled with a restrained terracotta-to-peach gradient (#C05A2E to #E8A87C), sitting on a slightly lighter translucent rectangular panel. Around the edges only: a few thin white decorative geometric elements (concentric arc circles, a small arrow, thin vertical bars, corner brackets) — sparse, never overlapping the title.

${titleSpec(brief)}
DISPLAY NAME AND DETAILS: ${brief.contenu}
`,

  // ref-08 — icône 3D mate centrée, style keynote
  icone_3d: (brief) => `
${STYLE_CORE}
ARCHETYPE — CENTERED 3D ICON (Apple-keynote product launch), like the reference image.

Very pale warm peach-cream background (#F8E8DC), perfectly clean. Center: a single app-style 3D squircle icon in matte terracotta orange (#D96C1F), soft clay-like matte material (NOT glossy), subtle bevels, containing a simple white pictogram in gentle relief. One soft short drop shadow beneath it. Below the icon, centered: the product name in very large bold black grotesque sans-serif. The Charlie logo (image 1, as-is), small and discreet, in the top-left corner. Nothing else — maximum emptiness.

${titleSpec(brief)}
ICON PICTOGRAM AND NAME: ${brief.contenu}
`,

  // Un seul chiffre-clé géant qui remplit la carte
  chiffre_cle: (brief) => `
${STYLE_CORE_SOLO}
ARCHETYPE — GIANT KEY FIGURE (one striking number).

Clean cream background. ONE huge number/metric centered, filling most of the width, in massive editorial serif with a restrained terracotta-to-peach gradient (#C05A2E to #E8A87C) — e.g. "×3", "-116 min", "12 min", "241k". Directly under it, a very short label (2-4 words) in uppercase letter-spaced grotesque sans-serif, near-black. The Charlie "C" monogram from image 1, small, flat black, top-left corner. Nothing else — at least 65% empty cream.

THE FIGURE APPEARS EXACTLY ONCE (critical): the giant number is the ONLY place where this figure exists on the image. No title, headline or label may contain the same figure. BAD (real failure): headline "60% sans procédures formalisées" above a giant "60%" — the figure is duplicated. GOOD: giant "60%" with the small label "sans procédures formalisées" below, and no other text.

${titleSpec(brief)}
KEY FIGURE AND SHORT LABEL (render this number huge, the label small, the figure appears nowhere else): ${brief.contenu}
`,

  // Grande citation / punchline entre guillemets éditoriaux
  citation: (brief) => `
${STYLE_CORE_SOLO}
ARCHETYPE — EDITORIAL PULL QUOTE (a strong statement).

Clean cream background. A short punchy French sentence set as a large centered editorial serif pull-quote, one key word in brick orange (#C05A2E). A single oversized opening quotation mark (") in light taupe sits behind the top-left of the text as a graphic accent. Generous white space around. The Charlie "C" monogram from image 1, small, flat black, top-left corner. No author line, no extra text.

${titleSpec(brief)}
QUOTE TO DISPLAY (short, max ~12 words): ${brief.contenu}
`,

  // Comparaison avant / après en écran divisé
  avant_apres: (brief) => `
${STYLE_CORE_SOLO}
ARCHETYPE — BEFORE / AFTER SPLIT (transformation).

Vertical split composition. LEFT half ("AVANT"): muted warm-gray/taupe with ONE small flat line-icon conveying friction. RIGHT half ("APRÈS"): bright cream with ONE small clean terracotta flat icon, airy and ordered. Icons stay SMALL and discreet (each under ~20% of its half's area): the halves are mostly empty background, the contrast of atmosphere carries the message. A thin vertical divider between them, and small uppercase labels "AVANT" / "APRÈS" in grotesque sans-serif at the top of each half.

EACH SIDE HAS EXACTLY ONE SHORT LABEL, RENDERED ONCE (critical): one label under the left icon, a DIFFERENT label under the right icon. Never render the same label twice. BAD (real failure): "Feuilles de calcul manuelles" written two times on the left half. GOOD: left "Feuilles de calcul manuelles", right "Gaps détectés en amont", each appearing once.

The Charlie "C" monogram from image 1, small, flat black, top-left corner.

${titleSpec(brief)}
BEFORE vs AFTER CONTENT (one short label + simple icon idea per side, labels must differ): ${brief.contenu}
`,

  // Checklist verticale élégante à cases cochées
  checklist: (brief) => `
${STYLE_CORE_SOLO}
ARCHETYPE — ELEGANT CHECKLIST (points to cover / done).

Clean cream background. A short vertical list (3 to 5 items) of concise French labels (2-4 words each) in near-black grotesque sans-serif, each preceded by a small filled terracotta rounded square with a white check mark. Even vertical spacing, left-aligned in the center column. A short editorial serif headline at the top. The Charlie "C" monogram from image 1, small, flat black, top-left corner. No sentences, no descriptions.

${titleSpec(brief)}
CHECKLIST ITEMS (3-5 short labels, one per line): ${brief.contenu}
`,

  // Frise chronologique horizontale
  timeline: (brief) => `
${STYLE_CORE_SOLO}
ARCHETYPE — HORIZONTAL TIMELINE (milestones / roadmap).

Clean cream background. A single thin horizontal terracotta line across the middle with 3 to 4 evenly spaced filled terracotta dots. Above or below each dot: a short date/label (1-3 words) in grotesque sans-serif, near-black, alternating above/below the line. A short editorial serif headline at the top. The Charlie "C" monogram from image 1, small, flat black, top-left corner. Airy, no paragraphs.

${titleSpec(brief)}
TIMELINE MILESTONES (3-4 short dated labels): ${brief.contenu}
`,

  // Constellation de sources officielles reliées au monogramme Charlie
  grille_sources: (brief) => `
${STYLE_CORE_SOLO}
ARCHETYPE — SOURCES CONSTELLATION (connected data sources).

Clean cream background. The Charlie "C" monogram (from image 1) as a central terracotta circular node. Around it, 4 to 6 small white rounded chips with soft shadows, each bearing ONE short source name (e.g. "Pappers", "SIRENE", "BODACC", "data.gouv", "INSEE"), connected to the center by thin dotted gray lines — a neat radial constellation. A short editorial serif headline at the top. Only the source names as text, nothing else.

${titleSpec(brief)}
SOURCE NAMES around the hub (4-6, one or two words each): ${brief.contenu}
`,
};

/**
 * Construit les prompts Gemini à partir des briefs du directeur artistique.
 * Chaque prompt garde son archétype: le serveur s'en sert pour joindre la
 * bonne image de référence à la requête Gemini.
 */
export function buildImagePrompts(briefs: ImageBrief[]): ImagePrompt[] {
  return briefs.map((brief) => {
    const template = ARCHETYPE_TEMPLATES[brief.archetype] || ARCHETYPE_TEMPLATES.typo_geante;
    return { text: template(brief), archetype: brief.archetype };
  });
}

/**
 * Fallback sans brief (si /api/image-briefs échoue): les 3 archétypes les
 * plus sobres de la DA Charlie, où Gemini extrait lui-même le titre du post.
 * Qualité moindre, génération assurée.
 */
export function generateImagePrompts(postText: string): ImagePrompt[] {
  const extract = `Read this LinkedIn post and extract ONE punchy French title (6 words max) plus the content needed for the layout:\n"${postText}"`;
  const fallbackBriefs: ImageBrief[] = [
    {
      archetype: 'typo_geante',
      titre: '',
      contenu: `${extract}\nUse the main subject/product name of the post as the giant display name.`,
    },
    {
      archetype: 'chiffre_cle',
      titre: '',
      contenu: `${extract}\nUse the single most striking figure of the post as the giant number, with a 2-4 word label. If the post has no real figure, use its shortest strong claim as a giant word instead.`,
    },
    {
      archetype: 'citation',
      titre: '',
      contenu: `${extract}\nUse the post's strongest short sentence (12 words max) as the editorial quote.`,
    },
  ];
  return buildImagePrompts(fallbackBriefs);
}
