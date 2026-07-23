import { useState } from 'react';

// Aperçu fidèle d'un post dans le feed LinkedIn: coupure « …voir plus »
// après ~210 caractères (comme sur desktop — c'est là que le hook se joue),
// miniature sous le texte, avatar et barre d'actions. Volontairement rendu
// en blanc/gris LinkedIn, distinct de la charte de l'app: c'est une
// simulation des conditions réelles.

interface Props {
  text: string;
  thumbnailUrl?: string | null;
}

// LinkedIn coupe tôt: ~140 caractères sur mobile (la grande majorité du
// feed) et jamais plus de 3 lignes visibles — les sauts de ligne comptent
const TRUNCATE_AT = 140;
const MAX_LINES = 3;

function truncateAtWord(text: string, limit: number): string {
  const slice = text.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');
  return lastSpace > limit * 0.6 ? slice.slice(0, lastSpace) : slice;
}

// Position de coupure: 140 caractères OU la fin de la 3e ligne,
// selon ce qui arrive en premier
function cutText(text: string): string {
  let lineCutIndex = text.length;
  let newlines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      newlines++;
      if (newlines >= MAX_LINES) {
        lineCutIndex = i;
        break;
      }
    }
  }
  const byChars = truncateAtWord(text, TRUNCATE_AT);
  return lineCutIndex < byChars.length ? text.slice(0, lineCutIndex).trimEnd() : byChars;
}

export function LinkedInPreview({ text, thumbnailUrl }: Props) {
  const [expanded, setExpanded] = useState(false);
  const cut = cutText(text);
  const needsTruncation = cut.length < text.length;
  const visibleText = !needsTruncation || expanded ? text : cut;

  return (
    <div className="bg-white rounded-lg border border-gray-300 overflow-hidden text-left font-sans">
      {/* En-tête du post */}
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <div className="w-12 h-12 rounded-full bg-forest flex items-center justify-center flex-shrink-0">
          <span className="font-serif text-cream text-xl">C</span>
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-gray-900 truncate">Charlie</p>
          <p className="text-xs text-gray-500 truncate">IA &amp; Tech pour les conseillers patrimoniaux</p>
          <p className="text-xs text-gray-500">1 h</p>
        </div>
      </div>

      {/* Texte avec coupure « voir plus » */}
      <div className="px-4 pb-3 text-sm text-gray-900 leading-snug whitespace-pre-wrap break-words">
        {visibleText}
        {needsTruncation && !expanded && (
          <>
            {'… '}
            <button
              onClick={() => setExpanded(true)}
              className="text-gray-500 hover:text-blue-700 hover:underline"
            >
              voir plus
            </button>
          </>
        )}
        {needsTruncation && expanded && (
          <>
            {' '}
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-500 hover:text-blue-700 hover:underline"
            >
              voir moins
            </button>
          </>
        )}
      </div>

      {/* Miniature */}
      {thumbnailUrl && (
        <img src={thumbnailUrl} alt="Miniature du post" className="w-full h-auto border-t border-gray-200" />
      )}

      {/* Réactions + actions */}
      <div className="px-4 py-1.5 flex justify-between text-xs text-gray-500 border-b border-gray-200">
        <span>Vous et 47 autres personnes</span>
        <span>12 commentaires</span>
      </div>
      <div className="px-2 py-1 flex justify-around text-xs font-semibold text-gray-600">
        <span className="px-3 py-2">J'aime</span>
        <span className="px-3 py-2">Commenter</span>
        <span className="px-3 py-2">Republier</span>
        <span className="px-3 py-2">Envoyer</span>
      </div>
    </div>
  );
}
