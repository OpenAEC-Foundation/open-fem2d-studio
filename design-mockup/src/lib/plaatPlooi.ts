import { isAsgelijndeRechthoek, type Node, type Plate } from "../components/fem/femTypes";

/** Expliciete mm-invoer, decimale komma of punt; geen eenheden of groepering. */
export function parsePlooiLengthMm(text: string): number | null {
  const raw = text.trim();
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw)) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Het veld is in deze versie de volledige plaat. De maten mogen geen fictieve steunlijnen introduceren. */
export function plaatPlooiGeometrieFout(p: Plate, nodes?: readonly Pick<Node, "id" | "x" | "z">[]): string | undefined {
  if (!p.plooi) return undefined;
  if (p.openingen?.length) return "openingen zijn niet ondersteund bij plaatplooi";
  const punten = p.nodeIds.map(id => nodes?.find(n => n.id === id));
  if (punten.length !== 4 || punten.some(n => !n || !Number.isFinite(n.x) || !Number.isFinite(n.z))) {
    return "plaatplooi vraagt vier bekende hoekknopen van het volledige veld";
  }
  const hoeken = punten as Pick<Node, "id" | "x" | "z">[];
  if (!isAsgelijndeRechthoek(hoeken, 1e-7)) return "plaatplooi ondersteunt alleen een asgelijnde rechthoek";
  if (hoeken.some((p, i) => {
    const q = hoeken[(i + 1) % 4];
    return Math.abs(p.x - q.x) > 1e-7 && Math.abs(p.z - q.z) > 1e-7;
  })) return "plaatplooi vraagt hoekknopen in omtrekvolgorde, zonder kruisende randen";
  const a = Math.max(...hoeken.map(n => n.x)) - Math.min(...hoeken.map(n => n.x));
  const b = Math.max(...hoeken.map(n => n.z)) - Math.min(...hoeken.map(n => n.z));
  if (Math.abs(a - p.plooi.a_mm) > 1e-7 || Math.abs(b - p.plooi.b_mm) > 1e-7) {
    return "a_mm en b_mm moeten overeenkomen met de volledige plaat in x en z; deelvelden of aangenomen tussensteunen zijn niet ondersteund";
  }
  if ((p.E !== undefined && p.E !== 210000) || (p.nu !== undefined && p.nu !== 0.3)) {
    return "plaatplooi ondersteunt geen overschreven E of nu (vereist 210000 N/mm² en 0,3)";
  }
  return undefined;
}
