import * as Case from 'case';
import * as process from 'process';
import * as ts from 'typescript';
import { v4 as uuidv4 } from 'uuid';

import { createProgram, ProgramSpec } from '../lib/bootstrap';
import {
    CompiledDefinitions,
    DeclaredDefinition,
    FunctionDefinition,
    ParsedDefinition,
    SyntheticDefinition,
} from '../lib/compiler';
import { report } from '../lib/log';
import { mapModuleToSourceFile } from '../lib/module';
import * as outputs from '../outputs';

const getCallExpressionIdentifier = (
    callExpression: ts.CallExpression
): ts.Identifier | null => {
    const expression = callExpression.expression;
    switch (expression.kind) {
        case ts.SyntaxKind.Identifier:
            return expression as ts.Identifier;
        case ts.SyntaxKind.PropertyAccessExpression: {
            const accessExpression = expression as ts.PropertyAccessExpression;
            if (accessExpression.name.kind === ts.SyntaxKind.Identifier) {
                return accessExpression.name;
            } else if (
                accessExpression.expression.kind === ts.SyntaxKind.Identifier
            ) {
                return accessExpression.expression as ts.Identifier;
            } else {
                report(
                    accessExpression,
                    `Could not find identifier for property access expression ${accessExpression
                        .getChildren()
                        .map(it => ts.SyntaxKind[it.kind])
                        .join(',')} `
                );
                return null;
            }
        }
        default:
            report(
                callExpression,
                'Could not find identifier for call expression'
            );
            return null;
    }
};

const parseImportNode = (
    importNode: ts.ImportSpecifier | ts.ImportClause
): {
    importClause: ts.ImportClause;
    name: string;
} => {
    // if we were given a specifier
    if (importNode.kind === ts.SyntaxKind.ImportSpecifier) {
        // return the clause and name for the import
        return {
            importClause: importNode.parent.parent,
            name: importNode.name.getText(),
        };
    } // else, we were given an import clause
    // if the clause is a default import or a namespaced import
    if (
        importNode.name ||
        importNode.namedBindings?.kind === ts.SyntaxKind.NamespaceImport
    ) {
        // return the clause and a default import
        return {
            importClause: importNode,
            name: 'default',
        };
    } // else, we were given an import clause that wasn't a default import
    // return the first imported name in this clause
    return {
        importClause: importNode,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        name: importNode.namedBindings!.elements[0].name.getText(),
    };
};

type ExportContainer =
    | ts.ExportDeclaration
    | ts.ExportAssignment
    | ts.ClassDeclaration
    | ts.FunctionDeclaration
    | ts.VariableStatement;

const getExportKeywordContainer = (
    exportKeyword: ts.ExportKeyword
): ExportContainer => {
    switch (exportKeyword.parent.kind) {
        case ts.SyntaxKind.SyntaxList:
            return exportKeyword.parent.parent as ExportContainer;
        default:
            return exportKeyword.parent as ExportContainer;
    }
};

type FunctionExpression = ts.FunctionExpression | ts.ArrowFunction;
const isFunctionExpression = (node: ts.Node): boolean =>
    [ts.SyntaxKind.FunctionExpression, ts.SyntaxKind.ArrowFunction].includes(
        node.kind
    );
const getVariableDeclarationFunctionExpression = (
    variableDeclaration: ts.VariableDeclaration
): FunctionExpression | undefined => {
    return variableDeclaration
        .getChildren()
        .find(isFunctionExpression) as FunctionExpression;
};

const createDefinitionKey = (definition: ts.Node): string =>
    `${definition
        .getSourceFile()
        .fileName.replaceAll(/[^A-Za-z0-9]/g, '-')
        .toLowerCase()}-${definition.pos}`;

enum PARSE_STATUS {
    PENDING,
    PARSING,
    PARSED,
    SKIPPED,
}

type ExportedDefinitions = Record<string, DeclaredDefinition>;

