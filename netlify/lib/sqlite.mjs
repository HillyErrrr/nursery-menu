// Loads the SQLite engine (sql.js, WebAssembly) once per function instance.
import initSqlJs from './vendor/sql-wasm.mjs';
import WASM_BASE64 from './vendor/sql-wasm-binary.mjs';

let enginePromise = null;
export function sqliteEngine() {
  if (!enginePromise) {
    const wasmBinary = Uint8Array.from(Buffer.from(WASM_BASE64, 'base64'));
    enginePromise = initSqlJs({ wasmBinary }).catch((e) => { enginePromise = null; throw e; });
  }
  return enginePromise;
}
