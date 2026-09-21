# Staalplaatplooi: begrensde spanningsreductiemethode

De optionele `Plate.plooi`-invoer activeert een veldtoets naast het bestaande
vloeicriterium. Zonder die invoer veranderen de rekenuitkomsten niet en blijft
plooi expliciet niet getoetst. Projectformaat 2 blijft behouden; bij laden
worden geen veldafmetingen of steunvoorwaarden toegevoegd.

## Ondersteund domein

- Eén volledig asgelijnd rechthoekig, onverstijfd plaatveld zonder openingen.
  `a_mm` is de volledige maat in x en `b_mm` in z. De modelbouwer vergelijkt
  deze maten met de hoekknopen. Deelvelden en tussensteunen worden niet afgeleid.
- Vier continue scharnierende steunen uit het vlak, expliciet bevestigd met
  een bronomschrijving. Steunen in het membraanmodel en meshknopen zijn hiervoor
  geen bewijs. De steunconstructie en verbindingen moeten apart worden ontworpen.
- Staalsoorten en dikteklassen uit de bestaande staalmateriaalmodule; maximaal
  80 mm. Voor de elastische kritieke spanningen gelden E=210000 MPa en nu=0,3.
  De app weigert afwijkende materiaaloverschrijvingen. De implementatie beperkt
  zich bovendien tot t <= min(a,b)/10; dit is een toepassingsgrens van de code,
  geen aanvullende normbepaling.
- Uniforme membraanspanningen per UGT-combinatie, expliciet bevestigd voor het
  volledige veld en gecontroleerd tegen ALLE aangeleverde elementspanningen.
  De tolerantie is 1e-8 maal max(1 MPa, absolute referentiespanning), per component.
  Niet-uniforme velden worden geweigerd. Er wordt geen algemene conservatieve
  componentenomhullende voor variabele spanningen geclaimd. Binnen deze uitsluitend
  numerieke tolerantie worden maximale druk- en absolute schuifcomponenten gebruikt
  voor de kritieke factor. Voor de vloeifactor geldt het maximum van het werkelijke
  vloeicriterium en dat uit de maximale componenten; de negatieve kruisterm wordt
  daarmee niet als ongefundeerde verbetering benut.
- Alleen nul of druk in x/z, met eventuele schuif; trek wordt geweigerd omdat
  de drukzones nog niet worden afgebakend. Zuivere schuif is ondersteund.

## Expliciete beperking: kolomachtig gedrag

In iedere richting met druk wordt geweigerd als de veldlengte in die richting
kleiner is dan de dwarsbreedte. Bovendien wordt geweigerd wanneer de verhouding
van de kritieke factor van het volledige spanningsveld tot die voor kolomknik
kleiner is dan 2. De grens 2 (xi=1) is inclusief toegestaan. De kolomspanning
volgt uit (4.8), afzonderlijk voor beide richtingen. Zo wordt de interpolatie
tussen kolom- en plaatgedrag niet overgeslagen waar die nodig kan zijn.

Deze begrenzing weigert ook sommige lange velden met weinig druk en veel schuif,
en veel biaxiale combinaties. Dat is een bewuste beperking van deze implementatie,
geen uitspraak dat zulke velden niet voldoen. Het resultaat is `NotApplicable`
met `geweigerd`, niet een groene UC. Kolominterpolatie blijft uitbreidingswerk.

## Rekenbasis en verantwoording

- NEN-EN 1993-1-5+C1:2012 §10(1)–(6): spanningsreductiemethode, met de
  minimumreductie van §10(5a); geen interactie uit §10(5b).
- De gemeenschappelijke slankheid volgt uit (10.2), de vloeifactor uit (10.3),
  de kritieke factor uit (10.6) met psi_x=psi_z=1. De UC hoort bij (10.1)/(10.4).
- Drukreductie: §4.4(2), (4.2), tabel 4.1 met psi=1. k_sigma=4 wordt als
  conservatieve lange-plaatwaarde gebruikt. Korte drukvelden worden geweigerd.
- Kolomdomein: §4.4(6), §4.5.3 (4.8) en §4.5.4 (4.13). De aanvullende poort
  voor het volledige spanningsveld volgt de toelichting van JRC §10.1(5),
  figuur 10.1 (gedrukte bladzijden 124–125).
- Schuif: §5.3(1), tabel 5.1, tak vervormbaar eindschot; kritieke spanning uit
  A.1/A.3 (A.5), zonder langsverstijvingen. Er wordt geen weerstand van een star
  eindschot of flensbijdrage gebruikt. Bijlage A is informatief en wordt door
  §4.4 en §5.3 aangewezen voor de kritieke spanningen.
