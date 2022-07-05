import dagre from 'dagre';
import ts from 'typescript';
import { v4 as uuidv4 } from 'uuid';

import {
    DeclaredDefinition,
    ParsedBlock,
    ParsedCallExpression,
    ParsedDefinition,
    ParsedDefinitionType,
    ParsedNodeType,
    SyntheticDefinition,
} from './compiler';
import { createNodeKey } from './source-file';

export enum FlowNodeType {
    FUNCTION = 'function',
    INPUT = 'input',
    OUTPUT = 'output',
    SUBFLOW = 'subflow',
}

// type Difference = ReturnType<typeof microdiff>[number];

export type FlowNode = {
    id: string;
    name: string;
    type: FlowNodeType | string;
    wires: string[][];
    initialize: string;
};

export type TsNodeInfo = {
    fileName: string;
    pos: number;
    end: number;
};

export type FlowNodeInfo = {
    flowNode: FlowNode;
    tsNodeInfo: TsNodeInfo;
};

export const getFlowFilename = (directory: string, name: string): string =>
    `${directory}/${name}.json`;

const FLOW_INFO_KEY = 'flow-info-48978d9a8f7d9a87';

export const getFlowInfoKey = () => FLOW_INFO_KEY;

export const NODE_DIMENSIONS = {
    width: 200,
    height: 250,
};

export const getNodeDimensions = () => NODE_DIMENSIONS;

export const calculatePosition = ({
    x,
    y,
}: dagre.Node): { x: number; y: number } => ({
    x: x + 500,
    y,
});

export const getBlockCalls = (block: ParsedBlock): ParsedCallExpression[] =>
    block.parsedNodes.reduce<ParsedCallExpression[]>(
        (calls, node) => [
            ...calls,
            ...(node.type === ParsedNodeType.CALL_EXPRESSION
                ? [node as ParsedCallExpression]
                : getBlockCalls(node as ParsedBlock)),
        ],
        []
    );

export const getNodeParms = (
    node: ParsedDefinition
): { name: string; text: string; block: ParsedBlock } => {
    if (node.type === ParsedDefinitionType.DECLARED) {
        const { declaration, definition, block } = node as DeclaredDefinition;
        return {
            name:
                declaration.name?.getText() ??
                '[[Anonymous function]] ' + uuidv4().split('-')[0],
            text: definition.getText(),
            block,
        };
    } else {
        const { nodes } = node as SyntheticDefinition;
        return {
            name:
                nodes[0]?.getText().substring(0, 50) ??
                '[[Empty Block]] ' + uuidv4().split('-')[0],
            text: nodes.map(it => it.getText()).join('\n'),
            block: {
                id: uuidv4(),
                key: createNodeKey(nodes[0]),
                type: ParsedNodeType.BLOCK,
                parsedNodes: [],
                blockNode: undefined as unknown as ts.Block,
            },
        };
    }
};

export const indexDefinitions = (
    definitions: ParsedDefinition[],
    definitionCallbacks: Record<string, ParsedDefinition[]> = {}
) => ({
    ...Object.fromEntries(
        Object.entries(definitionCallbacks).map(([_, callbacks]) =>
            callbacks.map((cb, idx) => [cb.key + '-' + idx, cb]).flat()
        )
    ),
    ...(Object.fromEntries(
        definitions
            .map((it, idx) => [
                [it.key + '-' + idx, it],
                ...(it.type === ParsedDefinitionType.DECLARED
                    ? getBlockCalls((it as DeclaredDefinition).block)
                          .map(call => call.callbacks ?? [])
                          .flat()
                          .map((cb, cbIdx) => [cb.key + '-' + cbIdx, cb])
                    : []),
            ])
            .flat()
    ) as Record<string, ParsedDefinition>),
});

export const indexDefinitionCallbacks = (
    definitions: ParsedDefinition[],
    definitionCallbacks: Record<string, ParsedDefinition[]> = {}
) => ({
    ...definitionCallbacks,
    ...(Object.fromEntries(
        definitions
            .map(def =>
                def.type === ParsedDefinitionType.DECLARED
                    ? getBlockCalls((def as DeclaredDefinition).block).map(
                          call => [
                              call.functionDefinition.key +
                                  '-' +
                                  definitions.indexOf(call.functionDefinition),
                              call.callbacks ?? [],
                          ]
                      )
                    : []
            )
            .flat()
    ) as Record<string, ParsedDefinition[]>),
});

export const createLayoutGraph = (
    definitions: ParsedDefinition[],
    firstNodeKey: string,
    callbacksByDefinition: Record<string, ParsedDefinition[]> = {}
) => {
    const definitionsByKey = indexDefinitions(definitions);
    // Create a new directed graph
    const graph = new dagre.graphlib.Graph();
    graph.setGraph({});
    graph.setDefaultEdgeLabel(function () {
        return {};
    });
    graph.setNode(firstNodeKey, { ...NODE_DIMENSIONS });
    if (definitions[0]) {
        graph.setEdge(firstNodeKey, definitions[0].key + '-' + 0);
    }
    // build graph
    for (let i = 0; i < definitions.length; i++) {
        const { key } = definitions[i];
        const callbacks = callbacksByDefinition[key];
        graph.setNode(key + '-' + i, { ...NODE_DIMENSIONS });
        if (definitions[i + 1]) {
            graph.setEdge(
                key + '-' + i,
                definitions[i + 1].key + '-' + (i + 1)
            );
        }
        callbacks?.forEach((cb, idx) => {
            definitionsByKey[cb.key + '-' + idx] = cb;
            graph.setNode(cb.key + '-' + idx, { ...NODE_DIMENSIONS });
            graph.setEdge(key + '-' + i, cb.key + '-' + idx);
        });
    }
    // calculate layout
    dagre.layout(graph);
    return graph;
};

export const randomAddress = (): string => uuidv4().split('-')[0];

export const getDeclarationName = (declaration: ts.NamedDeclaration): string =>
    declaration.name?.getText() ?? '[[Anonymous function]] ' + randomAddress();

export const getDefaultNodeName = (node: ts.Node): string =>
    node?.getText().substring(0, 50) ?? '[[Empty]] ' + randomAddress();
