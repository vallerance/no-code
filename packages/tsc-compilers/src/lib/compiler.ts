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
    declaration: ts.NamedDeclaration;
    definition: FunctionDefinition;
    calls: ParsedCallExpression[];
};

export type CompiledDefinitions = Record<string, ParsedDefinition>;
