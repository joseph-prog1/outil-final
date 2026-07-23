'use client';

import { useCallback, useEffect, useState } from 'react';

interface Template {
  step: number;
  name: string;
  delay_days: number;
  subject: string;
  body: string;
}

interface Persona {
  key: string;
  label: string;
  label_pluriel: string;
  accroche: string;
  cas_usage: string;
  fonctionnalite: string;
  objection: string;
  sujet_court: string;
  probleme: string;
}

const PERSONA_FIELDS: Array<[keyof Persona, string]> = [
  ['label', 'Nom affiché'],
  ['label_pluriel', 'Pluriel (« les … »)'],
  ['accroche', 'Accroche (email 1)'],
  ['cas_usage', 'Cas d’usage (email 1)'],
  ['fonctionnalite', 'Fonctionnalité (email 2)'],
  ['probleme', 'Problème (email 3)'],
  ['objection', 'Objection + réponse (email 3)'],
  ['sujet_court', 'Sujet court (email 4)'],
];

export default function SequencesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activeStep, setActiveStep] = useState(1);
  const [activePersona, setActivePersona] = useState('cgp');
  const [preview, setPreview] = useState<{ subject: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPersonas, setShowPersonas] = useState(false);

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((data) => {
        setTemplates(data.templates || []);
        setPersonas(data.personas || []);
      });
  }, []);

  const refreshPreview = useCallback(() => {
    fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: activeStep, persona: activePersona }),
    })
      .then((r) => r.json())
      .then((data) => setPreview(data.rendered || null));
  }, [activeStep, activePersona]);

  useEffect(refreshPreview, [refreshPreview]);

  const save = async () => {
    setSaving(true);
    setMessage('');
    const res = await fetch('/api/templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates, personas }),
    });
    setSaving(false);
    setMessage(res.ok ? 'Enregistré.' : 'Erreur à l’enregistrement.');
    refreshPreview();
  };

  const template = templates.find((t) => t.step === activeStep);
  const updateTemplate = (patch: Partial<Template>) =>
    setTemplates((ts) => ts.map((t) => (t.step === activeStep ? { ...t, ...patch } : t)));
  const persona = personas.find((p) => p.key === activePersona);
  const updatePersona = (patch: Partial<Persona>) =>
    setPersonas((ps) => ps.map((p) => (p.key === activePersona ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-8 fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-2">
          {templates.map((t) => (
            <button
              key={t.step}
              onClick={() => setActiveStep(t.step)}
              className={`px-4 py-2 text-xs uppercase tracking-caps border transition ${
                activeStep === t.step
                  ? 'bg-forest text-cream border-forest'
                  : 'border-line text-forest hover:border-forest'
              }`}
            >
              Email {t.step} — {t.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {message && <span className="text-xs uppercase tracking-caps text-muted">{message}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="bg-forest text-cream px-6 py-2 text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {template && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Éditeur */}
          <div className="bg-paper border border-line p-6 space-y-4">
            <h3 className="font-serif text-2xl text-ink">Édition — Email {template.step}</h3>
            <Field label="Nom de l'étape">
              <input
                value={template.name}
                onChange={(e) => updateTemplate({ name: e.target.value })}
                className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
              />
            </Field>
            <Field
              label={
                template.step === 1
                  ? 'Délai (jours) — 0 = dès l’activation'
                  : `Délai (jours après l'email ${template.step - 1})`
              }
            >
              <input
                type="number"
                min={0}
                value={template.delay_days}
                onChange={(e) => updateTemplate({ delay_days: Number(e.target.value) })}
                className="w-28 border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
              />
            </Field>
            <Field label="Objet — vide = « Re: » du premier email (même fil de discussion)">
              <input
                value={template.subject}
                onChange={(e) => updateTemplate({ subject: e.target.value })}
                placeholder="Re: (suite du fil)"
                className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
              />
            </Field>
            <Field label="Corps de l'email">
              <textarea
                value={template.body}
                onChange={(e) => updateTemplate({ body: e.target.value })}
                rows={16}
                className="w-full border border-line bg-cream px-3 py-2 text-sm font-mono focus:outline-none focus:border-forest"
              />
            </Field>
            <p className="text-xs text-muted leading-relaxed">
              Variables : {'{{prenom}}'}, {'{{nom}}'}, {'{{metier}}'}, {'{{source_theme}}'}, {'{{calendly}}'},{' '}
              {'{{expediteur}}'} — et par persona : {'{{label_pluriel}}'}, {'{{accroche}}'}, {'{{cas_usage}}'},{' '}
              {'{{fonctionnalite}}'}, {'{{probleme}}'}, {'{{objection}}'}, {'{{sujet_court}}'}.
            </p>
          </div>

          {/* Aperçu */}
          <div className="bg-paper border border-line p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-2xl text-ink">Aperçu</h3>
              <select
                value={activePersona}
                onChange={(e) => setActivePersona(e.target.value)}
                className="border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
              >
                {personas.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            {preview ? (
              <div className="border border-line bg-cream">
                <div className="border-b border-line px-4 py-3">
                  <span className="text-xs uppercase tracking-caps text-muted">Objet</span>
                  <p className="text-sm mt-1 font-medium">{preview.subject}</p>
                </div>
                <div className="px-4 py-4 text-sm whitespace-pre-wrap leading-relaxed">{preview.text}</div>
              </div>
            ) : (
              <p className="text-sm text-muted">Aperçu indisponible.</p>
            )}
            <p className="text-xs text-muted">
              L’aperçu utilise un contact fictif (Marie Durand) avec le persona sélectionné. Enregistrez pour voir vos
              modifications.
            </p>
          </div>
        </div>
      )}

      {/* Personas */}
      <div className="bg-paper border border-line p-6">
        <button
          onClick={() => setShowPersonas((v) => !v)}
          className="flex items-center gap-3 font-serif text-2xl text-ink"
        >
          Personas — contenus par métier
          <span className="text-xs uppercase tracking-caps text-muted">{showPersonas ? 'masquer' : 'afficher'}</span>
        </button>
        {showPersonas && persona && (
          <div className="mt-6 space-y-4">
            <div className="flex gap-2 flex-wrap">
              {personas.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setActivePersona(p.key)}
                  className={`px-4 py-2 text-xs uppercase tracking-caps border transition ${
                    activePersona === p.key
                      ? 'bg-forest text-cream border-forest'
                      : 'border-line text-forest hover:border-forest'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PERSONA_FIELDS.map(([field, label]) => (
                <Field key={field} label={label}>
                  <textarea
                    value={persona[field] || ''}
                    onChange={(e) => updatePersona({ [field]: e.target.value })}
                    rows={field === 'label' || field === 'label_pluriel' || field === 'sujet_court' ? 1 : 3}
                    className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
                  />
                </Field>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-caps text-muted block mb-1">{label}</span>
      {children}
    </label>
  );
}
