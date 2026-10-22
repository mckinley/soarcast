// @openmeteo/file-reader loads its WebAssembly by fetching a file next to its
// script, which a Worker can't do. jobs/wrangler.toml points the reader's
// import of @openmeteo/file-format-wasm here instead: the same module, with
// the WebAssembly bundled into the Worker and started from it. The module is
// the copy shrink-wasm.mjs writes before each build, with 16 MB of memory
// instead of 64.

import wasm from './.build/om_file_format.wasm';
import OmFileFormat from '../node_modules/@openmeteo/file-format-wasm/dist/om_file_format.web.js';

export default function startOmFileFormat() {
  return OmFileFormat({
    instantiateWasm(
      imports: WebAssembly.Imports,
      receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ) {
      const instance = new WebAssembly.Instance(wasm, imports);
      receive(instance, wasm);
      return instance.exports;
    },
  });
}
