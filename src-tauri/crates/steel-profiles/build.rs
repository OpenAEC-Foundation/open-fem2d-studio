fn main() {
    let json = std::fs::read_to_string("data/profiles.json")
        .expect("data/profiles.json missing");
    let _: serde_json::Value = serde_json::from_str(&json)
        .expect("data/profiles.json malformed");
    println!("cargo:rerun-if-changed=data/profiles.json");
}
