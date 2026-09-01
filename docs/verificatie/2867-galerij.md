# Verificatie staaltoetsing — referentie 2867 (galerij)

**Referentie:** externe uitdraai van een 2D-raamwerk, project 2867. Twee liggers
van 8000 mm, S 235, CC2, elk met twee zijdelingse steunen op de derdepunten
(L_st = 2667 mm), belasting aangrijpend op de bovenflens (z_a = 155 mm).

**Norm:** NEN-EN 1993-1-1+C2+A1/NB:2016 nl, inclusief bijlage NB.NB.

**Scope:** buiging, dwarskracht, buiging+dwarskracht, kip en doorbuiging.
Normaalkracht en knik vallen buiten deze verificatie.

Alle getallen in de kolom "ons" komen uit een testrun, niet uit handwerk:
`cargo test -p steel-check --test galerij_2867`.

## Resultaten — ligger 1, HEA 320

| Toets | Artikel | Referentie | Ons | Oordeel |
|---|---|---|---|---|
| Buiging | 6.2.5 (6.13) | M_Rd = 382,666 kNm, UC 0,29 | 382,666 kNm, UC 0,292 | exact |
| Dwarskracht | 6.2.6 (6.18) | V_Rd = 558,4 kN, UC 0,10 | 558,448 kN, UC 0,100 | exact |
| Buiging + dwarskracht | 6.2.8 | UC 0,29 (effect verwaarloosbaar) | UC 0,292 | exact |
| Kip | 6.3.2.1 + NB | χ_LT = 1,00, UC 0,29 | χ_LT = 1,000, UC 0,292 | gelijk resultaat |
| Doorbuiging w_fin | L/333 | 24,0 mm, UC 0,46 | 24,024 mm, UC 0,458 | exact |
| Doorbuiging w_add | L/150 | 53,3 mm, UC 0,15 | 53,333 mm, UC 0,146 | exact |

Maatgevend: `deflection_w_fin`, uc_max = 0,458. De referentie wijst dezelfde
toets aan met 0,46.

## Resultaten — ligger 2, HEA 400

| Toets | Referentie | Ons | Oordeel |
|---|---|---|---|
| Buiging | 602,106 kNm, UC 0,38 | 602,106 kNm, UC 0,377 | exact |
| Dwarskracht | 778,1 kN, UC 0,15 | 778,109 kN, UC 0,146 | exact |
| Kip | χ_LT = 1,00 | χ_LT = 1,000 | gelijk resultaat |
| Doorbuiging w_fin | UC 0,47 | 24,024 mm, UC 0,466 | exact |

Maatgevend: `deflection_w_fin`, uc_max = 0,466.

## Tussenwaarden kip — HEA 320

| Grootheid | Referentie | Ons | Bron |
|---|---|---|---|
| L_g | 8000 mm | 8000 mm | volledige overspanning |
| L_st | 2667 mm | 2666,7 mm | afstand zijdelingse steunen |
| β | 0 | **0,167** | zie afwijking 1 hieronder |
| L_kip | 3733 mm | **3377,8 mm** | (1,4 − 0,8β)·L_st, begrensd op [1,0 ; 1,4] |
| B* | 0,889 | **0,939** | zie afwijking 1 |
| C₁ | 1,529 | 1,504 | figuur NB.NB.5 |
| C₂ | −0,078 | **−0,041** | figuur NB.NB.6 + z_a-correctie |
| S | 2006 mm | 2006,0 mm | NB.NB.13 |
| C | 18,886 | **22,852** | NB.NB.11 |
| k_red | 1 | 1,000 | NB.NB.7 (h/t_w = 34,4 ≤ 75) |
| M_cr | 2675,8 kNm | **3237,7 kNm** | NB.NB.2 — **21% hoger** |
| λ_LT | 0,378 | 0,344 | √(W_y·f_y/M_cr) |
| χ_LT | 1,00 | 1,000 | λ_LT < 0,4 |

## Gerepareerde fouten

Zeven punten waarop de implementatie afweek van de norm:

1. **C-coëfficiënt (NB.NB.11)** — de laatste term `π·C₂·S/L_kip` stond binnen de
   wortel in plaats van erbuiten. Gaf 19,896 waar 18,886 hoort: M_cr 5% te hoog.
2. **C₁-tabel** — de code gebruikte een tabel die niet in de norm voorkomt
   (1,803 bij β = 0, waar tabel NB.NB.1 geval 1 er 1,75 geeft) en die bovendien
   niet-monotoon was. Vervangen door figuur NB.NB.5/NB.NB.6, gedigitaliseerd en
   verankerd op tabel NB.NB.1.
3. **C₂** — hardgecodeerd op 0,46 bij aanwezige veldbelasting. Komt nu uit
   figuur NB.NB.6, met de correctie voor het aangrijpingspunt en de juiste
   tekenconventie (destabiliserend boven het zwaartepunt → negatief).
4. **L_kip** — ontbrak volledig; L_kip werd gelijkgesteld aan L_st. Nu
   `(1,4 − 0,8β)·L_st` met de normbegrenzing 1,0 ≤ L_kip/L_st ≤ 1,4.
5. **L_g** — werd gelijkgesteld aan L_st. Nu de volledige overspanning; L_g,
   L_st en L_kip zijn drie verschillende grootheden.
