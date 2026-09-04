/** Getalopmaak voor de profieleditor: Nederlands, met smalle spatie als duizendtalscheider. */

/** Vaste decimalen, duizendtallen gegroepeerd: 251688299 → "251 688 299". */
export function fmtGroep(v: number, decimalen = 0): string {
  if (!Number.isFinite(v)) return "—";
  const vast = Math.abs(v).toFixed(decimalen);
  const [heel, frac] = vast.split(".");
  const gegroepeerd = heel.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const teken = v < 0 ? "−" : "";
  return frac ? `${teken}${gegroepeerd},${frac}` : `${teken}${gegroepeerd}`;
}

/** Maat in mm: geheel waar mogelijk, anders één of twee decimalen. */
export function fmtMaat(v: number, maxDecimalen = 1): string {
  if (!Number.isFinite(v)) return "—";
  const f = 10 ** maxDecimalen;
  const afgerond = Math.round(v * f) / f;
  if (Number.isInteger(afgerond)) return fmtGroep(afgerond, 0);
  return fmtGroep(afgerond, maxDecimalen);
}

/** Grote grootheid met een macht van tien, bijvoorbeeld "83,56 ×10⁶". */
export function fmtMacht(v: number, exponent: number, decimalen = 2): string {
  if (!Number.isFinite(v)) return "—";
  const sup = String(exponent)
    .split("")
    .map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(c)] ?? c)
    .join("");
  return `${fmtGroep(v / 10 ** exponent, decimalen)} ×10${sup}`;
}

/** Getal uit een invoerveld: komma of punt, leeg → NaN. */
export function leesGetal(s: string): number {
  const t = s.trim().replace(",", ".");
  if (t === "" || t === "-" || t === ".") return NaN;
  return Number(t);
}