type ParsedSourceFile = {
    sourceFile: ts.SourceFile;
    status: PARSE_STATUS;
    exports: ExportedDefinitions;
};

type NamedDeclarations = Record<string, ts.Declaration>;

class Program {
    private programSpec: ProgramSpec;
    private sourceFiles: Record<string, ParsedSourceFile> = {};
    private functionDefinitions: CompiledDefinitions<DeclaredDefinition> = {};
    private syntheticDefinitions: CompiledDefinitions<SyntheticDefinition> = {};

    constructor(argv: string[], tsConfigName: string) {
        this.programSpec = createProgram(argv, tsConfigName);
    }

    execute() {
        this.programSpec.program
            .getSourceFiles()
            .forEach(this.parseSourceFile.bind(this));
    }

    private getNodeDeclaration(node: ts.Node): ts.Declaration | null {
        // search for a symbold for our node
        let symbol: ts.Symbol | undefined = undefined;
        // first, try getSymbolAtLocation()
        const typeChecker = this.programSpec.program.getTypeChecker();
        symbol = typeChecker.getSymbolAtLocation(node);
        // if we don't have a symbol yet
        if (!symbol) {
            // try getTypeAtLocation()
            symbol = typeChecker.getTypeAtLocation(node).symbol;
        }
        // search for a declaration for our identifier
        const declaration = symbol?.declarations?.[0];
        // if we couldn't find one
        if (!declaration) {
            // there is nothing for us to do with this call expression
            report(
                node,
                `No declaration for node \`${
                    node.getText().split('\n')[0]
                }\` found.`
            );
            return null;
        }
        report(
            declaration,
            `Found declaration for node \`${node.getText().split('\n')[0]}\`.`
        );
        return declaration;
    }

    private handleDeclarationSourceFile(
        sourceFile: ts.SourceFile
    ): ParsedSourceFile {
        // get the parsed state for our source file
        let sourceFileState = this.sourceFiles[sourceFile.fileName];

        // if the source file has not been parsed
        if (
            !sourceFileState ||
            sourceFileState.status === PARSE_STATUS.PENDING
        ) {
            // parse it now
            this.parseSourceFile(sourceFile);
            // update the state
            sourceFileState = this.sourceFiles[sourceFile.fileName];
        }

        // return our state
        return sourceFileState;
    }

