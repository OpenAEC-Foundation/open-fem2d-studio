/**
 * Skyline-oplosser (profieloplosser) — LDLᵀ zonder pivotering.
 *
 * WAAROM DEZE VORM
 * ----------------
 * Een raamwerk-stijfheidsmatrix is symmetrisch en, zodra de knopen redelijk
 * genummerd zijn, bandvormig: koppelingen bestaan alleen tussen knopen die een
 * staaf delen. Bij een staaf die in veel segmenten geknipt is — het geval
 * waarvoor deze oplosser bestaat — is die band bovendien smal en constant
 * (drie vrijheidsgraden per knoop, buren gekoppeld → halve bandbreedte 5).
 *
 * Gekozen is de SKYLINE-vorm (variabele profielhoogte per rij) en niet een
 * vaste band, om één reden: de invoer is niet altijd netjes genummerd. Een
 * vaste band moet op de SLECHTSTE rij gedimensioneerd worden en degradeert dan
 * naar dicht; een skyline betaalt per rij alleen wat die rij nodig heeft. Bij
 * een strak genummerd raamwerk zijn beide identiek — de skyline verliest daar
 * dus niets — maar bij een gemengd plaat/raamwerk-model, waar de plaatknopen
 * uit de mesher komen, houdt de skyline nog winst over waar een vaste band die
 * al kwijt is. Zie `scripts/meet-oplossers.mjs` voor de meting.
 *
 * LDLᵀ ZONDER PIVOTERING: WAAROM DAT MAG
 * --------------------------------------
 * Pivoteren zou de bandstructuur juist vernietigen (rijverwisselingen halen
 * elementen buiten het profiel). Dat mag hier achterwege blijven omdat de
 * matrix symmetrisch is en de randvoorwaarden met de PENALTY-methode zijn
 * opgelegd: er worden alleen diagonaaltermen opgehoogd, rijen en kolommen
 * blijven staan. De matrix is daarmee symmetrisch positief-definiet zolang de
 * constructie stabiel is.
 *
 * Bij een tweede-orde-berekening boven de kniklast wordt K indefiniet en
 * loopt een pivot door nul. Dat is geen tekortkoming maar precies het signaal
 * dat de aanroepende laag verwacht: `NonlinearSolver` vertaalt de singuliere
 * matrix naar de knikmelding. Een negatieve pivot op zichzelf is NIET fout —
 * die telt hoeveel kritieke belastingen al gepasseerd zijn — dus alleen de
 * grootte van de pivot wordt getoetst, niet het teken.
 *
 * VEILIGHEIDSKLEP
 * ---------------
 * Blijkt de matrix niet symmetrisch (buiten de afrondmarge), dan is LDLᵀ niet
 * van toepassing en valt deze oplosser terug op de dichte Gauss-eliminatie.
 * Dat is een gemeten eigenschap van de invoer, geen aanname: de scan die het
 * profiel bepaalt meet de asymmetrie in dezelfde doorloop.
 *
 * GEHEUGEN
 * --------
 * De envelop komt NAAST de dichte matrix te staan; hij kost 8 bytes per
 * opgeslagen term, dus n·h_gem·8 bytes. Bij een bandvormig raamwerk is dat een
 * fractie van de n²·8 bytes die de dichte matrix zelf al inneemt. Bij een
 * volledig gevulde matrix zou het n²/2·8 bytes zijn — dan is de winst alleen
 * nog de factor 2 van LDLᵀ tegen Gauss en betaal je er de helft van de
 * matrixomvang aan geheugen voor. Zie het meetscript voor de gemeten h_gem.
 */

import { Matrix } from './Matrix';
import { solveLinearSystem as solveGauss } from './GaussElimination';

/** Uitkomst van de structuurscan van een stelselmatrix. */
export interface IMatrixProfile {
  /** Per rij i de laagste kolomindex met een niet-nul in de onderdriehoek (≤ i). */
  first: Int32Array;
  /** Aantal opgeslagen getallen in de onderdriehoek-envelop, diagonaal inbegrepen. */
  profileSize: number;
  /** Grootste (i − first[i]); 0 betekent een diagonaalmatrix. */
  halfBandwidth: number;
  /** Gemiddelde profielhoogte (profileSize / n) — de effectieve bandbreedte. */
  meanHeight: number;
  /** max |A(i,j) − A(j,i)| over de hele matrix. */
  maxAsymmetry: number;
  /** max |A(i,j)| over de hele matrix. */
  maxMagnitude: number;
  /** maxAsymmetry / maxMagnitude; 0 bij een exact symmetrische matrix. */
  relAsymmetry: number;
}

