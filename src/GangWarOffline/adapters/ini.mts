import { INI_ASCII_LIMIT, INI_SECTION } from "../persistence/ini-diagnostics.mts";
import type { IniOperations } from "../persistence/ini-diagnostics.mts";

export interface IniBindings {
  exists(path: string): boolean;
  read(path: string, section: string, key: string): unknown;
  write(value: string, path: string, section: string, key: string): unknown;
}
// Preserva os retornos reais (sem String(undefined), trim, coercoes ou truthiness).
export function createIniAdapter(bindings: IniBindings): IniOperations {
  function pathCheck(path: string): void {
    // GetPath do IniFiles 1.2 recebe primeiro um buffer UTF-8 de 128 bytes,
    // mesmo que o buffer final wchar_t tenha MAX_PATH. Fail closed para outros paths.
    if (!/^[A-Za-z]:\\/.test(path) || /[^\x20-\x7e]/.test(path) || path.length > INI_ASCII_LIMIT) throw new Error("INI: caminho deve ser absoluto ASCII com ate 127 bytes nesta versao do adapter.");
  }
  function keyCheck(key: string): void {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key)) throw new Error("INI: chave invalida.");
  }
  return {
    exists: (path) => {
      pathCheck(path); const result = bindings.exists(path);
      if (typeof result !== "boolean") throw new Error(`INI exists retornou ${typeof result}, nao boolean.`);
      return result;
    },
    read: (path, key) => { pathCheck(path); keyCheck(key); return bindings.read(path, INI_SECTION, key); },
    write: (path, key, value) => {
      pathCheck(path); keyCheck(key);
      if (!/^[\x20-\x7e]{1,127}$/.test(value)) throw new Error("INI: valor deve ser ASCII nao vazio de ate 127 bytes.");
      return bindings.write(value, path, INI_SECTION, key);
    },
  };
}
