import * as path from 'path';
import * as ts from 'typescript';

import { AliasConfig, prepareConfig } from './tsc-alias/config';

export type ProgramSpec = {
    compilerHost: ts.CompilerHost;
    program: ts.Program;
    tsConfig: ts.ParsedCommandLine;
    aliasConfig: AliasConfig;
};

export const createProgram = (
    argv: string[],
    configName: string
): ProgramSpec => {
    const configFilePath = ts.findConfigFile(
        argv[0],
        ts.sys.fileExists,
        configName
    );

    if (!configFilePath) {
        throw new Error(
            `Unable to find config file: ${configName} from path: ${argv[0]}`
        );
    }

    console.log(`Found config file: ${configFilePath}`);

    const configFile = ts.readConfigFile(configFilePath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configFilePath)
    );

    console.log(`Parsed config: ${JSON.stringify(parsedConfig, undefined, 2)}`);

    const aliasConfig = prepareConfig(parsedConfig, configFilePath);

    const host = ts.createCompilerHost(parsedConfig.options, true);
    // Build a program using the set of root file names in fileNames
    const program = ts.createProgram(
        parsedConfig.fileNames,
        parsedConfig.options,
        host
    );

    return { tsConfig: parsedConfig, program, compilerHost: host, aliasConfig };
};
