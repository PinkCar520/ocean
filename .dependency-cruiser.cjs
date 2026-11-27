// Initial rules describe the intended host-independent boundary.
module.exports = {
  forbidden: [
    {
      name: 'core-cannot-import-host',
      severity: 'error',
      from: { path: '^packages/shared/core/' },
      to: { path: '^apps/' }
    },
    {
      name: 'contracts-cannot-import-runtime',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: { path: '^(apps/|packages/(ui|shared|tools)/|agents/)' }
    }
  ],
  options: {
    doNotFollow: { path: '(^|/)node_modules/' },
    exclude: { path: '(^|/)(node_modules|dist|build|out|\\.next|coverage)/' },
    tsPreCompilationDeps: true
  }
};
