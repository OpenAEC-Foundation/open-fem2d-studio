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
}

impl SteelProfileDb {
    fn load() -> Self {
        let profiles: Vec<SteelProfile> = serde_json::from_str(PROFILES_JSON)
            .expect("profiles.json must parse — checked by build.rs");
        let by_name = profiles.iter().enumerate()
            .map(|(i, p)| (p.name.clone(), i))
            .collect();
        Self { profiles, by_name }
    }
    pub fn find(&self, name: &str) -> Option<&SteelProfile> {
        self.by_name.get(name).map(|&i| &self.profiles[i])
    }
    pub fn all(&self) -> &[SteelProfile] { &self.profiles }
}

pub fn db() -> &'static SteelProfileDb {
    static DB: OnceLock<SteelProfileDb> = OnceLock::new();
    DB.get_or_init(SteelProfileDb::load)
}
