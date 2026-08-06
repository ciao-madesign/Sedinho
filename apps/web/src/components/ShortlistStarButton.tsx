/** Toggle "obiettivo d'asta": stella piena se il giocatore è già in shortlist, vuota
 * altrimenti. Stesso stile a icona unicode già usato per gli altri controlli minimi dell'app
 * (es. "✕" per rimuovere un inserimento asta), niente libreria di icone da aggiungere. */
export function ShortlistStarButton({
  active,
  onToggle,
  title,
}: {
  active: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      title={title ?? (active ? "Rimuovi dagli obiettivi" : "Aggiungi agli obiettivi")}
      className={`shrink-0 text-base leading-none transition-colors ${
        active ? "text-amber-400 hover:text-amber-300" : "text-slate-700 hover:text-amber-400"
      }`}
    >
      {active ? "★" : "☆"}
    </button>
  );
}
