import * as ts from 'typescript';

export const report = (node: ts.Node, message: string) => {
    const sourceFile = node.getSourceFile();
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart()
    );
    console.log(
        `${sourceFile.fileName} (${line + 1},${character + 1}): ${message}`
    );
};
