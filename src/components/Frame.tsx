import type { ReactNode } from 'react';

/**
 * Health's page: the app bar (left out of print) over the main column, and whatever floats over it
 * (dialogs, the toast). One layout for the app, the opening placeholder and the plain notes, so
 * nothing moves when one replaces another.
 */
export function Frame({ header, main, children }: { header: ReactNode; main: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased print:bg-white">
      <div className="print:hidden">{header}</div>
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6 print:p-0">{main}</main>
      {children}
    </div>
  );
}
