import * as fs from 'fs';
import * as ts from 'typescript';
import * as path from 'path';
import * as process from 'process';
import { globbySync } from '@vallerance/commonify-globby';
import * as normalizePath from 'normalize-path';

import { report } from '../lib/log';

type AliasConfig = {
    configFile: string;
    baseUrl: string;
    outDir: string;
    configDir: string;
    outPath: string;
    confDirParentFolderName: string;
    hasExtraModule: boolean;
    configDirInOutPath: string | null;
    relConfDirPathInOutPath: string | null;
    pathCache: PathCache;
    aliasTrie: TrieNode;
};

class PathCache {
    useCache: unknown;
    existsCache: Map<unknown, unknown>;
    absoluteCache: Map<unknown, string>;
    constructor(useCache) {
        this.useCache = useCache;
        if (useCache) {
            this.existsCache = new Map();
            this.absoluteCache = new Map();
        }
    }
    exists(path) {
        return (
            fs.existsSync(`${path}`) ||
            fs.existsSync(`${path}.js`) ||
            fs.existsSync(`${path}.jsx`) ||
            fs.existsSync(`${path}.cjs`) ||
            fs.existsSync(`${path}.mjs`) ||
            fs.existsSync(`${path}.d.ts`) ||
            fs.existsSync(`${path}.d.tsx`) ||
            fs.existsSync(`${path}.d.cts`) ||
            fs.existsSync(`${path}.d.mts`)
        );
    }
    existsResolvedAlias(path) {
        if (!this.useCache) return this.exists(path);
        if (this.existsCache.has(path)) {
            return this.existsCache.get(path);
        } else {
            const result = this.exists(path);
            this.existsCache.set(path, result);
            return result;
        }
    }
    getAAP({ basePath, aliasPath }) {
        const aliasPathParts = aliasPath
            .split('/')
            .filter(part => !part.match(/^\.$|^\s*$/));
        let aliasPathPart = aliasPathParts.shift() || '';
        let pathExists;
        while (
            !(pathExists = this.exists(path.join(basePath, aliasPathPart))) &&
            aliasPathParts.length
        ) {
            aliasPathPart = aliasPathParts.shift();
        }
        return path.join(
            basePath,
            pathExists ? aliasPathPart : '',
            aliasPathParts.join('/')
        );
    }
    getAbsoluteAliasPath(basePath, aliasPath) {
        const request = { basePath, aliasPath };
        if (!this.useCache) return this.getAAP(request);
        if (this.absoluteCache.has(request)) {
            return this.absoluteCache.get(request);
        } else {
            const result = this.getAAP(request);
            this.absoluteCache.set(request, result);
            return result;
        }
    }
}

type AliasPath = {
    path: string;
    isExtra: boolean;
    basePath: string;
};

