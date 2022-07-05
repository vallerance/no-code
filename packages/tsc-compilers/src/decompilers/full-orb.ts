import * as Case from 'case';
import * as process from 'process';
import * as tm from 'ts-morph';
import * as ts from 'typescript';

import * as inputs from '../inputs';
import { createMorphProject } from '../lib/bootstrap';
import {
    DeleteOperation,
    InsertOperation,
    MoveOperation,
    Operation,
    OperationType,
    ReplaceOperation,
} from '../lib/decompiler';
import { report } from '../lib/log';

class Program {
    private project: tm.Project;
    private operations: Operation[] = [];

    constructor(argv: string[], tsConfigName: string) {
        this.project = createMorphProject(argv, tsConfigName);
    }

    input(input: string, directory: string, name: string) {
        const inputName = Case.camel(input) as keyof typeof inputs;

        this.operations = inputs[inputName](directory, name);
    }

    execute() {
        this.operations.forEach(operation => this.peformOperation(operation));
        this.project.saveSync();
    }

    private getSourceFile(fileName: string): tm.SourceFile {
        const sourceFile = this.project.getSourceFile(fileName);
        if (!sourceFile) {
            throw new Error(`Could not find file ${fileName}`);
        }
        return sourceFile;
    }

    private operationHandlers: Record<
        OperationType,
        (operation: Operation) => void
    > = {
        INSERT: (operation: Operation) => {
            const insertOperation = operation as InsertOperation;
            const { fileName, pos, text } = insertOperation;
            const sourceFile = this.getSourceFile(fileName);
            sourceFile.insertText(pos, text);

            report(
                sourceFile.compilerNode as unknown as ts.Node,
                `Inserted text at pos ${pos}: ${text}.`
            );
        },
        DELETE: (operation: Operation) => {
            const deleteOperation = operation as DeleteOperation;
            const { fileName, pos, end } = deleteOperation;
            const sourceFile = this.getSourceFile(fileName);
            sourceFile.removeText(pos, end);

            report(
                sourceFile.compilerNode as unknown as ts.Node,
                `Removed text from pos ${pos}.`
            );
        },
        REPLACE: (operation: Operation) => {
            const replaceOperation = operation as ReplaceOperation;
            const { fileName, pos, end, text } = replaceOperation;
            const sourceFile = this.getSourceFile(fileName);
            sourceFile.replaceText([pos, end], text);

            report(
                sourceFile.compilerNode as unknown as ts.Node,
                `Replaced text at pos ${pos} with: ${text}.`
            );
        },
        MOVE: (operation: Operation) => {
            const moveOperation = operation as MoveOperation;
            const { fileName, pos, end, to } = moveOperation;
            const sourceFile = this.getSourceFile(fileName);
            const text = sourceFile.getText().substring(pos, end);
            sourceFile.removeText(pos, end);
            sourceFile.insertText(to, text);

            report(
                sourceFile.compilerNode as unknown as ts.Node,
                `Moved text from pos ${pos} to ${to}: ${text}.`
            );
        },
    };

    private peformOperation(operation: Operation) {
        this.operationHandlers[operation.type](operation);
    }
}

export const run = (argv: string[]) => {
    const [project, input, inputName] = argv;
    const program = new Program([project], 'tsconfig.app.json');
    program.input(input, process.cwd(), inputName);
    program.execute();
};
