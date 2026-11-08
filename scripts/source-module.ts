// Load the actual server source with fail-closed dependency boundaries, without a test renderer.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInThisContext } from "node:vm";
import ts from "typescript";

export function sourceModule<T>(file: string, bindings: Record<string, unknown>): T {
  const filename = resolve(file);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  const requireBound = (name: string) => {
    if (!(name in bindings)) throw new Error(`Unbound QA dependency: ${name}`);
    return bindings[name];
  };
  runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename })(requireBound, loaded, loaded.exports);
  return loaded.exports as T;
}
