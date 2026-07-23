'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

// Variables insérables, groupées et colorées par catégorie.
interface VarItem {
  token: string;
  label: string;
}
interface VarGroup {
  group: string;
  color: string;
  items: VarItem[];
}
const VARIABLES: VarGroup[] = [
  {
    group: 'Contact',
    color: '#1A3D2A',
    items: [
      { token: '{{prenom}}', label: 'Prénom' },
      { token: '{{nom}}', label: 'Nom' },
      { token: '{{email}}', label: 'Email' },
      { token: '{{metier}}', label: 'Métier' },
      { token: '{{source_theme}}', label: 'Thème du guide' },
    ],
  },
  {
    group: 'Persona (par métier)',
    color: '#B7791F',
    items: [
      { token: '{{label_pluriel}}', label: 'Métier au pluriel' },
      { token: '{{accroche}}', label: 'Accroche' },
      { token: '{{cas_usage}}', label: 'Cas d’usage' },
      { token: '{{fonctionnalite}}', label: 'Fonctionnalité' },
      { token: '{{probleme}}', label: 'Problème' },
      { token: '{{objection}}', label: 'Objection' },
      { token: '{{sujet_court}}', label: 'Sujet court' },
    ],
  },
  {
    group: 'Campagne',
    color: '#0C2A1B',
    items: [
      { token: '{{calendly}}', label: 'Lien Calendly' },
      { token: '{{expediteur}}', label: 'Expéditeur' },
    ],
  },
];

type FieldName = 'subject' | 'body';

