import * as ts from 'typescript';

export enum ParsedNodeType {
    CALL_EXPRESSION,
    BLOCK,
}

export type BaseParsedNode = {
    id: string;
    key: string;
    type: ParsedNodeType;
    parentNode?: ParsedBlock;
};

export type ParsedCallExpression = BaseParsedNode & {
    callExpression: ts.CallExpression;
    functionDefinition: ParsedDefinition;
    callbacks: DeclaredDefinition[];
};

export type ParsedBlock = BaseParsedNode & {
    blockNode: ts.Block;
    parsedNodes: ParsedNode[];
};

export type ParsedNode = ParsedCallExpression | ParsedBlock;

export type CallableDefinition = ts.FunctionExpression | ts.ArrowFunction;

export type FunctionDefinition =
    | ts.FunctionDeclaration
    | ts.FunctionExpression
    | ts.ArrowFunction
    | ts.MethodDeclaration;

export enum ParsedDefinitionType {
    DECLARED,
    SYNTHETIC,
}

export type ParsedDefinition = {
    id: string;
    key: string;
    type: ParsedDefinitionType;
};

export type DeclaredDefinition = ParsedDefinition & {
    block: ParsedBlock;
    declaration: ts.NamedDeclaration;
    definition: FunctionDefinition;
};

export type SyntheticDefinition = ParsedDefinition & {
    nodes: ts.Node[];
};

export type CompiledDefinitions<T extends ParsedDefinition = ParsedDefinition> =
    Record<string, T>;
