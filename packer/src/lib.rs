
use wasm_bindgen::prelude::*;

const DATA: &[u8] = include_bytes!(env!("DATA_PATH"));

#[wasm_bindgen(js_name = "getData")]
pub fn get_data() -> Vec<u8> {
    DATA.to_vec()
}
