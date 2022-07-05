import * as path from 'path';
import * as ts from 'typescript';

export const getAbsolutePath = (sourceFile: ts.SourceFile): string =>
    path.resolve(process.cwd(), sourceFile.fileName);

export const createNodeKey = (node: ts.Node): string =>
    `${node
        .getSourceFile()
        .fileName.replaceAll(/[^A-Za-z0-9]/g, '-')
        .toLowerCase()}-${node.pos}`;

export const forceAddNodeToFile = (fakeNode: ts.Node, realNode: ts.Node) => {
    const { pos, end, parent } = realNode;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    fakeNode.pos = pos;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    fakeNode.end = end;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    fakeNode.parent = parent;
};