    resolveDeclaration(declaration: ts.Declaration): DeclaredDefinition | null {
        // handle the source file
        const sourceFile = declaration.getSourceFile();
        const sourceFileState = this.handleDeclarationSourceFile(sourceFile);

        // if we didn't parse the source file
        if (sourceFileState.status === PARSE_STATUS.SKIPPED) {
            // then there is no declaration to return
            return null;
        }

        // if we have a parsed declaration, return it
        const existingParsedDeclaration =
            this.functionDefinitions[createDefinitionKey(declaration)];
        if (existingParsedDeclaration) {
            return existingParsedDeclaration;
        }

        // if we have successfully parsed this source file
        if (sourceFileState.status === PARSE_STATUS.PARSED) {
            // then no declaration in this file was found
            return null;
        } // else, we're probably still parsing this source file

        // if this is an import specifier
        if (
            [
                ts.SyntaxKind.ImportSpecifier,
                ts.SyntaxKind.ImportClause,
            ].includes(declaration.kind)
        ) {
            // handle the source file that this import points to
            // first, get the module specifier for this import
            const { importClause, name: importedName } = parseImportNode(
                declaration as ts.ImportSpecifier | ts.ImportClause
            );
            const moduleSpecifier = importClause.parent.moduleSpecifier;
            // get the source file for the module specifier
            const mappedSourceFile = mapModuleToSourceFile(
                moduleSpecifier,
                this.programSpec.program.getSourceFiles(),
                this.programSpec.aliasConfig
            );
            // if we couldn't find the source file
            if (!mappedSourceFile) {
                // then there is no declaration to return
                return null;
            }
            // handle the source file
            const mappedSourceFileState =
                this.handleDeclarationSourceFile(mappedSourceFile);
            // we know we aren't parsing it (because we're currently parsing
            // our given one), so it was either handled or not
            if (mappedSourceFileState.status === PARSE_STATUS.SKIPPED) {
                // there is no declaration to return
                return null;
            }
            // now, map our imported name to an export in the mapped file
            // return the mapped export
            return mappedSourceFileState.exports[importedName] ?? null;
        }

        // If we've gotten to this point, it means we've been given a
        // declaration in our current file that has not been parsed yet.
        // Let's parse it now.

        // firstly, get our function definition
        const definition =
            declaration.kind === ts.SyntaxKind.VariableDeclaration
                ? getVariableDeclarationFunctionExpression(
                      declaration as ts.VariableDeclaration
                  )
                : (declaration as FunctionDefinition);

        // if we don't have a function definition
        if (!definition) {
            throw new Error(
                `resolveDeclaration() was given a VariableDeclaration without a function definition.`
            );
        }

        // now, if this isn't a declaration that CallExpressions will reference
        if (isFunctionExpression(declaration)) {
            // attempt to find a declaration that calls will reference
            // for now, we'll just search for VariableDeclarations
            let node = declaration as ts.Node;
            while (node != sourceFile) {
                // if we run across a call expression
                if (node.kind === ts.SyntaxKind.CallExpression) {
                    // there is no variable declaration to find
                    break;
                }
                if (node.kind === ts.SyntaxKind.VariableDeclaration) {
                    // we've found our variable declaration, reassign declaration to it
                    declaration = node as ts.VariableDeclaration;
                    break;
                }
                node = node.parent;
            }
        }

        // we have a declaration that will be referenced by call expressions
        report(
            declaration,
            `Creating function definition for ${ts.SyntaxKind[definition.kind]}`
        );
        // store it in state
        const key = createDefinitionKey(declaration);
        this.functionDefinitions[key] = {
            id: uuidv4(),
            key,
            declaration,
            definition,
            calls: [],
        };

        // return the declaration we just created
        return this.functionDefinitions[key];
    }

    resolveCallExpressionCallbacks(
        callExpression: ts.CallExpression
    ): DeclaredDefinition[] {
        // first, get our calls arguments
        return (
            callExpression.arguments
                // map them to resolved definitions
                .map(arg => {
                    // search for a declaration for this arg
                    const declaration = this.getNodeDeclaration(arg);
                    // if we couldn't find one
                    if (!declaration) {
                        // this arg is not a callback
                        return null;
                    }
                    // else, this could be a callback, parse the declaration
                    switch (declaration.kind) {
                        case ts.SyntaxKind.VariableDeclaration:
                        case ts.SyntaxKind.FunctionDeclaration:
                        case ts.SyntaxKind.FunctionExpression:
                        case ts.SyntaxKind.ArrowFunction:
                        case ts.SyntaxKind.MethodDeclaration: {
                            // attempt to resolve this declaration
                            let resolved: DeclaredDefinition | null = null;
                            try {
                                resolved = this.resolveDeclaration(declaration);
                            } catch (e) {
                                // ignore errors
                            }
                            // if we were successful, return the resolved declaration
                            // else, an error should have already been reported
                            return resolved;
                        }
                        default: {
                            return null;
                        }
                    }
                })
                // filter out failed mappings
                .filter(it => it !== null) as DeclaredDefinition[]
        );
    }

    resolveCallExpressionDeclaration(
        callExpression: ts.CallExpression
    ): ParsedDefinition | null {
        // get the identifier that is being called
        const identifier = getCallExpressionIdentifier(callExpression);
        // if we couldn't find the identifier
        if (!identifier) {
            // an error should have already been reported
            return null;
        }
        // search for a declaration for our identifier
        const declaration = this.getNodeDeclaration(identifier);
        // if we couldn't find one
        if (!declaration) {
            // an error should have already been reported
            return null;
        }
        // attempt to resolve our declaration
        // if we were unable to, there is likely a good reason for this, no
        // need to report
        return this.resolveDeclaration(declaration) ?? null;
    }

