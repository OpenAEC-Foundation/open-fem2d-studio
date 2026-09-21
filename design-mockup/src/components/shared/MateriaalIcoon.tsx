import type { ReactNode } from "react";

export type MateriaalIcoonSoort = "staal" | "eigen" | "hout" | "beton" | "aluminium" | "overig";

const VORMEN: Record<MateriaalIcoonSoort, ReactNode> = {
  staal: <path d="M6 4h20v5h-7v14h7v5H6v-5h7V9H6Z" />,
  eigen: <><path d="M4 4h24v5H18v14h10v5H4v-5h8V9H4Z" /><circle cx="15" cy="16" r="2" /></>,
  hout: <><rect x="5" y="4" width="22" height="24" rx="1" /><path d="M10 4c-5 8 7 15 0 24M16 4c-7 9 8 16 0 24M22 4c-7 10 7 16 0 24" /></>,
  beton: <><rect x="5" y="3" width="22" height="26" rx="1" /><rect x="8" y="6" width="16" height="20" rx="2" /><circle cx="11" cy="9" r="1.5" fill="currentColor" stroke="none" /><circle cx="21" cy="9" r="1.5" fill="currentColor" stroke="none" /><circle cx="11" cy="23" r="1.5" fill="currentColor" stroke="none" /><circle cx="21" cy="23" r="1.5" fill="currentColor" stroke="none" /></>,
  aluminium: <><path d="M4 4h24v7h-5V9h-4v14h4v-2h5v7H4v-7h5v2h4V9H9v2H4Z" /><path d="M13 14h6m-6 4h6" /></>,
  overig: <><path d="m16 3 12 6v14l-12 6-12-6V9Zm0 12v14M4 9l12 6 12-6" /></>,
};

/** Decoratief materiaalteken; de omringende titel draagt de toegankelijke naam. */
export default function MateriaalIcoon({ soort, className }: { soort: MateriaalIcoonSoort; className?: string }) {
  return (
    <svg className={className} width="32" height="32" viewBox="0 0 32 32" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
      aria-hidden="true" focusable="false">
      {VORMEN[soort]}
    </svg>
  );
}
