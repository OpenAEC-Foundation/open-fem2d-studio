# Open-FEM2D-Studio - Claude Instructions

## Communicatie Regels (VERPLICHT)

### 1. Meld ALTIJD wat je doet
Na ELKE actie, expliciet melden:
- Welke bestanden je hebt aangepast
- Welke specifieke wijzigingen je hebt gemaakt
- Wat je NIET hebt gedaan
- Aannames die je hebt gemaakt

### 2. Vraag VROEG om verduidelijking
Stop en vraag VOORDAT je codeert als iets onduidelijk is:
- Exacte requirement
- Welke bestanden
- Verwacht gedrag
- Edge cases
- Aanpak keuze

Format:
```
❓ VERDUIDELIJKING NODIG:
1. [Vraag]
2. [Vraag]
Mijn aanname als je niet reageert: [aanname]
```

### 3. Verificatie na afronding
Na ELKE taak:
1. `npx tsc --noEmit` uitvoeren
2. Tests uitvoeren indien beschikbaar
3. Samenvatting geven:
```
✅ VERIFICATIE:
- TypeScript: [PASS/FAIL]
- Tests: [PASS/FAIL/N.v.t.]
- Gewijzigde bestanden: [lijst]
- Klaar voor testen: [JA/NEE]
```

### 4. Meerdere instructies (tot 30)
Bij meerdere taken:
1. EERST alle taken oplijsten met nummers
2. Dependencies identificeren
3. Groeperen in parallelle batches
4. Uitvoeren in optimale volgorde
5. Voortgang bijhouden met checkboxes

## Project Kennis

### Tech Stack
- React 18 + TypeScript + Vite
- Canvas 2D rendering
- FEM solver (stiffness matrix, Newton-Raphson)
- Steel/Timber/Concrete profile libraries

### Kritieke Bestanden
| Bestand | Functie |
|---------|---------|
| `src/context/FEMContext.tsx` | Centrale state management |
| `src/core/fem/Mesh.ts` | Data model (nodes, beams, plates) |
| `src/core/solver/NonlinearSolver.ts` | Hoofd solver + constraint transfer |
| `src/components/MeshEditor/MeshEditor.tsx` | Canvas rendering (~10k regels) |
| `src/core/fem/PlateRegion.ts` | Plate mesh generatie |

### Node ID Systeem
- Reguliere nodes: ID < 1000
- Plate nodes: ID >= 1000 (`addPlateNode`)
- Constraint transfer: solver verplaatst constraints van inactieve naar actieve nodes

### Plate Mesh API
```typescript
const plate = await generatePolygonPlateMeshV2(mesh, {
  outline: polygon,
  meshSize: 1.0,
  materialId: 1,
  thickness: 0.02
});
mesh.addPlateRegion(plate);
```

### Veelvoorkomende Fouten (VERMIJD)
1. **Zoom flicker**: Gebruik `viewStateRef.current` niet `viewState` in draw functies
2. **Hook dependency cycles**: Gebruik refs om circulaire deps te breken
3. **Profile data indices**: Verifieer shape_coords mapping tegen JSON
4. **SteelProfileLibrary**: Singleton, gebruik `SteelProfileLibrary.findProfile()`

## Solver Test Protocol

Voor solver wijzigingen, ALTIJD verificatie tests maken:
```javascript
const tests = [
  { name: 'Basis case', ... },
  { name: 'Edge case 1', ... },
  // minimaal 5-10 test cases
];
```

Uitvoeren met: `node test-*.mjs`

## Zelf-Check

Voor elke response, verifieer:
- [ ] Vraag beantwoord?
- [ ] Alleen gevraagde wijzigingen gemaakt?
- [ ] ALLE wijzigingen gerapporteerd?
- [ ] Code compileert?
- [ ] Niet-gedaan dingen vermeld?
- [ ] Onduidelijkheden gevraagd?
- [ ] Test instructies gegeven?
