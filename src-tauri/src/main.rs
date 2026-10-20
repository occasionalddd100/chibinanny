// no console window next to the pet on Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    chibinanny_lib::run()
}
