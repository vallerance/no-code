// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-nocheck
import * as ts from 'typescript';

import { createProgram } from '../lib/bootstrap';
import { report } from '../lib/log';
import { getModuleSpecifierName, mapModuleToSourceFile } from '../lib/module';
import { getAbsolutePath } from '../lib/source-file';
import { AliasConfig } from '../lib/tsc-alias/config';

export function parseSourceFile({
    sourceFile,
    program,
    aliasConfig,
}: ParseInstruction) {
    const compilerOptions = program.getCompilerOptions();
    const typeChecker = program.getTypeChecker();

    // // get the "func" identifier in the import declaration
    // const importDec = sourceFile.statements[0] as ts.ImportDeclaration;
    // if (importDec) {
    //     const importClause = importDec.importClause;
    //     if (importClause) {
    //         const funcIdent = importClause.name!;

    //         if (funcIdent) {
    //             // follow the symbols to the function declaration
    //             const funcImportSymbol =
    //                 typeChecker.getSymbolAtLocation(funcIdent)!;
    //             const funcDecSymbol =
    //                 typeChecker.getAliasedSymbol(funcImportSymbol);
    //             const declarations = funcDecSymbol.getDeclarations();
    //             if (declarations) {
    //                 const funcDec = declarations[0];

    //                 report(
    //                     funcDec,
    //                     'Imported function declaration: ' +
    //                         JSON.stringify(funcDec)
    //                 );
    //             } else {
    //                 report(funcIdent, 'Symbol declarations returned undefined');
    //             }
    //         } else {
    //             report(
    //                 importClause,
    //                 'No identity found for import declaration'
    //             );
    //         }
    //     } else {
    //         report(importDec, 'No import clause found.');
    //     }
    // } else {
    //     report(sourceFile, 'No statements found.');
    // }

    delintNode(sourceFile);

    function delintNode(node: ts.Node) {
        switch (node.kind) {
            case ts.SyntaxKind.ImportDeclaration: {
                const moduleSpecifier = (node as ts.ImportDeclaration)
                    .moduleSpecifier;
                // if (moduleSpecifier.kind != ts.SyntaxKind.StringLiteral) {
                //     report(
                //         moduleSpecifier,
                //         'Unknown module specifier: ' +
                //             getKindName(moduleSpecifier.kind)
                //     );
                //     break;
                // }
                // const anyQuote = `["']`;
                // const pathStringContent = `[^"'\r\n]+`;
                // const importString = `(?:${anyQuote}${pathStringContent}${anyQuote})`;
                // const funcStyle = `(?:\\b(?:import|require)\\s*\\(\\s*${importString}\\s*\\))`;
                // const globalStyle = `(?:\\bimport\\s+${importString})`;
                // const fromStyle = `(?:\\bfrom\\s+${importString})`;
                // const importRegexString = `(?:${[
                //     funcStyle,
                //     globalStyle,
                //     fromStyle,
                // ].join(`|`)})`;
                // const newStringRegex = new RegExp(
                //     `(?<pathWithQuotes>${anyQuote}(?<path>${pathStringContent})${anyQuote})`
                // );

                // const moduleName = moduleSpecifier
                //     .getText()
                //     .match(newStringRegex)?.groups?.path;
                // const sourceFile = node.getSourceFile();
                // report(
                //     node,
                //     `Found import declaration (${moduleName}) with node source file:
                //         ${sourceFile.fileName}`
                // );
                const foundSourceFile = mapModuleToSourceFile(
                    moduleSpecifier,
                    program.getSourceFiles(),
                    aliasConfig
                );
                report(
                    node,
                    `Found import declaration (${getModuleSpecifierName(
                        moduleSpecifier
                    )}) with found source file: 
                        ${foundSourceFile?.fileName}`
                );
                // const parsedAliasModuleName = parseAliasModule(
                //     moduleName,
                //     sourceFile.fileName,
                //     aliasConfig
                // )[0];
                // if (parsedAliasModuleName != moduleName) {
                //     report(
                //         node,
                //         `Parsed alias module name: ${parsedAliasModuleName}`
                //     );
                // }
                // const parsedRelativeModuleName = parseRelativeModule(
                //     parsedAliasModuleName,
                //     getAbsolutePath(sourceFile)
                // )[0];
                // if (parsedRelativeModuleName != parsedAliasModuleName) {
                //     report(
                //         node,
                //         `Parsed relative module name: ${parsedRelativeModuleName}`
                //     );
                // }
                // const parsedExtensionlessModuleName = parseExtensionlessModule(
                //     parsedRelativeModuleName
                // )[1];
                // report(
                //     node,
                //     `Parsed extensionless module name: ${parsedExtensionlessModuleName}`
                // );
                // console.log('Resolving: ', moduleName, sourceFile.fileName);
                // const resolvedModule = ts.resolveModuleName(
                //     moduleName,
                //     sourceFile.fileName,
                //     compilerOptions,
                //     host
                // );
                // console.log(
                //     'Resolved module: ' +
                //         JSON.stringify(resolvedModule, undefined, 2)
                // );

                // follow the symbols to the function declaration
                let importAliasedSymbol;

                try {
                    importAliasedSymbol = typeChecker.getAliasedSymbol(
                        typeChecker.getSymbolAtLocation(
                            (node as ts.ImportDeclaration).importClause.name
                        )
                    );
                    report(
                        importAliasedSymbol,
                        'Imported aliased symbol: ' +
                            JSON.stringify(importAliasedSymbol)
                    );
                } catch (e) {
                    /*ignore*/
                }
                if (importAliasedSymbol?.getDeclarations()) {
                    const funcDec = importAliasedSymbol.getDeclarations()[0];

                    report(
                        funcDec,
                        'Imported function declaration: ' +
                            JSON.stringify(funcDec)
                    );
                }
                break;
            }
            case ts.SyntaxKind.ExportAssignment:
            case ts.SyntaxKind.ExportDeclaration: {
                const identifiers = (() => {
                    switch (node.kind) {
                        case ts.SyntaxKind.ExportAssignment: {
                            const thirdChild = node.getChildAt(2);
                            return thirdChild.kind === ts.SyntaxKind.Identifier
                                ? [thirdChild]
                                : [];
                        }
                        case ts.SyntaxKind.ExportDeclaration: {
                            // const syntaxList = ;
                            // if (syntaxList) {
                            //     // report(
                            //     //     syntaxList,
                            //     //     `Found syntaxList: ${syntaxList.getText()} with ${
                            //     //         (syntaxList).length
                            //     //     } children (${
                            //     //         getChildrenForEach(syntaxList).filter(
                            //     //             it =>
                            //     //                 it.kind ===
                            //     //                 ts.SyntaxKind.ExportSpecifier
                            //     //         ).length
                            //     //     } identifiers).`
                            //     // );
                            // }
                            return (
                                node
                                    .getChildAt(1)
                                    ?.getChildAt(1)
                                    ?.getChildren()
                                    ?.filter(
                                        it =>
                                            it.kind ===
                                            ts.SyntaxKind.ExportSpecifier
                                    )
                                    .map(it => it.getChildAt(0)) ?? []
                            );
                        }
                    }
                })();
                report(
                    node,
                    `Found export declaration with ${identifiers.length} identifiers.`
                );
                const exportSpecifiers = identifiers.map(it =>
                    typeChecker.getExportSpecifierLocalTargetSymbol(
                        it as ts.Identifier
                    )
                );
                exportSpecifiers.forEach(specifier => {
                    if (specifier) {
                        report(
                            node,
                            `Found symbol specifier \`${specifier.name}\` for export`
                        );
                    }
                    specifier.getDeclarations().forEach(declaration => {
                        report(
                            declaration,
                            `Found declaration \`${
                                ts.SyntaxKind[declaration.kind]
                            }\` for export`
                        );
                    });
                });
                break;
            }
            case ts.SyntaxKind.CallExpression: {
                const identifier = (() => {
                    const child = node.getChildAt(0);
                    switch (child.kind) {
                        case ts.SyntaxKind.Identifier:
                            return child;
                        case ts.SyntaxKind.PropertyAccessExpression:
                            if (
                                child.getChildAt(0).kind ===
                                ts.SyntaxKind.Identifier
                            ) {
                                return child.getChildAt(0);
                            } else if (
                                child.getChildAt(2)?.kind ===
                                ts.SyntaxKind.Identifier
                            ) {
                                return child.getChildAt(2);
                            } else {
                                report(
                                    child,
                                    'Could not find identifier for property access expression ' +
                                        getChildrenForEach(child)
                                            .map(it => getKindName(it.kind))
                                            .join(',') +
                                        ' ' +
                                        child
                                            .getChildren()
                                            .map(it => getKindName(it.kind))
                                            .join(',')
                                );
                                return null;
                            }
                        default:
                            report(
                                node,
                                'Could not find identifier for call expression'
                            );
                            return null;
                    }
                })();
                report(
                    node,
                    `Call expression found with identifier: ${identifier?.getText()}`
                );

                // let declarationSourceFileName =
                //     'error-retrieving-declaration-source-file';
                // try {
                //     declarationSourceFileName = typeChecker
                //         .getSymbolAtLocation(identifier)
                //         ?.declarations[0].getSourceFile().fileName;
                // } catch (e) {
                //     /*ignore*/
                // }
                const firstDeclaration =
                    typeChecker.getSymbolAtLocation(identifier)
                        ?.declarations[0];
                if (firstDeclaration) {
                    report(firstDeclaration, `Found identifier declaration.`);
                } else {
                    report(node, `No identifier declaration found.`);
                }
                const secondIdentifier = node.getChildAt(0)?.getChildAt(2);
                if (secondIdentifier?.kind === ts.SyntaxKind.Identifier) {
                    report(
                        secondIdentifier,
                        `Found second identifier (${secondIdentifier?.getText()}).`
                    );
                    const secondDeclaration =
                        typeChecker.getSymbolAtLocation(secondIdentifier)
                            ?.declarations[0];
                    if (secondDeclaration) {
                        report(
                            secondDeclaration,
                            `Found second identifier declaration.`
                        );
                    } else {
                        report(node, `No identifier declaration found.`);
                    }
                }
                break;
            }
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.FunctionExpression:
            case ts.SyntaxKind.ArrowFunction:
            case ts.SyntaxKind.MethodDeclaration:
                report(
                    node,
                    `Function definition found: ${getKindName(node.kind)}`
                );
                report(node, `Function code: ${node.getText()}`);
                break;
            default:
                break;
            // case ts.SyntaxKind.ForStatement:
            // case ts.SyntaxKind.ForInStatement:
            // case ts.SyntaxKind.WhileStatement:
            // case ts.SyntaxKind.DoStatement:
            //     if (
            //         (node as ts.IterationStatement).statement.kind !==
            //         ts.SyntaxKind.Block
            //     ) {
            //         report(
            //             node,
            //             "A looping statement's contents should be wrapped in a block body."
            //         );
            //     }
            //     break;

            // case ts.SyntaxKind.IfStatement: {
            //     const ifStatement = node as ts.IfStatement;
            //     if (ifStatement.thenStatement.kind !== ts.SyntaxKind.Block) {
            //         report(
            //             ifStatement.thenStatement,
            //             "An if statement's contents should be wrapped in a block body."
            //         );
            //     }
            //     if (
            //         ifStatement.elseStatement &&
            //         ifStatement.elseStatement.kind !== ts.SyntaxKind.Block &&
            //         ifStatement.elseStatement.kind !== ts.SyntaxKind.IfStatement
            //     ) {
            //         report(
            //             ifStatement.elseStatement,
            //             "An else statement's contents should be wrapped in a block body."
            //         );
            //     }
            //     break;
            // }

            // case ts.SyntaxKind.BinaryExpression: {
            //     const op = (node as ts.BinaryExpression).operatorToken.kind;
            //     if (
            //         op === ts.SyntaxKind.EqualsEqualsToken ||
            //         op === ts.SyntaxKind.ExclamationEqualsToken
            //     ) {
            //         report(node, "Use '===' and '!=='.");
            //     }
            //     break;
            // }
        }

        ts.forEachChild(node, delintNode);
    }

    function getChildrenForEach(node: ts.Node): ts.Node[] {
        const children = [];
        node.forEachChild(it => children.push(it));
        return children;
    }

    function getKindName(kind: ts.SyntaxKind): string {
        return Object.entries(ts.SyntaxKind).find(it => it[1] === kind)?.[0];
    }
}

