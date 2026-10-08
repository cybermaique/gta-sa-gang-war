import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Verificacao estatica de imports/comandos contra a biblioteca realmente instalada.
// Nao e teste unitario; nao executa o jogo nem modifica sua instalacao.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const game = process.argv[2] ?? "C:\\Games\\GTA-SA-GangWar-DEV";
const api = JSON.parse(fs.readFileSync(path.join(game, "CLEO", ".config", "sa.json"), "utf8"));
const commands = new Map();
for (const ext of api.extensions) for (const command of ext.commands) {
  if (["default", "CLEO", "ini", "file"].includes(ext.name)) commands.set(command.name, { ...command, extension: ext.name });
}
const bindings = {
  "Fs.DoesFileExist": "DOES_FILE_EXIST",
  "IniFile.ReadString": "READ_STRING_FROM_INI_FILE",
  "IniFile.WriteString": "WRITE_STRING_TO_INI_FILE",
};
const checked = new Set();
const errors = [];
let imports = 0;
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(dir, entry.name);
    return entry.isDirectory() ? files(item) : /\.(ts|mts)$/.test(item) ? [item] : [];
  });
}
function check(name, count, file) {
  const definition = commands.get(name);
  if (!definition || definition.attrs?.is_unsupported || definition.attrs?.is_nop) {
    errors.push(`${file}: comando indisponivel ${name}`); return;
  }
  if ((definition.input?.length ?? 0) !== count) errors.push(`${file}: ${name}: ${count} entradas; esperado ${definition.input?.length ?? 0}`);
  checked.add(name);
}
for (const file of files(path.join(project, "src", "GangWarOffline"))) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ES2020, true);
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports++;
      const target = node.moduleSpecifier.text;
      if (!target.startsWith(".") || !fs.existsSync(path.resolve(path.dirname(file), target))) errors.push(`${file}: import nao resolvido ${target}`);
    }
    if (ts.isCallExpression(node)) {
      const first = node.arguments[0];
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "call" && first && ts.isStringLiteral(first)) check(first.text, node.arguments.length - 1, file);
      const binding = bindings[node.expression.getText(source)];
      if (binding) check(binding, node.arguments.length, file);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
for (const plugin of ["SA.IniFiles.cleo", "SA.FileSystemOperations.cleo"]) {
  if (!fs.existsSync(path.join(game, "CLEO", "CLEO_PLUGINS", plugin))) errors.push(`Plugin ja requerido nao encontrado: ${plugin}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(project, "src", "GangWarOffline", "mod.json"), "utf8"));
if (!manifest.permissions.includes("fs") || manifest.entries.join(",") !== "index.ts") errors.push("Manifesto deve declarar fs e somente index.ts.");
for (const error of errors) console.error(error);
console.log(`CLEO API ${api.meta.version}: ${checked.size} comandos, ${imports} imports; ${errors.length} erros.`);
console.log([...checked].sort().join(", "));
process.exitCode = errors.length ? 1 : 0;
