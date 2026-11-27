import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

export function analyze(root, tracked, revision = null, runtimeConfig = { entries: [] }) {
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
    const owning = candidates.filter(c => path.posix.dirname(c).length === depth);
    const explicitConsumers = configs.filter(c => configData.has(c) && !within(file,path.posix.dirname(c)) && configData.get(c).roots.has(file));
    const applicable = [...new Set([...owning,...explicitConsumers])];
    contexts.set(file, owning);
    for (const config of applicable.length ? applicable : [null]) {
      if (!groups.has(config)) groups.set(config, []);
      groups.get(config).push(file);
    }
  }
  const manifests = sorted(tracked.filter(f => f.endsWith('/package.json') && OWNED.test(f)));
  const packageData = manifests.map(file => {
    const manifest = JSON.parse(readFileSync(path.join(root, file), 'utf8'));
    return { path: path.posix.dirname(file), name: manifest.name ?? null, manifest };
  });
  const workspaces = packageData.map(({path,name}) => ({path,name}));
  const runtimeEntries = [];
  const runtimeDiagnostics = [];
  for (const entry of runtimeConfig.entries) {
    if (typeof entry.path !== 'string' || typeof entry.evidence !== 'string' || !entry.kind) throw new Error('Invalid runtime entry');
    const present = trackedSet.has(entry.path) && existsSync(path.join(root,entry.path));
    const evidencePresent = trackedSet.has(entry.evidence) && existsSync(path.join(root,entry.evidence));
    runtimeEntries.push({ ...entry, status: present && evidencePresent ? 'declared' : 'missing' });
    if (!present || !evidencePresent) runtimeDiagnostics.push({ path: entry.path, evidence: entry.evidence, present, evidencePresent });
  }
  // Next.js file-system routing is not represented by ordinary imports.
  for (const pkg of packageData.filter(p => p.manifest.dependencies?.next || p.manifest.devDependencies?.next)) {
    const appRoots = [pkg.path+'/app/',pkg.path+'/src/app/'];
    const pagesRoots = [pkg.path+'/pages/',pkg.path+'/src/pages/'];
    for (const file of files.filter(f => within(f,pkg.path))) {
      const appRoute = appRoots.some(prefix => file.startsWith(prefix)) && /(?:^|\/)(page|layout|route|loading|error|not-found|template|default|global-error|global-not-found|forbidden|unauthorized|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.[jt]sx?$/.test(file);
      const pageRoute = pagesRoots.some(prefix => file.startsWith(prefix)) && !/\.d\.ts$/.test(file);
      const special = [pkg.path,pkg.path+'/src'].some(dir => path.posix.dirname(file) === dir) && /^(middleware|proxy|instrumentation|instrumentation-client|next\.config)\.[cm]?[jt]sx?$/.test(path.posix.basename(file));
      if (appRoute || pageRoute || special) runtimeEntries.push({ path: file, kind: 'next-convention', evidence: pkg.path+'/package.json', status: 'convention-candidate' });
    }
  }
  runtimeEntries.sort((a,b) => compare(a.path,b.path) || compare(a.kind,b.kind));
  // Generated JS and declarations often do not exist in a clean checkout.
  // Use explicit compiler rootDir/outDir to project package targets back to
  // tracked sources; distinguish this evidence from compiler resolution.
  const outputSources = new Map();
  for (const [config, data] of configData) {
    const { rootDir, outDir } = data.options;
    if (!rootDir || !outDir) continue;
    for (const file of data.roots) {
      if (!sourceSet.has(file) || /\.d\.[cm]?ts$/.test(file) || !within(file, path.posix.dirname(config))) continue;
      const rel = slash(path.relative(rootDir, path.join(root,file)));
      if (rel.startsWith('../') || rel === '..') continue;
      const extensions = rel.endsWith('.mts') ? ['.mjs','.d.mts'] : rel.endsWith('.cts') ? ['.cjs','.d.cts'] : ['.js','.d.ts'];
      for (const ext of extensions) {
        const output = relative(path.join(outDir,rel.replace(/\.[cm]?[jt]sx?$/,ext)));
        if (!outputSources.has(output)) outputSources.set(output,new Set());
        outputSources.get(output).add(file);
      }
    }
  }
  const projectTarget = target => {
    const normalized = path.posix.normalize(target);
    if (trackedSet.has(normalized)) return [normalized];
    const variants = [normalized, normalized+'.ts',normalized+'.tsx',normalized+'.js',normalized+'/index.ts',normalized+'/index.tsx'];
    return sorted(new Set([...variants.filter(p => trackedSet.has(p)),...(outputSources.get(normalized) ?? [])]));
  };
  function leaves(value, condition = []) {
    if (typeof value === 'string') return [{ value, condition }];
    if (Array.isArray(value)) return value.flatMap((v,i) => leaves(v,[...condition,String(i)]));
    if (value && typeof value === 'object') return Object.entries(value).flatMap(([k,v]) => leaves(v,[...condition,k]));
    return [];
  }
  const entryPoints = [];
  for (const pkg of packageData) {
    const {manifest} = pkg;
    for (const field of ['main','module','types','typings','bin','exports','imports']) {
      for (const leaf of leaves(manifest[field])) {
        const spec = leaf.value;
        const local = spec.startsWith('./') || (field !== 'exports' && field !== 'imports' && !path.isAbsolute(spec));
        const candidates = local && !spec.includes('*') ? projectTarget(path.posix.join(pkg.path,spec)) : [];
        entryPoints.push({ workspace: pkg.name, packagePath: pkg.path, field, condition: leaf.condition, target: spec, candidates,
          status: spec.includes('*') ? 'pattern' : candidates.length === 1 ? 'mapped' : candidates.length > 1 ? 'ambiguous' : 'unmapped' });
      }
    }
  }
  function packageCandidates(specifier) {
    const pkg = packageData.filter(p => p.name && (specifier === p.name || specifier.startsWith(p.name+'/'))).sort((a,b) => b.name.length-a.name.length)[0];
    if (!pkg) return [];
    const subpath = specifier === pkg.name ? '.' : '.'+specifier.slice(pkg.name.length);
    const exports = pkg.manifest.exports;
    let targets = [];
    if (exports !== undefined) {
      if (exports && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some(k => k.startsWith('.'))) {
        if (Object.hasOwn(exports,subpath)) targets = leaves(exports[subpath]).map(l => l.value);
        else {
          const patterns = Object.keys(exports).filter(k => k.includes('*')).map(key => {
            const [prefix,suffix] = key.split('*');
            return { key,prefix,suffix };
          }).filter(p => subpath.startsWith(p.prefix) && subpath.endsWith(p.suffix) && subpath.length >= p.prefix.length+p.suffix.length)
            .sort((a,b) => b.prefix.length-a.prefix.length || b.suffix.length-a.suffix.length || compare(a.key,b.key));
          if (patterns.length) {
            const p = patterns[0], match = subpath.slice(p.prefix.length,subpath.length-p.suffix.length);
            targets = leaves(exports[p.key]).map(l => l.value.replaceAll('*',match));
          }
        }
      } else if (subpath === '.') targets = leaves(exports).map(l => l.value);
    } else if (subpath === '.') targets = [pkg.manifest.types,pkg.manifest.typings,pkg.manifest.main,pkg.manifest.module].filter(v => typeof v === 'string');
    return sorted(new Set(targets.filter(v => !path.isAbsolute(v) && !v.startsWith('../')).flatMap(v => projectTarget(path.posix.join(pkg.path,v)))));
  }
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
    // Compiler programs also load tracked sources transitively, including
    // shared UI through Web/Desktop aliases. Inventory those contexts instead
    // of only scanning the project's explicitly owned root files.
    const loaded = new Map();
    for (const sf of program.getSourceFiles()) {
      let file = relative(sf.fileName);
      if (!sourceSet.has(file) && sf.fileName.includes(path.sep+'node_modules'+path.sep) && existsSync(sf.fileName)) file = relative(realpathSync(sf.fileName));
      if (sourceSet.has(file) && !loaded.has(file)) loaded.set(file,sf);
    }
    for (const file of members) if (!loaded.has(file)) missing.push(file);
    for (const [file,sf] of [...loaded].sort(([a],[b])=>compare(a,b))) {
      const moduleSymbol = checker.getSymbolAtLocation(sf);
      const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol).map(symbol => {
        const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        return { name: symbol.getName(), type: !!(target.flags & ts.SymbolFlags.Type), value: !!(target.flags & ts.SymbolFlags.Value),
          declarations: sorted(new Set((target.declarations ?? []).map(d => relative(d.getSourceFile().fileName)).filter(p => trackedSet.has(p)))) };
      }).sort((a,b) => compare(a.name,b.name)) : [];
      records.push({ path: file, workspace: workspaceOf(file), config, configs: contexts.get(file), sha256: createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex'), exports });
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
        const candidates = target ? [] : sorted(new Set([
          ...(resolved ? projectTarget(relative(resolved)) : []),
          ...packageCandidates(specifier)
        ]));
        edges.push({ from: file, config, line, kind, specifier, names: sorted(names), typeOnly, target, sourceCandidates: candidates,
          status: target ? (sourceSet.has(target) ? 'source' : 'tracked-asset') : candidates.length === 1 ? 'projected-source' : candidates.length > 1 ? 'ambiguous-source' : resolved ? 'resolved-outside-tracked-source' : 'unresolved' });
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
          else if (ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(sf) === 'require' && node.expression.name.text === 'resolve') add(node,node.arguments[0],'require-resolve',['*']);
          else if (ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(sf) === 'import.meta' && ['glob','globEager'].includes(node.expression.name.text)) {
            const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
            unknown.push({ from: file, config, line, kind: 'import-meta-glob', expression: node.arguments[0]?.getText(sf) ?? null });
          }
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
  const inventory = [...uniqueFiles.values()].map(record => {
    const owning = contexts.get(record.path) ?? [];
    const primary = record.contexts.find(c=>owning.includes(c.config)) ?? record.contexts.find(c=>c.config!==null) ?? record.contexts[0];
    return {...record,config:primary.config,exports:primary.exports,configs:sorted(new Set(record.contexts.map(c=>c.config).filter(c=>c!==null))),owningConfigs:owning};
  });
  usages.sort((a,b) => compare(a.from,b.from) || compare(a.config ?? '',b.config ?? '') || a.line-b.line || a.column-b.column || compare(a.name,b.name));
  edges.sort((a,b) => compare(a.from,b.from) || compare(a.config ?? '',b.config ?? '') || a.line-b.line || compare(a.kind,b.kind) || compare(a.specifier,b.specifier));
  unknown.sort((a,b) => compare(a.from,b.from) || compare(a.config ?? '',b.config ?? '') || a.line-b.line || compare(a.kind,b.kind));
  const unanalysedSources = sorted(tracked.filter(f => !sourceSet.has(f) && /\.(swift|py|sh|bash|zsh|m|mm|h|c|cc|cpp|rs|go|java|kt|rb|css|scss|html|[cm]?[jt]sx?)$/.test(f)))
    .map(file => ({ path: file, reason: file.startsWith('restored-src/') ? 'reference-source' : 'unsupported-language-or-scope' }));
  return { schemaVersion: 1, revision, scope: { include: ['apps','packages','agents','scripts','deploy'], language: 'JS/TS', trackedOnly: true, excludedTrackedSourceCount: tracked.filter(f => SOURCE.test(f) && !OWNED.test(f)).length },
    workspaces, entryPoints, runtimeEntries, runtimeDiagnostics, unanalysedSources, coverage: { expected: files.length, analyzed: inventory.length, missing: sorted(new Set(missing)), withoutConfig: inventory.filter(r => !r.configs.length).map(r => r.path), configurationDiagnostics },
    files: inventory, edges, symbolUsages: usages, unknownDynamicReferences: unknown };
}

function main() {
  const root = git(process.cwd(), ['rev-parse','--show-toplevel']).trim();
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--output')) throw new Error('Usage: pnpm audit:source [--output FILE]');
  const tracked = git(root,['ls-files','-z']).split('\0').filter(Boolean);
  const revision = { commit: git(root,['rev-parse','HEAD']).trim(), dirty: !!git(root,['status','--porcelain','--untracked-files=no']).trim() };
  const runtimeConfig = JSON.parse(readFileSync(new URL('./runtime-entries.json',import.meta.url),'utf8'));
  const report = analyze(root,tracked,revision,runtimeConfig);
  const json = JSON.stringify(report,null,2) + '\n';
  if (args.length) writeFileSync(path.resolve(args[1]),json); else process.stdout.write(json);
  if (report.coverage.missing.length || report.runtimeDiagnostics.length) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