- Nederlandse bijlage NEN-EN 1993-1-5:2006/NB:2011 §5.1(2): eta=1,2 voor de
  ondersteunde staalsoorten tot en met S460. §10(4) verlangt maxima;
  §10(5) beperkt de toets tot drukgedeelten. Gamma_M1 wordt uit
  `nationale-bijlage::Ndp1993` gelezen (NL=1,0, EN 1993-1-1 NB §6.1).
- Het oorspronkelijke vloeicriterium blijft ALTIJD meetellen, ook wanneer
  zuivere schuif volgens tabel 5.1 een reductiefactor groter dan 1 geeft.

Primaire toelichting: [JRC EUR 22898 EN, hoofdstuk 10](https://eurocodes.jrc.ec.europa.eu/sites/default/files/2021-12/EUR22898EN.pdf).
De implementatie gebruikt de normregels; de JRC-toelichting verduidelijkt het
toepassingsgebied van de kolominteractie. Normtekst en PDF's worden niet meegeleverd.

## Invoer, weigeringen en rapportage

App en MCP-model: `plooi` met a_mm, b_mm, randvoorwaarden, steun_bron,
onverstijfd en uniforme_spanning. Bij activeren staan bevestigingen uit.
De directe `check_plates`-invoer vraagt ook `rechthoek_zonder_openingen` en
de verplichte volledige `expected_element_ids` uit de mesh. Deze lijst mag
niet uit de beschikbare spanningsresultaten worden afgeleid. De kern vergelijkt
iedere combinatie, inclusief de eerste/enige, met deze onafhankelijke lijst.
De directe aanroeper is verantwoordelijk voor de volledigheid van die verklaring.
In de app komt de lijst uit `region.elementIds` bij de meshopbouw, via
`PlateResult.expectedElementIds`, los van ontbrekende spanningsresultaten.
De combinator controleert tevens alle niet-nulbijdragen voordat deze metadata
wordt doorgegeven. Oude resultaten zonder deze metadata vragen een nieuwe solve
als plaatplooi wordt ingeschakeld; zonder plooi blijft het bestaande gedrag gelden.
De modelbouwer controleert geometrie en geeft afwijkingen via `geometrie_fout`
door. Een opgegeven fout wordt nooit genegeerd. Lege UGT-combinaties, dubbele
combinatie/elementnummers en verschillende elementsets worden geweigerd.

Het resultaat bevat een afzonderlijke `NamedCheck` met kritieke spanningen,
inverse belastingfactoren, slankheid, reducties, gamma_M1 en UC. De veld-UC geldt
voor ieder element van dat veld; het elementnummer is daar een representant,
geen lokale plooimodus. De bestaande vloeicontrole blijft elementgebonden.
Globale stabiliteit, steunontwerp (§9), buiging uit het vlak en andere nog niet
ondersteunde verschijnselen worden hiermee niet geverifieerd.

## Onafhankelijke referentiewaarden

S235, t=10 mm, a=2000 mm, b=1000 mm, E=210000 MPa, nu=0,3:
sigma_cr,x=75,920033855 MPa, sigma_cr,z=18,980008464 MPa,
tau_cr=120,333253659 MPa. Gamma_M1=1.

| Druk x | Druk z | Schuif | Slankheid | Reductie | Plooi-UC |
|---:|---:|---:|---:|---:|---:|
| 100 | 0 | 0 | 1,759364135 | 0,497313095 | 0,855661995 |
| 0 | 0 | 50 | 1,061844172 | 0,781658950 | 0,471460665 |
| 100 | 0 | 50 | 1,597893086 | 0,519434002 | 1,083729231 |

De gecombineerde rij voldoet aan von Mises maar niet aan de veldtoets.
De waarden staan als vaste handreferenties in `handberekening_plooi.rs`, samen
met tests voor teken, schaling, assenwisseling, dikteklasse, xi-grens,
ongeldige invoer, niet-uniformiteit, dekking en compatibiliteit. De dekkingstest
verwijdert hetzelfde element uit alle combinaties en controleert ook één enkele
combinatie. Een eindige extreme biaxiale druk van 1e155 MPa mag geen nul-UC
opleveren: de vergelijkspanning gebruikt buiten het veilige kwadrateerbereik
een geschaalde hypot-vorm. Niet-representeerbare criteria worden geweigerd.
