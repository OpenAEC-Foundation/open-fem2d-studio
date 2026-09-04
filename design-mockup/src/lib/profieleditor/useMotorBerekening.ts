/**
 * useMotorBerekening — houdt de motoruitvoer bij een veranderend ontwerp.
 *
 * Elke wijziging (typen, slepen) start na een korte vertraging één aanroep
 * van de motor; een lopende aanroep wordt afgebroken zodra er nieuwere
 * invoer is. Tussen wijziging en antwoord staat `verouderd` op true, zodat
 * de eigenschappen als "wordt herberekend" getoond kunnen worden.
 */
import { useEffect, useRef, useState } from "react";
import { roepMotor, type MotorInvoer } from "./motorClient";
import type { MotorUitvoer } from "./types";

export interface MotorToestand {
  uitvoer: MotorUitvoer | null;
  /** De getoonde uitvoer hoort niet meer bij de huidige invoer. */
  verouderd: boolean;
  bezig: boolean;
  fout: string | null;
}

export function useMotorBerekening(invoer: MotorInvoer | null, vertragingMs = 200): MotorToestand {
  const [toestand, setToestand] = useState<MotorToestand>({
    uitvoer: null,
    verouderd: false,
    bezig: false,
    fout: null,
  });
  const lopend = useRef<AbortController | null>(null);
  const sleutel = invoer ? JSON.stringify(invoer) : "";

  useEffect(() => {
    if (!invoer) {
      lopend.current?.abort();
      setToestand({ uitvoer: null, verouderd: false, bezig: false, fout: null });
      return;
    }
    setToestand((t) => ({ ...t, verouderd: true }));
    const timer = window.setTimeout(() => {
      lopend.current?.abort();
      const ctrl = new AbortController();
      lopend.current = ctrl;
      setToestand((t) => ({ ...t, bezig: true }));
      roepMotor([invoer], ctrl.signal)
        .then((uit) => {
          if (ctrl.signal.aborted) return;
          setToestand({ uitvoer: uit[0] ?? null, verouderd: false, bezig: false, fout: null });
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setToestand((t) => ({
            uitvoer: t.uitvoer,
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
