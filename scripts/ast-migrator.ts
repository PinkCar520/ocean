import { Project, SyntaxKind, ObjectLiteralExpression, CallExpression } from 'ts-morph';
import * as path from 'path';

const project = new Project({
  tsConfigFilePath: path.join(__dirname, '../tsconfig.json'),
});

const sourceFiles = project.getSourceFiles([
  'apps/gateway/src/**/*.ts',
  'apps/cli/src/**/*.ts',
  'packages/tools-*/**/*.ts',
  'packages/mcp-*/**/*.ts',
]);

let changedFilesCount = 0;

for (const sourceFile of sourceFiles) {
  let fileChanged = false;
  let keepScanning = true;

  while (keepScanning) {
    keepScanning = false;
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    
    for (const callExpr of callExpressions) {
      const expr = callExpr.getExpression();
      if (expr.getKind() === SyntaxKind.Identifier && expr.getText() === 'tool') {
        const args = callExpr.getArguments();
        if (args.length === 1 && args[0].getKind() === SyntaxKind.ObjectLiteralExpression) {
          const obj = args[0] as ObjectLiteralExpression;
          
          const schemaProperty = obj.getProperty('inputSchema') || obj.getProperty('parameters');
          
          if (schemaProperty && schemaProperty.getKind() === SyntaxKind.PropertyAssignment) {
            const propAssignment = schemaProperty.asKindOrThrow(SyntaxKind.PropertyAssignment);
            const initializer = propAssignment.getInitializer();
            
            if (initializer) {
              const initText = initializer.getText();
              
              if (!initText.startsWith('zodSchema(') && !initText.startsWith('jsonSchema(')) {
                if (initText.includes('z.object') || initText.startsWith('z.')) {
                  propAssignment.setInitializer(`zodSchema(${initText})`);
                  
                  if (propAssignment.getName() === 'parameters') {
                    propAssignment.rename('inputSchema');
                  }
                  
                  fileChanged = true;
                  keepScanning = true;
                  break; // break the for-loop to rescan
                }
              }
            }
          }
        }
      }
    }
  }

  if (fileChanged) {
    // Add import { zodSchema } from 'ai'; if not present
    const imports = sourceFile.getImportDeclarations();
    const aiImport = imports.find(i => i.getModuleSpecifierValue() === 'ai');
    
    if (aiImport) {
      const namedImports = aiImport.getNamedImports();
      if (!namedImports.some(ni => ni.getName() === 'zodSchema')) {
        aiImport.addNamedImport('zodSchema');
      }
    } else {
      sourceFile.addImportDeclaration({
        namedImports: ['zodSchema'],
        moduleSpecifier: 'ai',
      });
    }

    console.log(`Modified: ${sourceFile.getFilePath()}`);
    sourceFile.saveSync();
    changedFilesCount++;
  }
}

console.log(`\nMigration complete. Modified ${changedFilesCount} files.`);
