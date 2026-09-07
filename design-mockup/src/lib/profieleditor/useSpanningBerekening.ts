/**
 * useSpanningBerekening — houdt het spanningsverloop en de lastoetsing bij een
 * veranderende doorsnede of snedekracht.
 *
 * Zelfde afspraken als `useMotorBerekening`: elke wijziging start na een korte
 * vertraging één aanroep, een lopende aanroep wordt afgebroken, en tussen
 * wijziging en antwoord staat `verouderd` op true.
 */
import { useEffect, useRef, useState } from "react";
import { toetsLassen, toetsSpanning } from "./spanningClient";
import type { LasInput } from "../types/las/LasInput";
import type { LasResultaat } from "../types/las/LasResultaat";
import type { SpanningBeamCheckInput } from "../types/spanning/SpanningBeamCheckInput";
import type { SpanningBeamCheckResult } from "../types/spanning/SpanningBeamCheckResult";

export interface SpanningToestand {
  uitvoer: SpanningBeamCheckResult | null;
  lassen: LasResultaat[];
  verouderd: boolean;
  bezig: boolean;
  fout: string | null;
}

const LEEG: SpanningToestand = {
  uitvoer: null,
  lassen: [],
  verouderd: false,
  bezig: false,
  fout: null,
};

export function useSpanningBerekening(
  invoer: SpanningBeamCheckInput | null,
  lasInvoer: LasInput[],
  vertragingMs = 250,
): SpanningToestand {
  const [toestand, setToestand] = useState<SpanningToestand>(LEEG);
  const lopend = useRef<AbortController | null>(null);
  const sleutel = invoer ? JSON.stringify({ invoer, lasInvoer }) : "";

  useEffect(() => {
    if (!invoer) {
      lopend.current?.abort();
      setToestand(LEEG);
      return;
    }
    setToestand((t) => ({ ...t, verouderd: true }));
    const timer = window.setTimeout(() => {
      lopend.current?.abort();
      const ctrl = new AbortController();
      lopend.current = ctrl;
      setToestand((t) => ({ ...t, bezig: true }));
      Promise.all([
        toetsSpanning(invoer, ctrl.signal),
        toetsLassen(lasInvoer, ctrl.signal),
      ])
        .then(([uit, las]) => {
          if (ctrl.signal.aborted) return;
          setToestand({ uitvoer: uit, lassen: las, verouderd: false, bezig: false, fout: null });
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setToestand((t) => ({
            uitvoer: t.uitvoer,
            lassen: t.lassen,
            verouderd: true,
            bezig: false,
            fout: e instanceof Error ? e.message : String(e),
          }));
        });
    }, vertragingMs);
    return () => window.clearTimeout(timer);
    // De invoer wordt via haar JSON-sleutel vergeleken, niet op identiteit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleutel, vertragingMs]);

  return toestand;
}
