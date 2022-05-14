import normalizePath from 'normalize-path';
import * as path from 'path';
import * as ts from 'typescript';

import { PathCache } from './path';
import { TrieNode } from './trie-node';

export type AliasConfig = {
    configFile: string;
    baseUrl: string;
    outDir: string | undefined;
    configDir: string;
    outPath: string | undefined;
    confDirParentFolderName: string;
    hasExtraModule: boolean;
    configDirInOutPath: string | null;
    relConfDirPathInOutPath: string | null;
    pathCache: PathCache;
    aliasTrie: TrieNode;
};

export function prepareConfig(
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
    const projectConfig: AliasConfig = {
        configFile: configFilePath,
        baseUrl: baseUrl ?? './',
        outDir,
        configDir,
        outPath: outDir,
        confDirParentFolderName: path.basename(configDir),
        hasExtraModule: false,
        configDirInOutPath: null,
        relConfDirPathInOutPath: null,
        pathCache: new PathCache(true),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        aliasTrie: null!,
    };

    projectConfig.aliasTrie = TrieNode.buildAliasTrie(projectConfig, paths);

    return projectConfig;
}
