import * as Case from 'case';
import * as compilers from './compilers';
import * as decompilers from './decompilers';

console.log(process.argv);

process.on('exit', (options: unknown, exitCode: number) => {
    if (exitCode === 0) {
        console.log('exit');
    }
});

enum Command {
    COMPILE = 'COMPILE',
    DECOMPILE = 'DECOMPILE',
}

const commands: Record<Command, () => void> = {
    COMPILE: () => {
        const compilerName = Case.camel(
            process.argv[3]
        ) as keyof typeof compilers;

        compilers[compilerName](process.argv.slice(4));
    },
    DECOMPILE: () => {
        const decompilerName = Case.camel(
            process.argv[3]
        ) as keyof typeof decompilers;

        decompilers[decompilerName](process.argv.slice(4));
    },
};

const command = Case.constant(process.argv[2]) as Command;
if (!(command in commands)) {
    throw new Error(`Unknown command: ${command}`);
}
commands[command]();
