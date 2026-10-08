// Subconjunto conferido na .config/sa.d.ts (Sanny Builder Library 1.67)
// da instalação CLEO Redux 1.5.1 de desenvolvimento. Sem tipos de Node no jogo.
declare const HOST: string;
declare var ONMISSION: boolean;
declare function log(...values: unknown[]): void;
declare function showTextBox(text: string): void;
declare function setInterval(callback: () => void, delay?: number): number;
declare function clearInterval(id: number): void;
declare const Pad: {
  IsKeyPressed(keyCode: number): boolean;
};
