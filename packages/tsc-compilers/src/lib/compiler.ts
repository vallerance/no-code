import * as ts from 'typescript';

export type ParsedCallExpression = {
    callExpression: ts.CallExpression;
    functionDefinition: ParsedDefinition;
};

export type FunctionDefinition =
    | ts.FunctionDeclaration
    | ts.FunctionExpression
    | ts.ArrowFunction
    | ts.MethodDeclaration;

export type ParsedDefinition = {
    id: string;
    key: string;
    callbacks?: ParsedDefinition[];
};

export type DeclaredDefinition = ParsedDefinition & {
    calls: ParsedCallExpression[];
    declaration: ts.NamedDeclaration;
    definition: FunctionDefinition;
};

export type SyntheticDefinition = ParsedDefinition & {
    nodes: ts.Node[];
};

export type CompiledDefinitions<T extends ParsedDefinition = ParsedDefinition> =
    Record<string, T>;