type ParseInstruction = {
    sourceFile: ts.SourceFile;
    compilerHost: ts.CompilerHost;
    program: ts.Program;
    tsConfig: ts.ParsedCommandLine;
    aliasConfig: AliasConfig;
};

export const run = (argv: string[]) => {
    // //const configFile = argv[0];
    // //const fileNames = argv.slice();
    // const targetPath = argv[0];

    // let configFilePath: string;
    // //for (const fileName of fileNames) {
    // // eslint-disable-next-line prefer-const
    // configFilePath = ts.findConfigFile(
    //     //dirname(fileName),
    //     //dirname(targetPath),
    //     targetPath,
    //     ts.sys.fileExists,
    //     'tsconfig.app.json'
    // );
    // // if (configFilePath) {
    // //     break;
    // // }
    // //}

    // console.log(`Found config file: ${configFilePath}`);
    // const configFile = ts.readConfigFile(configFilePath, ts.sys.readFile);
    // const parsedConfig = ts.parseJsonConfigFileContent(
    //     configFile.config,
    //     ts.sys,
    //     path.dirname(configFilePath)
    // );
    // console.log(`Parsed config: ${JSON.stringify(parsedConfig, undefined, 2)}`);
    // const compilerOptions = parsedConfig.options;

    // const aliasConfig = prepareConfig(parsedConfig, configFilePath);
    // //const tsconfig =
    // //const tsconfig = JSON.parse(readFileSync(configFile).toString()) as ts.ParsedTsconfig;

    // // const compilerOptions = {
    // //     target: ts.ScriptTarget.ES5,
    // //     module: ts.ModuleKind.CommonJS,
    // // };
    // // console.log(`Recieved file names: ${fileNames.join(', ')}`);
    // // console.log(`Compiler options: ${JSON.stringify(compilerOptions)}`);

    // const host = ts.createCompilerHost(compilerOptions);
    // // Build a program using the set of root file names in fileNames
    // const program = ts.createProgram(
    //     parsedConfig.fileNames,
    //     compilerOptions,
    //     host
    // );
    // for (const sourceFile of program.getSourceFiles()) {
    //     console.log('Received source file: ' + sourceFile.fileName);
    // }

    // console.log('Timeout:');
    // timeoutSet(() => {
    //     /*empty*/
    // }, 1);

    // console.log('Wait: ');
    // wait(1);

    // console.log('Wait for:');
    //waitFor(

    const { program, compilerHost, tsConfig, aliasConfig } = createProgram(
        argv,
        'tsconfig.app.json'
    );

    (async () => {
        // Visit every sourceFile in the program
        for (const sourceFile of program.getSourceFiles()) {
            if (sourceFile.fileName.includes('node_modules')) {
                continue;
            }
            console.log('Parsing: ' + getAbsolutePath(sourceFile));
            // const runFile: SingleFileReplacer =
            //     await prepareSingleFileReplaceTscAliasPaths({
            //         configFile: configFilePath,
            //     });

            // const newContents = runFile({
            //     fileContents: sourceFile.getText(),
            //     filePath: sourceFile.fileName,
            // });
            // console.log(newContents.split('\n').slice(0, 10).join('\n'));
            //.replace(/\.([mc])?ts(x)?$/, '.$1js$2');

            // const replacedSourceFile = ts.createSourceFile(
            //     sourceFile.fileName,
            //     newContents,
            //     compilerOptions.target,
            //     /*setParentNodes */ true
            // );

            //parseSourceFile(replacedSourceFile, host, program);
            parseSourceFile({
                sourceFile,
                compilerHost,
                program,
                tsConfig,
                aliasConfig,
            });
        }
    })();
    //);
};