/**
 * Bovengrens voor de relatieve asymmetrie waarbij LDLᵀ nog wordt toegepast.
 *
 * De stijfheidsmatrix is theoretisch exact symmetrisch, maar wordt opgebouwd
 * met TᵀKT-producten waarin de sommatievolgorde per hoek verschilt. Wat
 * overblijft is afrondruis. De gemeten waarde over de hele testbatterij staat
 * in het verslag; deze grens ligt daar ruim boven en ruim onder elke
 * asymmetrie die op een echte modelleerfout zou wijzen.
 */
const ASYMMETRIE_GRENS = 1e-10;

/**
 * Pivotdrempels. De absolute drempel is gelijk aan die van de dichte oplosser
 * (`GaussElimination`), zodat de skyline-oplosser nooit LATER alarm slaat dan
 * de bestaande. De relatieve drempel vangt het geval dat de dichte oplosser
 * mist: een matrix met termen van orde 1e8 waarin een pivot naar 1e-4 zakt is
 * een mechanisme, maar haalt de absolute drempel van 1e-12 nooit.
 */
const PIVOT_ABS_DREMPEL = 1e-12;
const PIVOT_REL_DREMPEL = 1e-12;

/** Laagste gemeten |d_i| / |A_ii| sinds de laatste reset — diagnostiek. */
let laagstePivotRatio = Number.POSITIVE_INFINITY;

/** Aantal keren dat de veiligheidsklep naar Gauss is teruggevallen. */
let terugvalTeller = 0;

export function getSkylineDiagnostics(): {
  laagstePivotRatio: number;
  terugvallen: number;
} {
  return { laagstePivotRatio, terugvallen: terugvalTeller };
}

export function resetSkylineDiagnostics(): void {
  laagstePivotRatio = Number.POSITIVE_INFINITY;
  terugvalTeller = 0;
}

/**
 * Scant de matrix één keer en levert profielhoogten, bandbreedte en
 * asymmetrie. Kost O(n²) leesbewerkingen — dezelfde orde als de dichte
 * opslag zelf, en verwaarloosbaar naast de O(n³) van een dichte oplossing.
 */
export function analyzeMatrix(A: Matrix): IMatrixProfile {
  const n = A.rows;
  const first = new Int32Array(n);
  let profileSize = 0;
  let halfBandwidth = 0;
  let maxAsymmetry = 0;
  let maxMagnitude = 0;

  for (let i = 0; i < n; i++) {
    const rij = A.data[i];
    let fi = i;
    for (let j = 0; j < i; j++) {
      const onder = rij[j];
      const boven = A.data[j][i];
      if (onder !== 0 || boven !== 0) {
        if (fi === i) fi = j;
        const verschil = Math.abs(onder - boven);
        if (verschil > maxAsymmetry) maxAsymmetry = verschil;
        const m = Math.abs(onder) > Math.abs(boven) ? Math.abs(onder) : Math.abs(boven);
        if (m > maxMagnitude) maxMagnitude = m;
      }
    }
    const diag = Math.abs(rij[i]);
    if (diag > maxMagnitude) maxMagnitude = diag;
    first[i] = fi;
    profileSize += i - fi + 1;
    if (i - fi > halfBandwidth) halfBandwidth = i - fi;
  }

  return {
    first,
    profileSize,
    halfBandwidth,
    meanHeight: n > 0 ? profileSize / n : 0,
    maxAsymmetry,
    maxMagnitude,
    relAsymmetry: maxMagnitude > 0 ? maxAsymmetry / maxMagnitude : 0,
  };
}

/**
 * Lost A·x = b op met een skyline-LDLᵀ-ontbinding.
 *
 * Dezelfde handtekening en hetzelfde foutgedrag als
 * `GaussElimination.solveLinearSystem`, inclusief de tekst van de
 * singulariteitsmelding — `NonlinearSolver` leest daar de kolomindex uit om er
 * een knoop- en richtingsaanduiding bij te zoeken.
 */