    getExportKeywordDeclarations(
        exportKeyword: ts.ExportKeyword
    ): NamedDeclarations {
        const exportContainer = getExportKeywordContainer(exportKeyword);
        const typeChecker = this.programSpec.program.getTypeChecker();
        switch (exportContainer.kind) {
            // TODO: Handle `export ... from` (all variants)
            // TODO: Handle exports of imported symbols
            case ts.SyntaxKind.ExportDeclaration: {
                if (
                    !exportContainer.exportClause ||
                    exportContainer.exportClause.kind ===
                        ts.SyntaxKind.NamespaceExport
                ) {
                    report(
                        exportContainer.exportClause ?? exportContainer,
                        `Ignoring namespace (*) export.`
                    );
                    return {};
                }
                return Object.fromEntries(
                    exportContainer.exportClause.elements
                        .map(exportSpecifier => [
                            exportSpecifier.name.getText(),
                            typeChecker.getExportSpecifierLocalTargetSymbol(
                                exportSpecifier.name
                            )?.declarations?.[0],
                        ])
                        .filter(([name, declaration]) => {
                            if (declaration) {
                                return true;
                            }
                            report(
                                exportContainer.exportClause ?? exportContainer,
                                `No symbol found for export \`${name}\``
                            );
                            return false;
                        })
                );
            }
            case ts.SyntaxKind.ExportAssignment: {
                if (
                    exportContainer.expression.kind !== ts.SyntaxKind.Identifier
                ) {
                    report(
                        exportContainer.expression,
                        `Unable to find identifier for export.`
                    );
                }
                const declaration =
                    typeChecker.getExportSpecifierLocalTargetSymbol(
                        exportContainer.expression as ts.Identifier
                    )?.declarations?.[0];
                if (!declaration) {
                    report(
                        exportContainer.expression,
                        `No symbol found for export \`${exportContainer.expression.getText()}\``
                    );
                    return {};
                }
                return {
                    default: declaration,
                };
            }
            case ts.SyntaxKind.ClassDeclaration:
                report(
                    exportContainer,
                    `Ignoring export container: ${
                        ts.SyntaxKind[exportContainer.kind]
                    }.`
                );
                return {};
            case ts.SyntaxKind.FunctionDeclaration:
                return {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    [exportContainer.name!.getText()]: exportContainer,
                };
            case ts.SyntaxKind.VariableStatement:
                return Object.fromEntries(
                    exportContainer.declarationList.declarations.map(
                        declaration => [declaration.name, declaration]
                    )
                );
        }
    }

    resolveExportKeyword(exportKeyword: ts.ExportKeyword): ExportedDefinitions {
        return Object.fromEntries(
            // get all of the declarations for our export
            Object.entries(this.getExportKeywordDeclarations(exportKeyword))
                // filter out all declarations that aren't functions
                .filter(([_, declaration]) => {
                    switch (declaration.kind) {
                        case ts.SyntaxKind.FunctionDeclaration:
                        case ts.SyntaxKind.MethodDeclaration:
                            return true;
                        case ts.SyntaxKind.VariableDeclaration:
                            // filter out this variable declaration if it doesn't have a function expression
                            return !!getVariableDeclarationFunctionExpression(
                                declaration as ts.VariableDeclaration
                            );
                        default:
                            return false;
                    }
                })
                .map(([name, declaration]) => [
                    name,
                    this.resolveDeclaration(declaration),
                ])
                .filter(([name, declaration]) => {
                    if (declaration) {
                        return true;
                    }
                    report(
                        exportKeyword,
                        `Unable to resolve declaration \`${name}\``
                    );
                    return false;
                })
        );
    }

