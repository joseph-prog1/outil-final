import { useState } from 'react';
import { useStyleLinter } from '../hooks/useStyleLinter';

interface Props {
  variants: [string, string, string];
}

export function StyleLinter({ variants }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const { violations, lint, clear, hasErrors } = useStyleLinter();

  const handleCheck = () => {
    lint(variants);
    setIsOpen(true);
  };

  return (
    <div className="bg-paper border border-line p-8 mb-8">
      <button
        onClick={handleCheck}
        className="px-6 py-3 border border-ink text-ink text-xs uppercase tracking-caps hover:bg-ink hover:text-cream transition"
      >
        Vérifier le style
      </button>

      {isOpen && (
        <div className="mt-6 pt-6 border-t border-line">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-serif text-xl">Résultats du linter</h3>
            <button
              onClick={() => {
                clear();
                setIsOpen(false);
              }}
              className="text-xs uppercase tracking-caps text-muted hover:text-ink"
            >
              Fermer
            </button>
          </div>

          {violations.length === 0 ? (
            <p className="text-sm text-forest">Aucune violation détectée.</p>
          ) : (
            <div className="space-y-3">
              {violations.map((v, i) => (
                <div
                  key={i}
                  className={`p-4 border text-sm ${
                    v.severity === 'error'
                      ? 'border-red-300 text-red-800'
                      : 'border-line text-ink/80'
                  }`}
                >
                  <div className="font-medium">{v.message}</div>
                  {v.fix && <div className="text-xs text-muted mt-1">{v.fix}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