class TrieNode {
    children: Map<unknown, TrieNode>;
    data: unknown;
    constructor() {
        this.children = new Map();
        this.data = null;
    }
    add(name, data) {
        if (name.length <= 0) return;
        const node = this.children.has(name[0])
            ? this.children.get(name[0])
            : new TrieNode();
        if (name.length == 1) {
            node.data = data;
        } else {
            node.add(name.substring(1), data);
        }
        this.children.set(name[0], node);
    }
    search(name) {
        let _a;
        if (name.length <= 0) return null;
        const node = this.children.get(name[0]);
        return node
            ? name.length == 1
                ? node.data
                : (_a = node.search(name.substring(1))) !== null &&
                  _a !== void 0
                ? _a
                : node.data
            : this.data;
    }
    static buildAliasTrie(
        config: AliasConfig,
        paths: Pick<ts.CompilerOptions, 'paths'>
    ) {
        const aliasTrie = new this();
        if (paths) {
            Object.keys(paths)
                .map(alias => {
                    return {
                        shouldPrefixMatchWildly: alias.endsWith('*'),
                        prefix: alias.replace(/\*$/, ''),
                        paths: paths[alias].map(aliasPath => {
                            aliasPath = aliasPath.replace(/\*$/, '');
                            if (path.isAbsolute(aliasPath)) {
                                aliasPath = path.relative(
                                    config.configDir,
                                    aliasPath
                                );
                            }
                            if (
                                path.normalize(aliasPath).includes('..') &&
                                !config.configDirInOutPath
                            ) {
                                const outDir = config.outPath;
                                const projectDir =
                                    config.confDirParentFolderName;
                                const posixOutput = outDir.replace(/\\/g, '/');
                                const dirs = globbySync(
                                    [
                                        `${posixOutput}/**/${projectDir}`,
                                        `!${posixOutput}/**/${projectDir}/**/${projectDir}`,
                                        `!${posixOutput}/**/node_modules`,
                                    ],
                                    {
                                        dot: true,
                                        onlyDirectories: true,
                                    }
                                );
                                config.configDirInOutPath = dirs.reduce(
                                    (prev, curr) =>
                                        prev.split('/').length >
                                        curr.split('/').length
                                            ? prev
                                            : curr,
                                    dirs[0]
                                );
                                if (config.configDirInOutPath) {
                                    config.hasExtraModule = true;
                                    const stepsbackPath = path.relative(
                                        config.configDirInOutPath,
                                        config.outPath
                                    );
                                    const splitStepBackPath =
                                        normalizePath(stepsbackPath).split('/');
                                    const nbOfStepBack =
                                        splitStepBackPath.length;
                                    const splitConfDirInOutPath =
                                        config.configDirInOutPath.split('/');
                                    let i = 1;
                                    const splitRelPath = [];
                                    while (i <= nbOfStepBack) {
                                        splitRelPath.unshift(
                                            splitConfDirInOutPath[
                                                splitConfDirInOutPath.length - i
                                            ]
                                        );
                                        i++;
                                    }
                                    config.relConfDirPathInOutPath =
                                        splitRelPath.join('/');
                                }
                            }
                            return aliasPath;
                        }),
                    };
                })
                .forEach(alias => {
                    if (alias.prefix) {
                        aliasTrie.add(
                            alias.prefix,
                            Object.assign(Object.assign({}, alias), {
                                paths: alias.paths.map(aliasPath => {
                                    const pathSpec: AliasPath = {
                                        path: aliasPath,
                                        isExtra: false,
                                        basePath: aliasPath,
                                    };
                                    if (
                                        path
                                            .normalize(pathSpec.path)
                                            .includes('..')
                                    ) {
                                        const tempBasePath = normalizePath(
                                            path.normalize(
                                                `${config.outDir}/` +
                                                    `${
                                                        config.hasExtraModule &&
                                                        config.relConfDirPathInOutPath
                                                            ? config.relConfDirPathInOutPath
                                                            : ''
                                                    }/${config.baseUrl}`
                                            )
                                        );
                                        const absoluteBasePath = normalizePath(
                                            path.normalize(
                                                `${tempBasePath}/${pathSpec.path}`
                                            )
                                        );
                                        if (
                                            config.pathCache.existsResolvedAlias(
                                                absoluteBasePath
                                            )
                                        ) {
                                            pathSpec.isExtra = false;
                                            pathSpec.basePath = tempBasePath;
                                        } else {
                                            pathSpec.isExtra = true;
                                            pathSpec.basePath =
                                                absoluteBasePath;
                                        }
                                    } else if (config.hasExtraModule) {
                                        pathSpec.isExtra = false;
                                        pathSpec.basePath = normalizePath(
                                            path.normalize(
                                                `${config.outDir}/` +
                                                    `${config.relConfDirPathInOutPath}/${config.baseUrl}`
                                            )
                                        );
                                    } else {
                                        pathSpec.basePath = config.outDir;
                                        pathSpec.isExtra = false;
                                    }
                                    return pathSpec;
                                }),
                            })
                        );
                    }
                });
        }
        return aliasTrie;
    }
}

