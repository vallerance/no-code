import * as Case from 'case';
import * as compilers from './compilers';

console.log(process.argv);

const compilerName = Case.camel(process.argv[2]);

compilers[compilerName](process.argv.slice(3));

process.on('exit', (options, exitCode) => {
    if (exitCode === 0) {
        console.log('exit');
    }
});
