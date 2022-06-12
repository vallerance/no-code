import dagre from 'dagre';
import { v4 as uuidv4 } from 'uuid';

import {
    DeclaredDefinition,
    ParsedDefinition,
    SyntheticDefinition,
} from './compiler';

const NODE_DIMENSIONS = {
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

export const getNodeParms = (
    node: ParsedDefinition
): { name: string; text: string; calls: ParsedDefinition[] } => {
    if ('definition' in node) {
        const { declaration, definition, calls } = node as DeclaredDefinition;
        return {
            name:
                declaration.name?.getText() ??
                '[[Anonymous function]] ' + uuidv4().split('-')[0],
            text: definition.getText(),
            calls: calls.map(it => it.functionDefinition),
        };
    } else {
        const { nodes } = node as SyntheticDefinition;
        return {
            name:
                nodes[0]?.getText().substring(0, 50) ??
                '[[Empty Block]] ' + uuidv4().split('-')[0],
            text: nodes.map(it => it.getText()).join(''),
            calls: [],
        };
    }
};

export const indexDefinitions = (definitions: ParsedDefinition[]) =>
    Object.fromEntries(
        definitions
            .map((it, idx) => [
                [it.key + '-' + idx, it],
                ...(it.callbacks?.map((cb, idx) => [cb.key + '-' + idx, cb]) ??
                    []),
            ])
            .flat(1)
    ) as Record<string, ParsedDefinition>;

export const createLayoutGraph = (
    definitions: ParsedDefinition[],
    firstNodeKey: string
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
        const { key, callbacks } = definitions[i];
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
