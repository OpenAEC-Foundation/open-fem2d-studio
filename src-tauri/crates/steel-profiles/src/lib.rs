//! Steel profile database — single source of truth shared with TS frontend.
//! JSON loaded at compile-time via include_str!, parsed once via OnceLock.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;
use ts_rs::TS;
use section_properties::SectionProperties;

const PROFILES_JSON: &str = include_str!("../data/profiles.json");

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub enum ProfileKind { ISection, Channel, Rhs, Shs, Chs }

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct ProfileGeometry {
    pub h: f64, pub b: f64,
    #[serde(default)] pub tw: f64,
    #[serde(default)] pub tf: f64,
    #[serde(default)] pub t: f64,
    #[serde(default)] pub r: f64,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct BucklingCurves {
    pub y_axis: char,
    pub z_axis: char,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/lib/types/steel/")]
pub struct SteelProfile {
    pub name: String,
    pub kind: ProfileKind,
    pub geometry: ProfileGeometry,
    pub properties: SectionProperties,
    pub buckling_curves: BucklingCurves,
}

pub struct SteelProfileDb {
    profiles: Vec<SteelProfile>,
    by_name: HashMap<String, usize>,
    by_key: HashMap<String, usize>,
}

/// Zoeksleutel voor een profielnaam: spaties, koppeltekens en punten eruit,
/// alles naar hoofdletters. Zo vindt "HEA 320" hetzelfde profiel als "HEA320"
/// of "hea-320". De database schrijft de namen met spatie, maar de frontend en
/// externe aanroepers doen dat niet altijd.
fn lookup_key(name: &str) -> String {
    name.chars()
        .filter(|c| !c.is_whitespace() && *c != '-' && *c != '.')
        .flat_map(|c| c.to_uppercase())
        .collect()
}

impl SteelProfileDb {
    fn load() -> Self {
        let profiles: Vec<SteelProfile> = serde_json::from_str(PROFILES_JSON)
            .expect("profiles.json must parse — checked by build.rs");
        let by_name = profiles.iter().enumerate()
            .map(|(i, p)| (p.name.clone(), i))
            .collect();
        // Eerste treffer wint, zodat een later profiel met dezelfde
        // genormaliseerde sleutel een eerder profiel niet overschrijft.
        let mut by_key: HashMap<String, usize> = HashMap::new();
        for (i, p) in profiles.iter().enumerate() {
            by_key.entry(lookup_key(&p.name)).or_insert(i);
        }
        Self { profiles, by_name, by_key }
    }

    /// Zoekt eerst op exacte naam, daarna op de genormaliseerde sleutel.
    pub fn find(&self, name: &str) -> Option<&SteelProfile> {
        self.by_name
            .get(name)
            .or_else(|| self.by_key.get(&lookup_key(name)))
            .map(|&i| &self.profiles[i])
    }

    pub fn all(&self) -> &[SteelProfile] { &self.profiles }
}

pub fn db() -> &'static SteelProfileDb {
    static DB: OnceLock<SteelProfileDb> = OnceLock::new();
    DB.get_or_init(SteelProfileDb::load)
}
