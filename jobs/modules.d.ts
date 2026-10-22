declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}

declare module '*/om_file_format.web.js' {
  export default function OmFileFormat(options?: Record<string, unknown>): Promise<unknown>;
}
