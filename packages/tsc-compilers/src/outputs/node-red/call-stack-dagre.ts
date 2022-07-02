import dagre from 'dagre';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { CompiledDefinitions, DeclaredDefinition } from '../../lib/compiler';
import { getBlockCalls } from '../../lib/node-red';

export default (
    functionDefinitions: CompiledDefinitions,
    directory: string,
    name: string
) => {
    // Create a new directed graph
    const graph = new dagre.graphlib.Graph();
    graph.setGraph({});
    graph.setDefaultEdgeLabel(function () {
        return {};
    });
    // build graph
    for (const { key, block } of Object.values(functionDefinitions).filter(
        it => 'definition' in it
    ) as DeclaredDefinition[]) {
        graph.setNode(key, {
            width: 20,
            height: 250,
        });

        getBlockCalls(block).forEach(it =>
            graph.setEdge(key, it.functionDefinition.key)
        );
    }
    // calculate layout
    dagre.layout(graph);
    // create flow id
    const flowId = uuidv4();
    // create flow
    const flow = [
        {
            id: flowId,
            type: 'tab',
            label: name,
            disabled: false,
            info: '',
            env: [],
        },
        ...graph.nodes().map(key => {
            const { id, declaration, definition, block } = functionDefinitions[
                key
            ] as DeclaredDefinition;
            const { x, y } = graph.node(key);
            return {
                id,
                type: 'function',
                z: flowId,
                name: declaration.name?.getText() ?? '[[Anonymous function]]',
                func: definition.getText(),
                outputs: 1,
                noerr: 0,
                initialize: '',
                finalize: '',
                libs: [],
                x: y,
                y: x + 100,
                wires: [getBlockCalls(block).map(it => it.id)],
            };
        }),
    ];
    // output flow
    fs.writeFileSync(
        `${directory}/${name}.json`,
        JSON.stringify(flow, undefined, 2)
    );
};