export function solveSkyline(A: Matrix, b: number[]): number[] {
  const n = A.rows;

  if (A.rows !== A.cols) {
    throw new Error('Matrix must be square');
  }
  if (b.length !== n) {
    throw new Error('Vector length must match matrix size');
  }
  if (n === 0) return [];

  const profiel = analyzeMatrix(A);

  // Veiligheidsklep: geen symmetrie → geen LDLᵀ.
  if (profiel.relAsymmetry > ASYMMETRIE_GRENS) {
    terugvalTeller++;
    return solveGauss(A, b);
  }

  return solveWithProfile(A, b, profiel.first);
}

/**
 * De kern: LDLᵀ over een OPGEGEVEN envelop.
 *
 * Apart naar buiten gebracht omdat het meetscript
 * (`scripts/meet-oplossers.mjs`) hiermee dezelfde code met een VASTE band
 * (first[i] = max(0, i − b_max)) kan draaien. Zo is de vergelijking
 * skyline-tegen-band een echte tijdmeting op één implementatie, en geen
 * schatting uit twee verschillende stukken code.
 *
 * Voorwaarde: `first[i] ≤ i` en de envelop moet alle niet-nullen van de
 * onderdriehoek omvatten. `analyzeMatrix` levert de krapst geldige.
 */
export function solveWithProfile(A: Matrix, b: number[], first: Int32Array): number[] {
  const n = A.rows;
  if (n === 0) return [];

  // ── Envelop vullen ──────────────────────────────────────────────────────
  // rij i beslaat de kolommen first[i]..i; start[i] is de plek van kolom
  // first[i] in `vals`, zodat L(i,j) = vals[start[i] + (j − first[i])].
  const start = new Int32Array(n);
  let offset = 0;
  for (let i = 0; i < n; i++) {
    start[i] = offset - first[i]; // zo is L(i,j) = vals[start[i] + j]
    offset += i - first[i] + 1;
  }
  const vals = new Float64Array(offset);
  for (let i = 0; i < n; i++) {
    const rij = A.data[i];
    const s = start[i];
    for (let j = first[i]; j <= i; j++) vals[s + j] = rij[j];
  }

  const d = new Float64Array(n);
  // `t` houdt per rij de tussenwaarden L(i,k)·d[k] vast, zodat de binnenste
  // lus twee vermenigvuldigingen scheelt.
  const t = new Float64Array(n);

  // ── Ontbinding A = L·D·Lᵀ (L eenheidsonderdriehoek) ─────────────────────
  for (let i = 0; i < n; i++) {
    const fi = first[i];
    const si = start[i];

    for (let j = fi; j < i; j++) {
      const sj = start[j];
      const k0 = fi > first[j] ? fi : first[j];
      let som = vals[si + j];
      for (let k = k0; k < j; k++) som -= t[k] * vals[sj + k];
      vals[si + j] = som / d[j];
      t[j] = som; // = L(i,j)·d[j]
    }

    let diag = vals[si + i];
    for (let k = fi; k < i; k++) diag -= vals[si + k] * t[k];

    const oorspronkelijk = Math.abs(A.data[i][i]);
    if (oorspronkelijk > 0) {
      const ratio = Math.abs(diag) / oorspronkelijk;
      if (ratio < laagstePivotRatio) laagstePivotRatio = ratio;
    }

    if (
      Math.abs(diag) < PIVOT_ABS_DREMPEL ||
      Math.abs(diag) < PIVOT_REL_DREMPEL * oorspronkelijk
    ) {
      throw new Error(`Matrix is singular or nearly singular at column ${i}`);
    }
    d[i] = diag;
  }

  // ── Voorwaartse substitutie L·y = b ─────────────────────────────────────
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const si = start[i];
    let som = b[i];
    for (let k = first[i]; k < i; k++) som -= vals[si + k] * x[k];
    x[i] = som;
  }

  // ── Diagonaal D·z = y ───────────────────────────────────────────────────
  for (let i = 0; i < n; i++) x[i] /= d[i];

  // ── Terugwaartse substitutie Lᵀ·x = z ───────────────────────────────────
  for (let i = n - 1; i > 0; i--) {
    const si = start[i];
    const xi = x[i];
    if (xi === 0) continue;
    for (let k = first[i]; k < i; k++) x[k] -= vals[si + k] * xi;
  }

  return Array.from(x);
}
