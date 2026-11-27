import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = /\.[cm]?[jt]sx?$/;
const OWNED = /^(apps|packages|agents|scripts|deploy)\//;
const CONFIG = /(?:^|\/)tsconfig(?:\.[\w-]+)?\.json$/;
const slash = value => value.split(path.sep).join('/');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = values => [...values].sort(compare);
const within = (file, dir) => dir === '.' || file.startsWith(dir + '/');
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export function analyze(root, tracked, revision = null) {
  root = path.resolve(root);
  const relative = file => slash(path.relative(root, file));
  const files = sorted(new Set(tracked.filter(f => SOURCE.test(f) && OWNED.test(f))));
  const trackedSet = new Set(tracked);
  const sourceSet = new Set(files);
  const configs = sorted(tracked.filter(f => CONFIG.test(f) && (OWNED.test(f) || f === 'tsconfig.json')));
  const configData = new Map();
  const configurationDiagnostics = [];
  for (const file of configs) {
    const absolute = path.join(root, file);
    const read = ts.readConfigFile(absolute, ts.sys.readFile);
    if (read.error) {
      configurationDiagnostics.push({ config: file, code: read.error.code, message: ts.flattenDiagnosticMessageText(read.error.messageText, '\n') });
      continue;
    }
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(absolute), undefined, absolute);
    for (const error of parsed.errors) configurationDiagnostics.push({ config: file, code: error.code, message: ts.flattenDiagnosticMessageText(error.messageText, '\n') });
    configData.set(file, { options: parsed.options, roots: new Set(parsed.fileNames.map(relative)) });
  }
  const groups = new Map();
  const contexts = new Map();
  const missing = [];
  for (const file of files) {
    if (!existsSync(path.join(root, file))) { missing.push(file); continue; }
    const candidates = configs.filter(c => configData.has(c) && within(file, path.posix.dirname(c)) && configData.get(c).roots.has(file));
    candidates.sort((a, b) => path.posix.dirname(b).length - path.posix.dirname(a).length ||
      Number(path.posix.basename(a) !== 'tsconfig.json') - Number(path.posix.basename(b) !== 'tsconfig.json') || compare(a,b));
    // Analyze each owning configuration, not just the first matching tsconfig.
    const depth = candidates[0] ? path.posix.dirname(candidates[0]).length : -1;
    const applicable = candidates.filter(c => path.posix.dirname(c).length === depth);
    contexts.set(file, applicable);
    for (const config of applicable.length ? applicable : [null]) {
      if (!groups.has(config)) groups.set(config, []);
      groups.get(config).push(file);
    }
  }
  const manifests = sorted(tracked.filter(f => f.endsWith('/package.json') && OWNED.test(f)));
  const workspaces = manifests.map(file => {
    const manifest = JSON.parse(readFileSync(path.join(root, file), 'utf8'));
    return { path: path.posix.dirname(file), name: manifest.name ?? null };
  });
  const workspaceOf = file => workspaces.filter(w => within(file, w.path)).sort((a,b) => b.path.length-a.path.length)[0]?.name ?? null;
  const records = [];
  const edges = [];
  const unknown = [];
  const usages = [];
  for (const [config, members] of groups) {
    const options = { ...(configData.get(config)?.options ?? { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX }), noEmit: true, allowJs: true, checkJs: false, skipLibCheck: true, incremental: false, composite: false };
    const host = ts.createCompilerHost(options);
    const program = ts.createProgram(members.map(f => path.join(root, f)), options, host);
    const checker = program.getTypeChecker();
    const cache = ts.createModuleResolutionCache(root, host.getCanonicalFileName, options);
    for (const file of members) {
      const sf = program.getSourceFile(path.join(root,file));
      if (!sf) { missing.push(file); continue; }
      const moduleSymbol = checker.getSymbolAtLocation(sf);
      const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol).map(symbol => {
        const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        return { name: symbol.getName(), type: !!(target.flags & ts.SymbolFlags.Type), value: !!(target.flags & ts.SymbolFlags.Value),
          declarations: sorted(new Set((target.declarations ?? []).map(d => relative(d.getSourceFile().fileName)).filter(p => trackedSet.has(p)))) };
      }).sort((a,b) => compare(a.name,b.name)) : [];
      records.push({ path: file, workspace: workspaceOf(file), config, configs: contexts.get(file), exports });
      function add(node, expression, kind, names = [], typeOnly = false) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (!expression || !ts.isStringLiteralLike(expression)) {
          unknown.push({ from: file, config, line, kind, expression: expression?.getText(sf) ?? null });
          return;
        }
        const specifier = expression.text;
        const symbol = checker.getSymbolAtLocation(expression);
        let resolved = symbol?.declarations?.find(ts.isSourceFile)?.fileName;
        if (!resolved) resolved = ts.resolveModuleName(specifier, sf.fileName, options, host, cache).resolvedModule?.resolvedFileName;
        if (!resolved && specifier.startsWith('.')) {
          const candidate = path.resolve(path.dirname(sf.fileName), specifier);
          if (existsSync(candidate) && trackedSet.has(relative(candidate))) resolved = candidate;
        }
        let target = null;
        if (resolved) {
          const logical = relative(resolved);
          const physical = existsSync(resolved) ? relative(realpathSync(resolved)) : logical;
          target = trackedSet.has(logical) ? logical : trackedSet.has(physical) ? physical : null;
        }
        edges.push({ from: file, config, line, kind, specifier, names: sorted(names), typeOnly, target,
          status: target ? (sourceSet.has(target) ? 'source' : 'tracked-asset') : resolved ? 'resolved-outside-tracked-source' : 'unresolved' });
      }
      function visit(node) {
        if (ts.isIdentifier(node)) {
          const symbol = checker.getSymbolAtLocation(node);
          const target = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
          const declarations = (target?.declarations ?? []).filter(d => trackedSet.has(relative(d.getSourceFile().fileName)));
          // Record cross-file semantic bindings only; local references are not
          // used as evidence of a cross-module dependency.
          const bindings = declarations.map(d => {
            const origin = d.getSourceFile();
            const position = origin.getLineAndCharacterOfPosition(d.getStart(origin));
            return { file: relative(origin.fileName), line: position.line + 1, column: position.character + 1 };
          }).filter(d => d.file !== file);
          if (bindings.length) {
            const position = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            usages.push({ from: file, config, line: position.line + 1, column: position.character + 1, name: node.text,
              symbol: target.getName(), declarations: bindings.sort((a,b) => compare(a.file,b.file) || a.line-b.line || a.column-b.column) });
          }
        }
        if (ts.isImportDeclaration(node)) {
          const clause = node.importClause;
          const names = [];
          if (clause?.name) names.push('default');
          if (clause?.namedBindings) {
            if (ts.isNamespaceImport(clause.namedBindings)) names.push('*');
            else for (const element of clause.namedBindings.elements) names.push((element.propertyName ?? element.name).text);
          }
          add(node,node.moduleSpecifier,'import',names,clause?.isTypeOnly ?? false);
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
          const names = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.map(e => (e.propertyName ?? e.name).text) : ['*'];
          add(node,node.moduleSpecifier,'reexport',names,node.isTypeOnly);
        } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
          add(node,node.moduleReference.expression,'import-equals',['*'],node.isTypeOnly);
        } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
          add(node,node.argument.literal,'import-type',node.qualifier ? [node.qualifier.getText(sf)] : ['*'],true);
        } else if (ts.isCallExpression(node)) {
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node,node.arguments[0],'dynamic-import',['*']);
          else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') add(node,node.arguments[0],'require',['*']);
        }
        ts.forEachChild(node,visit);
      }
      visit(sf);
    }
  }
  records.sort((a,b) => compare(a.path,b.path) || compare(a.config ?? '',b.config ?? ''));
  const uniqueFiles = new Map();
  for (const record of records) {
    if (!uniqueFiles.has(record.path)) uniqueFiles.set(record.path, { ...record, contexts: [] });
    uniqueFiles.get(record.path).contexts.push({ config: record.config, exports: record.exports });
  }
  const inventory = [...uniqueFiles.values()];
  usages.sort((a,b) => compare(a.from,b.from) || compare(a.config ?? '',b.config ?? '') || a.line-b.line || a.column-b.column || compare(a.name,b.name));
  edges.sort((a,b) => compare(a.from,b.from) || compare(a.config ?? '',b.config ?? '') || a.line-b.line || compare(a.kind,b.kind) || compare(a.specifier,b.specifier));
  unknown.sort((a,b) => compare(a.from,b.from) || compare(a.config ?? '',b.config ?? '') || a.line-b.line || compare(a.kind,b.kind));
  return { schemaVersion: 1, revision, scope: { include: ['apps','packages','agents','scripts','deploy'], language: 'JS/TS', trackedOnly: true, excludedTrackedSourceCount: tracked.filter(f => SOURCE.test(f) && !OWNED.test(f)).length },
    workspaces, coverage: { expected: files.length, analyzed: inventory.length, missing: sorted(new Set(missing)), withoutConfig: inventory.filter(r => !r.config).map(r => r.path), configurationDiagnostics },
    files: inventory, edges, symbolUsages: usages, unknownDynamicReferences: unknown };
}

function main() {
  const root = git(process.cwd(), ['rev-parse','--show-toplevel']).trim();
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--output')) throw new Error('Usage: pnpm audit:source [--output FILE]');
  const tracked = git(root,['ls-files','-z']).split('\0').filter(Boolean);
  const revision = { commit: git(root,['rev-parse','HEAD']).trim(), dirty: !!git(root,['status','--porcelain','--untracked-files=no']).trim() };
  const report = analyze(root,tracked,revision);
  const json = JSON.stringify(report,null,2) + '\n';
  if (args.length) writeFileSync(path.resolve(args[1]),json); else process.stdout.write(json);
  if (report.coverage.missing.length) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
