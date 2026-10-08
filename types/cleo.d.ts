// Subconjunto conferido na .config/sa.d.ts (Sanny Builder Library 1.67)
// da instalação CLEO Redux 1.5.1 de desenvolvimento. Sem tipos de Node no jogo.
declare const HOST: string;
declare var ONMISSION: boolean;
declare function log(...values: unknown[]): void;
declare function showTextBox(text: string): void;
declare function setInterval(callback: () => void, delay?: number): number;
declare function clearInterval(id: number): void;
declare const __dirname: string;
declare const FxtStore: {
  insert(key: string, value: string, isGlobal?: boolean): void;
  delete(key: string, isGlobal?: boolean): void;
};
declare function addEventListener(name: string, callback: (event: { data?: unknown }) => void): () => void;
declare function native<T>(name: string, ...args: unknown[]): T;
declare const Fs: { DoesFileExist(path: string): boolean };
declare const IniFile: {
  ReadString(path: string, section: string, key: string): string | undefined;
  WriteString(value: string, path: string, section: string, key: string): boolean;
};
declare const Pad: {
  IsKeyPressed(keyCode: number): boolean;
};
