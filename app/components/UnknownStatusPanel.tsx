"use client";

/**
 * Noeytralt panel naar backend sender en status frontend ikke kjenner
 * (2c-2). Pollingen er allerede stoppet — aldri evig polling, aldri roed feil.
 */
export function UnknownStatusPanel() {
  return (
    <div className="bg-neutral-bg text-neutral-fg rounded-button p-4 text-sm space-y-2">
      <p className="font-medium">
        Ukjent status fra serveren
      </p>
    </div>
  );
}
