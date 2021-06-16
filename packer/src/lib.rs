
use wasm_bindgen::prelude::*;

const WASM_DATA: &[u8] = include_bytes!(env!("WASM_PATH"));
const JS_DATA: &[u8] = include_bytes!(env!("JS_PATH"));

#[wasm_bindgen(js_name = "getWasmData")]
pub fn get_wasm_data() -> Vec<u8> {
    WASM_DATA.to_vec()
}

#[wasm_bindgen(js_name = "getJsData")]
pub fn get_js_data() -> Vec<u8> {
    JS_DATA.to_vec()
}