    parseSourceFile(sourceFile: ts.SourceFile) {
        // track status of our source file
        this.sourceFiles[sourceFile.fileName] = {
            sourceFile,
            status: PARSE_STATUS.PARSING,
            exports: {},
        };

        // skip node modules
        if (sourceFile.fileName.includes('node_modules')) {
            this.sourceFiles[sourceFile.fileName].status = PARSE_STATUS.SKIPPED;
            return;
        }

        report(sourceFile, 'Parsing source file.');

        // iterate though our node tree and parse each node
        (function parseNode(
            this: Program,
            node: ts.Node,
            currentDefinition: DeclaredDefinition | null = null
        ) {
            switch (node.kind) {
                case ts.SyntaxKind.CallExpression: {
                    // if we don't have a current definition
                    if (!currentDefinition) {
                        // we're ignoring calls outside of supported
                        // definitions for now
                        break;
                    }
                    // else, continue to parse this call expression
                    const callExpression = node as ts.CallExpression;
                    // first check and see if we're passing any function arguments
                    const resolvedCallbackArguments =
                        this.resolveCallExpressionCallbacks(callExpression);
                    // now, attempt to resolve our declaration
                    const resolvedDeclaration =
                        this.resolveCallExpressionDeclaration(callExpression);
                    // if we were able to
                    if (resolvedDeclaration) {
                        // add our callback arguments
                        resolvedDeclaration.callbacks =
                            resolvedCallbackArguments;
                        // add our call to our current definition
                        currentDefinition.calls.push({
                            callExpression,
                            functionDefinition: resolvedDeclaration,
                        });
                        // we're done
                        break;
                    }
                    // errors should have already been reported
                    // else, if we were passed callbacks
                    if (resolvedCallbackArguments.length) {
                        // create a synthetic function for this call expression
                        const key = createDefinitionKey(callExpression);
                        this.syntheticDefinitions[key] = {
                            id: uuidv4(),
                            key,
                            nodes: [callExpression],
                            callbacks: resolvedCallbackArguments,
                        };
                        // add our synthetic definition as a call to our current definition
                        currentDefinition.calls.push({
                            callExpression,
                            functionDefinition: this.syntheticDefinitions[key],
                        });
                    }
                    // we're done
                    break;
                }
                case ts.SyntaxKind.FunctionDeclaration:
                case ts.SyntaxKind.FunctionExpression:
                case ts.SyntaxKind.ArrowFunction:
                case ts.SyntaxKind.MethodDeclaration: {
                    // resolve this declaration
                    const resolveDeclaration = this.resolveDeclaration(
                        node as FunctionDefinition
                    );
                    // if resolved
                    if (resolveDeclaration) {
                        // we've started parsing a new definition
                        currentDefinition = resolveDeclaration;
                    }
                    break;
                }
                case ts.SyntaxKind.ExportKeyword: {
                    // get definitions for this export
                    const exportedDefinitions = this.resolveExportKeyword(
                        node as ts.ExportKeyword
                    );
                    // add to our source file exports
                    this.sourceFiles[sourceFile.fileName].exports = {
                        ...this.sourceFiles[sourceFile.fileName].exports,
                        ...exportedDefinitions,
                    };
                    break;
                }
            }

            node.forEachChild(it =>
                parseNode.call(this, it, currentDefinition)
            );
        }.call(this, sourceFile));

        // done parsing
        this.sourceFiles[sourceFile.fileName].status = PARSE_STATUS.PARSED;
    }

    output(output: string, directory: string, name: string) {
        const outputName = Case.camel(output) as keyof typeof outputs;

        outputs[outputName](
            { ...this.functionDefinitions, ...this.syntheticDefinitions },
            directory,
            name
        );
    }
}

export const run = (argv: string[]) => {
    const [project, output, outputName] = argv;
    const program = new Program([project], 'tsconfig.app.json');
    program.execute();
    program.output(output, process.cwd(), outputName);
};
