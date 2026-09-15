fn main() {
    tauri_build::build();
    resource_voor_tests();
}

/// Geef ook de TESTbinaries van deze crate het Windows-resourcebestand van de
/// app (icoon, versie-informatie, applicatiemanifest).
///
/// WAAROM. tauri-build schrijft `resource.rc` in OUT_DIR en linkt hem alleen
/// in de bin (`cargo:rustc-link-arg-bins`). De lib importeert via de
/// dialoog-plugin `TaskDialogIndirect`, dat alleen in Common Controls v6
/// bestaat; het manifest in die .rc vraagt daarom om comctl32 v6. Zonder dat
/// manifest bindt de Windows-loader een testbinary aan comctl32 v5 en start
/// hij niet eens (STATUS_ENTRYPOINT_NOT_FOUND) — geen enkele unit-test in
/// src/ kon dus draaien, ongeacht wat er in de test stond. Zelfde .rc, zelfde
/// resourcecompiler (embed-resource, al in de boom via tauri-build).
///
/// ALLEEN DE INTEGRATIETEST-DOELEN. Cargo past `rustc-link-arg-tests` toe op
/// de doelen in tests/, niet op de unit-testharnas van de lib; die harnas
/// staat daarom uit (`[lib] test = false`) en de unit-tests van deze crate
/// staan in tests/. De andere weg — `rustc-link-arg` voor élk doel — gaf de
/// bin de resource twee keer (tauri-build én hier): GNU ld voegt die niet
/// samen maar plakt ze aan elkaar (`.rsrc` precies dubbel zo groot, gemeten),
/// en zo'n exe hoort niet uitgeleverd te worden.
///
/// Buiten Windows schrijft tauri-build geen .rc en is er niets te linken.
fn resource_voor_tests() {
    let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR"));
    let rc = out.join("resource.rc");
    if !rc.exists() {
        return;
    }
    if let Err(e) = embed_resource::compile_for_tests(&rc, embed_resource::NONE).manifest_required() {
        panic!("resource voor de testbinaries niet gecompileerd: {e}");
    }
}