function prepareConfig(
    tsConfig: ts.ParsedCommandLine,
    configFilePath: string
): AliasConfig {
    const {
        options: { baseUrl, outDir, paths } = {
            baseUrl: './',
            outDir: undefined,
            paths: undefined,
        },
    } = tsConfig;
    const configDir = normalizePath(path.dirname(configFilePath));
    const projectConfig = {
        configFile: configFilePath,
        baseUrl: baseUrl,
        outDir,
        configDir,
        outPath: outDir,
        confDirParentFolderName: path.basename(configDir),
        hasExtraModule: false,
        configDirInOutPath: null,
        relConfDirPathInOutPath: null,
        pathCache: new PathCache(true),
        aliasTrie: null,
    };

    projectConfig.aliasTrie = TrieNode.buildAliasTrie(projectConfig, paths);

    return projectConfig;
}

const getAbsolutePath = (sourceFile: ts.SourceFile): string =>
    path.resolve(process.cwd(), sourceFile.fileName);

const parseAliasModule = (
    moduleName: string,
    filePath: string,
    aliasConfig: AliasConfig
): string[] => {
    const file = filePath;
    const config = aliasConfig;
    const requiredModule = moduleName;

    const alias = config.aliasTrie.search(requiredModule);
    if (!alias) return [moduleName];
    const isAlias = alias.shouldPrefixMatchWildly
        ? requiredModule.startsWith(alias.prefix) &&
          requiredModule !== alias.prefix
        : requiredModule === alias.prefix ||
          requiredModule.startsWith(alias.prefix + '/');
    if (!isAlias) {
        return [moduleName];
    }
    return alias.paths.map(aliasPath => {
        // const absoluteAliasPath = config.pathCache.getAbsoluteAliasPath(
        //     aliasPath.basePath,
        //     aliasPath.path
        // );
        // let relativeAliasPath = normalizePath(
        //     path.relative(path.dirname(file), absoluteAliasPath)
        // );
        // const absoluteAliasPath = path.resolve(file, path.relative(file, aliasPath.path))
        let relativeAliasPath = path.relative(
            path.dirname(file),
            aliasPath.path
        );
        if (!relativeAliasPath.startsWith('.')) {
            relativeAliasPath = './' + relativeAliasPath;
        }
        const index = moduleName.indexOf(alias.prefix);

        return normalizePath(
            moduleName.substring(0, index) +
                relativeAliasPath +
                '/' +
                moduleName.substring(index + alias.prefix.length)
        );
    });
};

const parseRelativeModule = (
    moduleName: string,
    filePath: string
): string[] => {
    return moduleName.startsWith('.')
        ? [path.resolve(path.dirname(filePath), moduleName)]
        : [moduleName];
};

const parseExtensionlessModule = (moduleName: string): string[] => {
    return [moduleName].concat(
        ['', 'c', 'm']
            .map(prefix =>
                ['', 'x'].map(suffix =>
                    ['ts', 'js'].map(
                        base => `${moduleName}.${prefix}${base}${suffix}`
                    )
                )
            )
            .flat(3)
    );
};

