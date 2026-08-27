/**
 * Formate une date relative (aujourd'hui → heure, hier → "Hier", etc.)
 */
export function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    // Aujourd'hui → juste l'heure
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (days === 1) {
    return 'Hier';
  }

  if (days < 7) {
    return date.toLocaleDateString('fr-FR', { weekday: 'long' });
  }

  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Formate la durée d'un appel ou d'une note vocale
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Tronque le texte d'un message pour l'aperçu dans un reply
 */
export function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}
