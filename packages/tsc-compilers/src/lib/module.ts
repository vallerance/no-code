import normalizePath from 'normalize-path';
import * as path from 'path';
import * as ts from 'typescript';

import { getAbsolutePath } from './source-file';
import { AliasConfig } from './tsc-alias/config';

export class ModuleParsers {
    static alias(
        moduleName: string,
        sourceFile: ts.SourceFile,
        aliasConfig: AliasConfig
    ): string[] {
        const file = sourceFile.fileName;
        const config = aliasConfig;
        const requiredModule = moduleName;

        const alias = config.aliasTrie.search(requiredModule) as {
            shouldPrefixMatchWildly: boolean;
            prefix: string;
            paths: { path: string }[];
        };
        if (!alias) return [moduleName];
        const isAlias = alias.shouldPrefixMatchWildly
            ? requiredModule.startsWith(alias.prefix) &&
              requiredModule !== alias.prefix
            : requiredModule === alias.prefix ||
              requiredModule.startsWith(alias.prefix + '/');
        if (!isAlias) {
            return [moduleName];
        }
        return alias.paths.map((aliasPath: { path: string }) => {
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
    }

    static relative(moduleName: string, sourceFile: ts.SourceFile): string[] {
        const filePath = getAbsolutePath(sourceFile);
        return moduleName.startsWith('.')
            ? [path.resolve(path.dirname(filePath), moduleName)]
            : [moduleName];
    }

    static extensionless(
        moduleName: string,
        _sourceFile: ts.SourceFile
    ): string[] {
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
    }
}

declare class SyntaxError {
    public message?: string;
    public fileName?: string;
    public lineNumber?: number;

    constructor(message?: string, fileName?: string, lineNumber?: number);
}

export const getModuleSpecifierName = (
    moduleSpecifier: ts.Expression
): string => {
    if (moduleSpecifier.kind != ts.SyntaxKind.StringLiteral) {
        const sourceFile = moduleSpecifier.getSourceFile();
        const path = getAbsolutePath(sourceFile);
        const lineNumber = sourceFile.getLineAndCharacterOfPosition(
            moduleSpecifier.getStart()
        ).line;
        throw new SyntaxError(
            'Module specifier must be a string',
            path,
            lineNumber
        );
    }
    const anyQuote = `["']`;
    const pathStringContent = `[^"'\r\n]+`;
    const newStringRegex = new RegExp(
        `(?<pathWithQuotes>${anyQuote}(?<path>${pathStringContent})${anyQuote})`
    );
    const moduleName = moduleSpecifier.getText().match(newStringRegex)
        ?.groups?.path;
    if (!moduleName) {
        throw new Error(
            `Unable to parse module name from specifier: ${moduleSpecifier.getText()}`
        );
    }
    return moduleName;
};

export const mapModuleToSourceFile = (
    moduleSpecifier: ts.Expression,
    candidateSourceFiles: readonly ts.SourceFile[],
    aliasConfig: AliasConfig
): ts.SourceFile | null => {
    const moduleName = getModuleSpecifierName(moduleSpecifier);
    const currentSourceFile = moduleSpecifier.getSourceFile();
    const filesByName = Object.fromEntries(
        candidateSourceFiles.map(sourceFile => [
            getAbsolutePath(sourceFile),
            sourceFile,
        ])
    );
    const sourceFileNames = Object.keys(filesByName);
    const foundName = ModuleParsers.alias(
        moduleName,
        currentSourceFile,
        aliasConfig
    )
        .map(parsedAliasModule =>
            ModuleParsers.relative(parsedAliasModule, currentSourceFile).map(
                parsedRelativeModule =>
                    ModuleParsers.extensionless(
                        parsedRelativeModule,
                        currentSourceFile
                    )
            )
        )
        .flat(3)
        .find(name => sourceFileNames.includes(name));
    return foundName ? filesByName[foundName] : null;
};
