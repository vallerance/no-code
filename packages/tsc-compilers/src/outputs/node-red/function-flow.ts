import dagre, { Node } from 'dagre';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { CompiledDefinitions, ParsedDefinition } from '../../lib/compiler';

const LINK_IN_KEY = 'LINK_IN_24819';
const NODE_DIMENSIONS = {
    width: 20,
    height: 250,
};

const calculatePosition = ({ x, y }: Node): { x: number; y: number } => ({
    x: x + 500,
    y,
});

export default (
    functionDefinitions: CompiledDefinitions,
    directory: string,
    name: string
) => {
    const flowNodes: Record<string, unknown>[] = [];

    type FlowParams = {
        name: string;
        parent: FlowParams | null;
    };

    (function outputDefinitions(
        { name, parent }: FlowParams,
        definitions: ParsedDefinition[]
    ): string {
        const definitionsByKey = Object.fromEntries(
            definitions.map((it, idx) => [it.key + '-' + idx, it])
        );
        // Create a new directed graph
        const graph = new dagre.graphlib.Graph();
        graph.setGraph({});
        graph.setDefaultEdgeLabel(function () {
            return {};
        });
        graph.setNode(LINK_IN_KEY, { ...NODE_DIMENSIONS });
        if (definitions[0]) {
            graph.setEdge(LINK_IN_KEY, definitions[0].key + '-' + 0);
        }
        // build graph
        for (let i = 0; i < definitions.length; i++) {
            const { key } = definitions[i];
            graph.setNode(key + '-' + i, { ...NODE_DIMENSIONS });
            if (definitions[i + 1]) {
                graph.setEdge(
                    key + '-' + i,
                    definitions[i + 1].key + '-' + (i + 1)
                );
            }
        }
        // calculate layout
        dagre.layout(graph);
        const linkNode = graph.node(LINK_IN_KEY);

        // create flow id
        const flowId = uuidv4();
        const linkId = uuidv4();
        // create flow
        flowNodes.push(
            {
                id: flowId,
                type: 'tab',
                label: name,
                disabled: false,
                info: '',
                env: [],
            },
            {
                id: linkId,
                type: 'link in',
                z: flowId,
                name: parent?.name,
                links: [],
                ...calculatePosition(linkNode),
                wires: [graph.successors(LINK_IN_KEY) as unknown as string[]],
            },
            ...graph
                .nodes()
                .filter(it => it !== LINK_IN_KEY)
                .map(key => {
                    const { declaration, definition, calls } =
                        definitionsByKey[key];
                    const node = graph.node(key);
                    const successors = graph.successors(
                        key
                    ) as unknown as string[];

                    const base = {
                        id: key,
                        z: flowId,
                        name:
                            declaration.name?.getText() ??
                            '[[Anonymous function]]',
                        ...calculatePosition(node),
                        wires: [successors],
                    };
                    return calls.length
                        ? {
                              ...base,
                              type: 'link call',
                              links: [
                                  outputDefinitions(
                                      {
                                          name: base.name,
                                          parent: { name, parent },
                                      },
                                      calls.map(it => it.functionDefinition)
                                  ),
                              ],
                              timeout: '30',
                          }
                        : {
                              ...base,
                              type: 'function',
                              func: definition.getText(),
                              outputs: 1,
                              noerr: 0,
                              initialize: '',
                              finalize: '',
                              libs: [],
                          };
                })
        );

        return linkId;
    })(
        {
            name,
            parent: { name: '[[Root]]', parent: null },
        },
        Object.values(functionDefinitions)
    );
    // output flow
    fs.writeFileSync(
        `${directory}/${name}.json`,
        JSON.stringify(flowNodes, undefined, 2)
    );
};
