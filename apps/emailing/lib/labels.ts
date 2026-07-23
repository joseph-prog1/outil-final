export const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  active: 'En séquence',
  paused: 'En pause',
  replied: 'A répondu',
  completed: 'Séquence terminée',
  unsubscribed: 'Désinscrit',
  rdv: 'RDV pris',
  error: 'Erreur',
};

export const STATUS_COLORS: Record<string, string> = {
  pending: '#6F6A5C',
  active: '#1A3D2A',
  paused: '#B7791F',
  replied: '#B7791F',
  completed: '#0C2A1B',
  unsubscribed: '#9B2C2C',
  rdv: '#1A3D2A',
  error: '#9B2C2C',
};

export const EVENT_LABELS: Record<string, string> = {
  sent: 'Envoyé',
  open: 'Ouvert',
  click: 'Clic',
  reply: 'Réponse',
  unsubscribe: 'Désinscription',
  rdv: 'RDV',
  error: 'Erreur',
};