export default function SequencesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activeStep, setActiveStep] = useState(1);
  const [activePersona, setActivePersona] = useState('cgp');
  const [preview, setPreview] = useState<{ subject: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPersonas, setShowPersonas] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const activeField = useRef<FieldName>('body');
  // Position du curseur à restaurer après insertion (appliquée en useLayoutEffect).
  const pendingCaret = useRef<{ field: FieldName; pos: number } | null>(null);

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

  // Restaure le curseur juste après le token inséré, une fois le DOM mis à jour.
  useLayoutEffect(() => {
    const pending = pendingCaret.current;
    if (!pending) return;
    const el = pending.field === 'subject' ? subjectRef.current : bodyRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(pending.pos, pending.pos);
    }
    pendingCaret.current = null;
  });

  const insertInto = (field: FieldName, start: number, end: number, token: string) => {
    if (!template) return;
    const value = field === 'subject' ? template.subject : template.body;
    const next = value.slice(0, start) + token + value.slice(end);
    updateTemplate({ [field]: next });
    pendingCaret.current = { field, pos: start + token.length };
  };

  // Clic sur une variable : insère au curseur du dernier champ actif.
  const insertToken = (token: string) => {
    const field = activeField.current;
    const el = field === 'subject' ? subjectRef.current : bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    insertInto(field, start, end, token);
  };

  // Glisser-déposer : insère à l'endroit du curseur au moment du drop.
  const handleDrop = (field: FieldName) => (e: React.DragEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const pos = el.selectionStart ?? el.value.length;
    const token = e.dataTransfer.getData('text/plain');
    e.preventDefault();
    if (token) insertInto(field, pos, pos, token);
  };
  const allowDrop = (e: React.DragEvent) => e.preventDefault();

  return (
    <div className="space-y-8 fade-in">
      {/* En-tête + enregistrer */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-serif text-3xl text-ink">Séquence d’emails</h2>
          <p className="text-sm text-muted mt-1 max-w-xl">
            Une séquence, c’est une suite d’emails de relance envoyés automatiquement. Choisissez l’email à
            rédiger, composez-le, et insérez les variables depuis le panneau de droite.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && <span className="text-xs uppercase tracking-caps text-muted">{message}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="bg-forest text-cream px-6 py-3 text-xs uppercase tracking-caps hover:bg-forest-soft transition disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer la séquence'}
          </button>
        </div>
      </div>

      {/* Sélecteur d'email de la séquence */}
      <div className="flex gap-2 flex-wrap">
        {templates.map((t) => (
          <button
            key={t.step}
            onClick={() => setActiveStep(t.step)}
            className={`px-4 py-3 text-left border transition ${
              activeStep === t.step
                ? 'bg-forest text-cream border-forest'
                : 'border-line text-forest hover:border-forest bg-paper'
            }`}
          >
            <span className="block text-[10px] uppercase tracking-caps opacity-70">
              Email {t.step} · {t.delay_days === 0 ? 'immédiat' : `J+${cumulativeDelay(templates, t.step)}`}
            </span>
            <span className="block text-sm mt-0.5">{t.name || '-'}</span>
          </button>
        ))}
      </div>

      {template && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Éditeur */}
          <div className="lg:col-span-2 bg-paper border border-line p-6 space-y-4">
            <Field label="Titre de l’email (interne, pour vous repérer)">
              <input
                value={template.name}
                onChange={(e) => updateTemplate({ name: e.target.value })}
                placeholder="Ex. Découverte, Relance, Dernière opportunité…"
                className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
              />
            </Field>

            <Field
              label={
                template.step === 1
                  ? 'Délai avant envoi (jours) : 0 = dès l’activation'
                  : `Délai après l’email ${template.step - 1} (jours)`
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

            <Field label="Objet de l’email : vide = « Re: » du 1ᵉʳ email (même fil de discussion)">
              <input
                ref={subjectRef}
                value={template.subject}
                onChange={(e) => updateTemplate({ subject: e.target.value })}
                onFocus={() => (activeField.current = 'subject')}
                onDrop={handleDrop('subject')}
                onDragOver={allowDrop}
                placeholder="Re: (suite du fil)"
                className="w-full border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:border-forest"
              />
            </Field>

            <Field label="Corps de l’email">
              <textarea
                ref={bodyRef}
                value={template.body}
                onChange={(e) => updateTemplate({ body: e.target.value })}
                onFocus={() => (activeField.current = 'body')}
                onDrop={handleDrop('body')}
                onDragOver={allowDrop}
                rows={18}
                className="w-full border border-line bg-cream px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:border-forest"
              />
            </Field>
          </div>

          {/* Panneau de variables */}
          <div className="bg-paper border border-line p-6 space-y-6 self-start lg:sticky lg:top-4">
            <div>
              <h3 className="font-serif text-2xl text-ink">Variables</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Cliquez pour insérer là où se trouve votre curseur, ou glissez-déposez le bloc directement dans le
                texte.
              </p>
            </div>

            {VARIABLES.map((g) => (
              <div key={g.group}>
                <div className="text-[10px] uppercase tracking-caps text-muted mb-2">{g.group}</div>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((v) => (
                    <button
                      key={v.token}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', v.token);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => insertToken(v.token)}
                      title={`Insérer ${v.token}`}
                      className="group cursor-grab active:cursor-grabbing border px-2.5 py-1.5 text-left transition hover:shadow-sm"
                      style={{ borderColor: g.color, backgroundColor: `${g.color}0F` }}
                    >
                      <span className="block text-xs font-medium" style={{ color: g.color }}>
                        {v.label}
                      </span>
                      <span className="block text-[10px] font-mono text-muted">{v.token}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aperçu */}
      {template && (
        <div className="bg-paper border border-line p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
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
            L’aperçu utilise un contact fictif (Marie Durand) avec le persona sélectionné. Enregistrez pour
            actualiser après vos modifications.
          </p>
        </div>
      )}

      {/* Personas, repliable */}
      <div className="bg-paper border border-line p-6">
        <button
          onClick={() => setShowPersonas((v) => !v)}
          className="flex items-center gap-3 font-serif text-2xl text-ink"
        >
          Personas : contenus par métier
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

// Délai cumulé depuis le début de la séquence jusqu'à l'étape donnée (pour l'affichage « J+N »).
function cumulativeDelay(templates: Template[], step: number): number {
  return templates
    .filter((t) => t.step <= step)
    .reduce((sum, t) => sum + (Number(t.delay_days) || 0), 0);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-caps text-muted block mb-1">{label}</span>
      {children}
    </label>
  );
}
