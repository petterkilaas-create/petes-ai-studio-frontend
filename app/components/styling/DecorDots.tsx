/**
 * Prikker for pynt (D-3): fylte for nivaaet, tomme for resten. Leses som
 * ett bilde med `label` (for eksempel «2 av 5»), eller er pynt naar label
 * mangler (pyntknappene, der knappeteksten sier nivaaet).
 */
export function DecorDots({ filled, of, label }: { filled: number; of: number; label?: string }) {
  const dots = Array.from({ length: of }, (_, i) => i < filled);
  return (
    <span
      {...(label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      className="inline-flex gap-1"
    >
      {dots.map((on, i) => (
        <span
          key={i}
          className={`size-2 rounded-pill ${on ? "bg-current" : "border-[1.5px] border-current opacity-50"}`}
        />
      ))}
    </span>
  );
}
