// Release builds link as a GUI app so Windows doesn't open a console window
// next to the app. Debug builds keep the console for solver/panic output.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    open_fem2d_studio_lib::run()
}