6. **k_red (NB.NB.7/8/9)** — boven h/t_w = 75 rekende de code met `75/(h/t_w)`,
   ondergrens 0,5. Dat staat nergens in de norm. Nu
   `min(−5,4·10⁻⁵·α + 1,03 ; 1)` met `α = h·t_f·10¹² / (t_w³·b·L_g²)`, en een
   signalering wanneer α > 5000 en de gedrukte rand volgens 6.3.3 moet worden
   getoetst.
7. **Doorsnedegrootheden HEA 320/400** — weken af van de catalogus (A_v,z was
   2790 in plaats van 4116 mm²; I_t ontbrak).

## Openstaande afwijking — β en B\* worden benaderd

Dit is de enige inhoudelijke afwijking die overblijft, en zij verklaart de
volledige 21% op M_cr.

De norm bepaalt β als `M_y,1,Ed / M_y,2,Ed`: de verhouding van de twee
**eindmomenten van het kipveld**, met M_1 de kleinste en M_2 de grootste in
absolute waarde. Voor deze ligger loopt het maatgevende kipveld van x = 0 tot
x = 2667 mm, met eindmomenten 0 en M(2667), dus β = 0 en L_kip = 1,4 · 2667 =
3733 mm. Ook B\* hoort met het eindmoment van dát veld te worden bepaald
(57,707 kNm), niet met het maximale veldmoment van de hele staaf.

De orchestrator gebruikt in plaats daarvan het moment op L_st/4 gedeeld door het
maximale moment over de hele staaf. Dat geeft hier β = 0,167 en B\* = 0,939, en
daarmee een 10% te korte kiplengte en een 21% te hoog M_cr.

**Richting van de fout: onveilig.** Een te hoog M_cr geeft een te lage λ_LT en
dus een te gunstige kiptoets. In deze casus verandert het de uitkomst niet —
λ_LT blijft met 0,344 ruim onder de drempel 0,4, zodat χ_LT = 1,00 net als in de
referentie — maar bij een slankere ligger, waar λ_LT boven 0,4 uitkomt, werkt de
fout wél door in de unity check.

Vastgelegd in de test `bekend_gat_beta_wordt_benaderd_niet_volgens_de_norm`
(`crates/steel-check/tests/galerij_2867.rs`), die faalt zodra het gat gedicht is.

## Aansluiting vanuit het model

`src/lib/steelCheckBuilder.ts` vult de vier invoervelden die deze verificatie
heeft toegevoegd:

| Veld | Bron | Richting bij afwijking |
|---|---|---|
| `q_equiv_n_per_mm` | teruggerekend uit de momentenlijn: `q = 8·(M_midden − (M_begin+M_eind)/2)/L²`, dezelfde methode als de referentie | — |
| `z_a_mm` | `h/2` uit de profieldatabase: aanname dat de belasting op de bovenflens aangrijpt | conservatief |
| `pre_camber_mm` | 0 — zeeg wordt nog niet in het model vastgelegd | neutraal |
| `deflection_permanent_mm` | 0 — vereist een oplossing per BGT-combinatie, die er nog niet is; hierdoor geldt w_add = w_fin | conservatief |

## Verder niet geverifieerd

- **Negatieve B\*** — alleen de tak B\* ≥ 0 van figuur NB.NB.5/NB.NB.6 is
  gedigitaliseerd. Op de negatieve tak kruisen de krommen elkaar en liggen
  pieken tot C₁ = 2,3. Voor B\* < 0 wordt de waarde bij |B\*| gebruikt; die ligt
  onder de werkelijke piekwaarden en is dus veilig-zijdig, maar ongeverifieerd.
  De kiptoets voegt in dat geval een `note` toe aan het resultaat.
- **Aflezingsnauwkeurigheid van de figuren** — het gedigitaliseerde controlepunt
  β = 0, B\* = 0,889 geeft C₁ = 1,513 (referentie 1,529, 1,0% afwijking) en
  C₂ = 0,075 (referentie 0,074, 1,1%). De uiteinden zijn exact, want daar is de
  digitalisering op tabel NB.NB.1 verankerd.
- **k_red boven h/t_w = 75** — de formule is nu normatief, maar er is geen
  referentieberekening met een slank lijf om hem tegen te toetsen. Beide
  referentieprofielen hebben k_red = 1 (α = 343 resp. 290).
- **Monosymmetrische profielen** (UNP/UPE) — `m_b_rd_channel` gebruikt een
  vereenvoudigde reductie van 0,7 op M_cr, niet de volledige Annex F.
- **Normaalkracht en knik** — 6.2.9, 6.3.1 en 6.3.3 zijn niet tegen deze
  referentie getoetst; zij vielen buiten de scope.
- **Belastingcombinaties** — de toetsing krijgt de resultaten van één
  belastinggeval; er is nog geen rekenpad dat per combinatie oplost.

## Testdekking

| Crate | Tests |
|---|---|
| `steel-profiles` | 7 |
| `nen-en-1993-1-1-section` | 17 |
| `nen-en-1993-1-1-ltb` | 39 |
| `steel-check` | 60 |
| Workspace totaal | **146, alle groen** |
