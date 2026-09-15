//! Laadt een testbinary van de app-crate op Windows überhaupt?
//!
//! WAAROM DIT EEN TEST IS. De lib importeert via de dialoog-plugin
//! `TaskDialogIndirect`, dat alleen in Common Controls v6 bestaat. Een binary
//! zonder applicatiemanifest dat om v6 vraagt, wordt door de Windows-loader aan
//! comctl32 v5 gebonden en start niet (STATUS_ENTRYPOINT_NOT_FOUND) — vóór er
//! ook maar één test draait. build.rs linkt daarom het resourcebestand van
//! tauri-build (met dat manifest) ook in de integratietest-doelen. Dit doel
//! maakt die instructie bovendien geldig: zonder een integratietest-doel
//! weigert cargo `rustc-link-arg-tests`.
//!
//! De toets zelf: onder het actieve manifest levert comctl32 `TaskDialogIndirect`
//! — precies het symbool dat zonder manifest ontbrak. Valt deze test ooit om
//! (of laadt de binary niet), dan is het manifest uit de testdoelen verdwenen.

#[cfg(windows)]
#[test]
fn comctl32_v6_is_actief_in_de_testbinary() {
    use windows::core::{s, w};
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    // SAFETY: LoadLibraryW/GetProcAddress met geldige, nul-getermineerde
    // namen; de module wordt niet ontladen zolang het proces leeft.
    let (aanwezig, fout) = unsafe {
        match LoadLibraryW(w!("comctl32.dll")) {
            Ok(module) => (GetProcAddress(module, s!("TaskDialogIndirect")).is_some(), None),
            Err(e) => (false, Some(e)),
        }
    };
    assert!(
        fout.is_none(),
        "comctl32.dll niet te laden: {fout:?}"
    );
    assert!(
        aanwezig,
        "comctl32 heeft geen TaskDialogIndirect: de testbinary draait zonder het \
         Common-Controls-v6-manifest (zie build.rs); dan laadt elke testbinary \
         die de dialoog-plugin linkt niet"
    );
}
