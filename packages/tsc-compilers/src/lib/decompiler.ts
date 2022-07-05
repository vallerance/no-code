export enum OperationType {
    INSERT = 'INSERT',
    DELETE = 'DELETE',
    REPLACE = 'REPLACE',
    MOVE = 'MOVE',
}

type BaseOperation = {
    id: string;
    type: OperationType;
    fileName: string;
};

export type InsertOperation = BaseOperation & {
    type: OperationType.INSERT;
    pos: number;
    text: string;
};

export type DeleteOperation = BaseOperation & {
    type: OperationType.DELETE;
    pos: number;
    end: number;
};

export type ReplaceOperation = BaseOperation & {
    type: OperationType.REPLACE;
    pos: number;
    end: number;
    text: string;
};

export type MoveOperation = BaseOperation & {
    type: OperationType.MOVE;
    pos: number;
    end: number;
    to: number;
};

export type Operation =
    | InsertOperation
    | DeleteOperation
    | ReplaceOperation
    | MoveOperation;
