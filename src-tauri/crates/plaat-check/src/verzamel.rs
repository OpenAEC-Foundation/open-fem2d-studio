//! Van unity checks per element en combinatie naar de drie overzichten:
//! per toets het maatgevende punt, per combinatie het maatgevende element en
//! per element de omhullende.
//!
//! Materiaalonafhankelijk: de materiaalmodules leveren per element en
//! combinatie een lijst (toets-id, UC) en krijgen hier terug waar elke toets
//! maatgevend is, zodat ze alleen voor dát punt de afleiding uitschrijven.

use std::collections::HashMap;

use crate::input::{PlaatElementSpanning, PlateCheckInput};
use crate::result::{PlaatCombinatieUitkomst, PlaatElementUitkomst};

/// Eén punt waar een toets is uitgevoerd.
#[derive(Clone, Copy, Debug)]
pub struct Punt {
    pub combination_id: u32,
    pub element: PlaatElementSpanning,
    pub uc: f64,
}

/// Het maatgevende punt van één toets.
#[derive(Clone, Debug)]
pub struct Maatgevend {
    pub check_id: String,
    pub punt: Punt,
}

#[derive(Debug, Default)]
pub struct Verzameling {
    /// Per toets het punt met de hoogste UC, in de volgorde waarin de toetsen
    /// voor het eerst voorkwamen.
    pub per_toets: Vec<Maatgevend>,
    pub per_combinatie: Vec<PlaatCombinatieUitkomst>,
    pub per_element: Vec<PlaatElementUitkomst>,
}

/// Loopt alle elementen van alle combinaties langs.
///
/// `beoordeel` geeft per element de UC per toets; een toets die op dat element
/// niet van toepassing is, laat hij weg (geen 0, want 0 leest als "ruim
/// voldoende" en zou een maatgevend punt kunnen worden bij een plaat waar die
/// toets nergens speelt).
pub fn verzamel<F>(input: &PlateCheckInput, mut beoordeel: F) -> Verzameling
where
    F: FnMut(u32, &PlaatElementSpanning) -> Vec<(String, f64)>,
{
    let mut v = Verzameling::default();
    // Een wand kan duizenden elementen hebben, maal tientallen combinaties:
    // zoeken per element in een lijst zou kwadratisch worden.
    let mut element_index: HashMap<u32, usize> = HashMap::new();
    for comb in &input.combinations {
        let mut comb_best: Option<PlaatCombinatieUitkomst> = None;
        for el in &comb.elements {
            for (id, uc) in beoordeel(comb.combination_id, el) {
                let punt = Punt { combination_id: comb.combination_id, element: *el, uc };
                match v.per_toets.iter_mut().find(|m| m.check_id == id) {
                    Some(m) => {
                        if uc > m.punt.uc {
                            m.punt = punt;
                        }
                    }
                    None => v.per_toets.push(Maatgevend { check_id: id.clone(), punt }),
                }
                if comb_best.as_ref().map_or(true, |b| uc > b.uc) {
                    comb_best = Some(PlaatCombinatieUitkomst {
                        combination_id: comb.combination_id,
                        uc,
                        element_id: el.element_id,
                        check_id: id.clone(),
                    });
                }
                match element_index.get(&el.element_id).map(|&i| &mut v.per_element[i]) {
                    Some(e) => {
                        if uc > e.uc {
                            e.uc = uc;
                            e.combination_id = comb.combination_id;
                            e.check_id = id.clone();
                        }
                    }
                    None => {
                        element_index.insert(el.element_id, v.per_element.len());
                        v.per_element.push(PlaatElementUitkomst {
                            element_id: el.element_id,
                            uc,
                            combination_id: comb.combination_id,
                            check_id: id,
                        });
                    }
                }
            }
        }
        if let Some(b) = comb_best {
            v.per_combinatie.push(b);
        }
    }
    v
}