const getModuleSourceFile = (
    moduleName: string,
    program: ts.Program,
    currentSourceFile: ts.SourceFile,
    aliasConfig: AliasConfig
): ts.SourceFile | null => {
    const filesByName = Object.fromEntries(
        program
            .getSourceFiles()
            .map(sourceFile => [getAbsolutePath(sourceFile), sourceFile])
    );
    const sourceFileNames = Object.keys(filesByName);
    const foundName = parseAliasModule(
        moduleName,
        currentSourceFile.fileName,
        aliasConfig
    )
        .map(parsedAliasModule =>
            parseRelativeModule(
                parsedAliasModule,
                getAbsolutePath(currentSourceFile)
            ).map(parsedRelativeModule =>
                parseExtensionlessModule(parsedRelativeModule)
            )
        )
        .flat(3)
        .find(name => sourceFileNames.includes(name));
    return foundName ? filesByName[foundName] : null;
};

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
                if (moduleSpecifier.kind != ts.SyntaxKind.StringLiteral) {
                    report(
                        moduleSpecifier,
                        'Unknown module specifier: ' +
                            getKindName(moduleSpecifier.kind)
                    );
                    break;
                }
                const anyQuote = `["']`;
                const pathStringContent = `[^"'\r\n]+`;
                const importString = `(?:${anyQuote}${pathStringContent}${anyQuote})`;
                const funcStyle = `(?:\\b(?:import|require)\\s*\\(\\s*${importString}\\s*\\))`;
                const globalStyle = `(?:\\bimport\\s+${importString})`;
                const fromStyle = `(?:\\bfrom\\s+${importString})`;
                const importRegexString = `(?:${[
                    funcStyle,
                    globalStyle,
                    fromStyle,
                ].join(`|`)})`;
                const newStringRegex = new RegExp(
                    `(?<pathWithQuotes>${anyQuote}(?<path>${pathStringContent})${anyQuote})`
                );

                const moduleName = moduleSpecifier
                    .getText()
                    .match(newStringRegex)?.groups?.path;
                const sourceFile = node.getSourceFile();
                report(
                    node,
                    `Found import declaration (${moduleName}) with node source file: 
                        ${sourceFile.fileName}`
                );
                const foundSourceFile = getModuleSourceFile(
                    moduleName,
                    program,
                    sourceFile,
                    aliasConfig
                );
                report(
                    node,
                    `Found import declaration (${moduleName}) with found source file: 
                        ${foundSourceFile?.fileName}`
                );
                const parsedAliasModuleName = parseAliasModule(
                    moduleName,
                    sourceFile.fileName,
                    aliasConfig
                )[0];
                if (parsedAliasModuleName != moduleName) {
                    report(
                        node,
                        `Parsed alias module name: ${parsedAliasModuleName}`
                    );
                }
                const parsedRelativeModuleName = parseRelativeModule(
                    parsedAliasModuleName,
                    getAbsolutePath(sourceFile)
                )[0];
                if (parsedRelativeModuleName != parsedAliasModuleName) {
                    report(
                        node,
                        `Parsed relative module name: ${parsedRelativeModuleName}`
                    );
                }
                const parsedExtensionlessModuleName = parseExtensionlessModule(
                    parsedRelativeModuleName
                )[1];
                report(
                    node,
                    `Parsed extensionless module name: ${parsedExtensionlessModuleName}`
                );
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
    //const configFile = argv[0];
    //const fileNames = argv.slice();
    const targetPath = argv[0];

    let configFilePath: string;
    //for (const fileName of fileNames) {
    // eslint-disable-next-line prefer-const
    configFilePath = ts.findConfigFile(
        //dirname(fileName),
        //dirname(targetPath),
        targetPath,
        ts.sys.fileExists,
        'tsconfig.app.json'
    );
    // if (configFilePath) {
    //     break;
    // }
    //}

    console.log(`Found config file: ${configFilePath}`);
    const configFile = ts.readConfigFile(configFilePath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configFilePath)
    );
    console.log(`Parsed config: ${JSON.stringify(parsedConfig, undefined, 2)}`);
    const compilerOptions = parsedConfig.options;

    const aliasConfig = prepareConfig(parsedConfig, configFilePath);
    //const tsconfig =
    //const tsconfig = JSON.parse(readFileSync(configFile).toString()) as ts.ParsedTsconfig;

    // const compilerOptions = {
    //     target: ts.ScriptTarget.ES5,
    //     module: ts.ModuleKind.CommonJS,
    // };
    // console.log(`Recieved file names: ${fileNames.join(', ')}`);
    // console.log(`Compiler options: ${JSON.stringify(compilerOptions)}`);

    const host = ts.createCompilerHost(compilerOptions);
    // Build a program using the set of root file names in fileNames
    const program = ts.createProgram(
        parsedConfig.fileNames,
        compilerOptions,
        host
    );
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
                compilerHost: host,
                program,
                tsConfig: parsedConfig,
                aliasConfig,
            });
        }
    })();
    //);
};
