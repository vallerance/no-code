import { globbySync } from '@vallerance/commonify-globby';
import normalizePath from 'normalize-path';
import * as path from 'path';
import * as ts from 'typescript';

import type { AliasConfig } from './config';

type AliasPath = {
    path: string;
    isExtra: boolean;
    basePath: string;
};

export class TrieNode {
    children: Map<unknown, TrieNode>;
    data: unknown;
    constructor() {
        this.children = new Map();
        this.data = null;
    }
    add(name: string, data: unknown) {
        if (name.length <= 0) return;
        const node = this.children.has(name[0])
            ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              this.children.get(name[0])!
            : new TrieNode();
        if (name.length == 1) {
            node.data = data;
        } else {
            node.add(name.substring(1), data);
        }
        this.children.set(name[0], node);
    }
    search(name: string): unknown {
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
        paths: ts.CompilerOptions['paths']
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
                                const posixOutput = outDir?.replace(/\\/g, '/');
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
                                        config.outPath ?? ''
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
                                        pathSpec.basePath =
                                            config.outDir ?? './';
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
