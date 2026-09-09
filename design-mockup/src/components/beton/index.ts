/**
 * components/beton — wapeningskorf, doorsnedetekening, M-N-κ-diagram en
 * N-M-interactiediagram voor de betontoetsing (NEN-EN 1992-1-1).
 *
 * BetonKorfPaneel hangt in de staafeigenschappen (FemProperties, tabblad
 * "Norm" bij een betonstaaf). De tekening en de grafieken worden daarnaast
 * door de betonsectie van het rapport hergebruikt — daar met RAPPORT_KLEUREN
 * in plaats van de theme-tokens.
 */
export { default as BetonKorfPaneel } from "./BetonKorfPaneel";
export { default as WapeningskorfEditor } from "./WapeningskorfEditor";
// De korfvelden zelf (milieuklasse, dekking, beugel, wapening) staan apart,
// omdat de profielkiezer ze óók toont. Eén component, twee plaatsen.
export { default as KorfVelden } from "./KorfVelden";
// De §5.8-invoer van een kolom: schoring, kniklengte, kruip en de twee keuzen
// van §9.5. Staat naast KorfVelden en niet erin: de korf beschrijft de
// DOORSNEDE en geldt voor elke betonstaaf, terwijl dit blok over de STAAF als
// drukelement gaat en alleen zin heeft waar normaaldruk op staat.
export { default as KolomVelden } from "./KolomVelden";
// De gevallen van figuur 5.7 en de regel die een tegenspraak met de schoring
// voorkomt: geen React, dus ook zonder DOM te gebruiken en te testen.
export * from "./kolomgegevens";
export { default as DoorsnedeTekening } from "./DoorsnedeTekening";
// Het venster onderin bij een geselecteerde betonstaaf: de aanzicht met de vier
// lagen (momentendekking, dwarskrachtdekking, scheurwijdte, unity checks), de
// doorsnede op de aangewezen snede en de invoer van de wapeningszones. Het
// staat in een eigen map omdat het over de LENGTE van de staaf gaat, terwijl
// alles hierboven de DOORSNEDE beschrijft — dat is ook de reden dat de
// zone-invoer daar niet in past.
export { default as BetonStaafVenster } from "./dekking/BetonStaafVenster";
export { default as AanzichtTekening } from "./dekking/AanzichtTekening";
export { default as ZoneEditor } from "./dekking/ZoneEditor";
export * from "./dekking/dekkingLagen";
export * from "./dekking/zoneModel";
export { default as MNKappaGrafiek, puntBijMoment } from "./MNKappaGrafiek";
export { default as InteractieGrafiek } from "./InteractieGrafiek";
export { default as EiVerloopGrafiek, type EiSegment } from "./EiVerloopGrafiek";
export * from "./tekenkleuren";
export * from "./wapeningskorf";
export * from "./betonKern";
