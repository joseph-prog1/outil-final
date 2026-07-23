import { useState } from 'react';
import type { LeadMagnetDraft } from '../types/index';

// Aperçu éditable du lead magnet avant publication: chaque champ se modifie
// directement, puis "Pousser sur Notion" envoie la version relue.
// Représentation d'édition: paragraphes séparés par une ligne vide,
// une puce par ligne.

interface SectionForm {
  titre: string;
  paragraphesText: string;
  pucesText: string;
}

interface FormState {
  format: string;
  titre: string;
  accroche: string;
  sections: SectionForm[];
  conclusion: string;
  charlie_pitch: string;
}

function draftToForm(draft: LeadMagnetDraft): FormState {
  return {
    format: draft.format,
    titre: draft.titre,
    accroche: draft.accroche,
    sections: draft.sections.map((s) => ({
      titre: s.titre,
      paragraphesText: s.paragraphes.join('\n\n'),
      pucesText: s.puces.join('\n'),
    })),
    conclusion: draft.conclusion,
    charlie_pitch: draft.charlie_pitch,
  };
}

function formToDraft(form: FormState): LeadMagnetDraft {
  return {
    format: form.format,
    titre: form.titre,
    accroche: form.accroche.trim(),
    sections: form.sections.map((s) => ({
      titre: s.titre.trim(),
      paragraphes: s.paragraphesText
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean),
      puces: s.pucesText
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean),
    })),
    conclusion: form.conclusion.trim(),
    charlie_pitch: form.charlie_pitch.trim(),
  };
}

const FORMATS = ['guide', 'checklist', 'comparatif', 'template'];

interface Props {
  draft: LeadMagnetDraft;
  onPush: (draft: LeadMagnetDraft) => Promise<void>;
  onCancel: () => void;
  isPushing: boolean;
}

export function LeadMagnetPreview({ draft, onPush, onCancel, isPushing }: Props) {
  const [form, setForm] = useState<FormState>(() => draftToForm(draft));
  const [error, setError] = useState('');

  const updateSection = (index: number, patch: Partial<SectionForm>) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  };

  const removeSection = (index: number) => {
    setForm((prev) => ({ ...prev, sections: prev.sections.filter((_, i) => i !== index) }));
  };

  const handlePush = async () => {
    if (!form.titre.trim()) {
      setError('Le titre est vide');
      return;
    }
    setError('');
    try {
      await onPush(formToDraft(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la publication');
    }
  };

  const labelClass = 'block text-xs uppercase tracking-caps text-muted mb-2';
  const inputClass =
    'w-full p-3 bg-cream/40 border border-line focus:outline-none focus:border-forest text-sm text-ink leading-relaxed';

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-start justify-center z-50 overflow-y-auto py-10 px-4">
      <div className="bg-paper border border-line max-w-3xl w-full">
        {/* En-tête */}
        <div className="p-8 border-b border-line flex items-start justify-between gap-6">
          <div>
            <h2 className="font-serif text-2xl mb-2">Aperçu du lead magnet</h2>
            <p className="text-sm text-muted leading-relaxed">
              Relisez et corrigez directement dans les champs. Rien n'est publié tant que
              vous n'avez pas cliqué sur « Pousser sur Notion ».
            </p>
          </div>
          <select
            value={form.format}
            onChange={(e) => setForm((prev) => ({ ...prev, format: e.target.value }))}
            disabled={isPushing}
            className="border border-line bg-cream/40 text-xs uppercase tracking-caps px-3 py-2"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        {/* Contenu éditable */}
        <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
          <div>
            <label className={labelClass}>Titre</label>
            <input
              type="text"
              value={form.titre}
              onChange={(e) => setForm((prev) => ({ ...prev, titre: e.target.value }))}
              disabled={isPushing}
              className={`${inputClass} font-serif text-lg`}
            />
          </div>

          <div>
            <label className={labelClass}>Accroche (encadré d'introduction)</label>
            <textarea
              value={form.accroche}
              onChange={(e) => setForm((prev) => ({ ...prev, accroche: e.target.value }))}
              disabled={isPushing}
              rows={3}
              className={inputClass}
            />
          </div>

          {form.sections.map((section, i) => (
            <div key={i} className="border border-line p-5 bg-cream/20 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs uppercase tracking-caps text-forest">
                  Section {i + 1}
                </label>
                <button
                  onClick={() => removeSection(i)}
                  disabled={isPushing}
                  className="text-xs uppercase tracking-caps text-muted hover:text-red-700"
                >
                  Supprimer la section
                </button>
              </div>
              <input
                type="text"
                value={section.titre}
                onChange={(e) => updateSection(i, { titre: e.target.value })}
                disabled={isPushing}
                placeholder="Titre de la section"
                className={`${inputClass} font-serif`}
              />
              <div>
                <label className={labelClass}>Paragraphes — séparés par une ligne vide</label>
                <textarea
                  value={section.paragraphesText}
                  onChange={(e) => updateSection(i, { paragraphesText: e.target.value })}
                  disabled={isPushing}
                  rows={Math.min(10, Math.max(3, section.paragraphesText.split('\n').length + 1))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Puces — une par ligne</label>
                <textarea
                  value={section.pucesText}
                  onChange={(e) => updateSection(i, { pucesText: e.target.value })}
                  disabled={isPushing}
                  rows={Math.min(10, Math.max(2, section.pucesText.split('\n').length + 1))}
                  className={inputClass}
                />
              </div>
            </div>
          ))}

          <div>
            <label className={labelClass}>Conclusion</label>
            <textarea
              value={form.conclusion}
              onChange={(e) => setForm((prev) => ({ ...prev, conclusion: e.target.value }))}
              disabled={isPushing}
              rows={3}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Ce que Charlie automatise (pitch final)</label>
            <textarea
              value={form.charlie_pitch}
              onChange={(e) => setForm((prev) => ({ ...prev, charlie_pitch: e.target.value }))}
              disabled={isPushing}
              rows={4}
              className={inputClass}
            />
            <p className="text-xs text-muted mt-2">
              Le bloc contact (Thomas Higadere — thomas.financee@gmail.com) est ajouté
              automatiquement à la publication.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-line flex items-center gap-4">
          {error && <p className="text-sm text-red-800 flex-1">{error}</p>}
          <button
            onClick={onCancel}
            disabled={isPushing}
            className="ml-auto px-6 py-3 border border-ink text-ink text-xs uppercase tracking-caps hover:bg-ink hover:text-cream transition disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handlePush}
            disabled={isPushing || !form.titre.trim()}
            className="px-6 py-3 bg-forest text-cream text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-50"
          >
            {isPushing ? 'Publication…' : 'Pousser sur Notion'}
          </button>
        </div>
      </div>
    </div>
  );
}
