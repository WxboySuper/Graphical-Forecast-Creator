import { parse } from '@babel/parser';

/** Returns static module dependencies, excluding dynamic imports and preload metadata. */
export const getEagerModuleImports = (source) => {
  const ast = parse(source, { sourceType: 'module' });
  return ast.program.body
    .filter((node) => ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type))
    .flatMap((node) => node.source ? [node.source.value] : []);
};
