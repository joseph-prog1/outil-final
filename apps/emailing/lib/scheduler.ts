import { processTick } from './sequencer';

const TICK_INTERVAL_MS = 5 * 60 * 1000;

const g = globalThis as unknown as { __charlieScheduler?: ReturnType<typeof setInterval> };

// Boucle d'envoi automatique : un tick toutes les 5 minutes tant que l'app tourne.
export function ensureScheduler() {
  if (g.__charlieScheduler) return;
  g.__charlieScheduler = setInterval(() => {
    processTick().catch((err) => console.error('[scheduler] tick en échec:', err));
  }, TICK_INTERVAL_MS);
  console.log('[scheduler] démarré — un tick toutes les 5 minutes');
}
