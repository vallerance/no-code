import * as path from 'path';
import { Project } from 'ts-morph';
import * as ts from 'typescript';

import { AliasConfig, prepareConfig } from './tsc-alias/config';

const findConfigFile = (configDir: string, configName: string): string => {
    const configFilePath = ts.findConfigFile(
        configDir,
        ts.sys.fileExists,
        configName
    );

    if (!configFilePath) {
        throw new Error(
            `Unable to find config file: ${configName} from path: ${configDir}`
        );
    }

    return configFilePath;
};

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
    const configFilePath = findConfigFile(argv[0], configName);
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

export const createMorphProject = (
    argv: string[],
    configName: string
): Project => {
    const configFilePath = findConfigFile(argv[0], configName);
    console.log(`Found config file: ${configFilePath}`);

    const project = new Project({
        tsConfigFilePath: configFilePath,
    });

    return project;
};
