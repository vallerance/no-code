import * as path from 'path';
import * as ts from 'typescript';

export const getAbsolutePath = (sourceFile: ts.SourceFile): string =>
    path.resolve(process.cwd(), sourceFile.fileName);
