import dagre from 'dagre';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { CompiledDefinitions, ParsedDefinition } from '../../lib/compiler';
import {
    calculatePosition,
    createLayoutGraph,
    getNodeDimensions,
    getNodeParms,
    indexDefinitions,
} from '../../lib/node-red';

const INPUT_KEY = 'INPUT_4823958';

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
        const definitionsByKey = indexDefinitions(definitions);

        const graph = createLayoutGraph(definitions, INPUT_KEY);

        const inputNode = graph.node(INPUT_KEY);

        // create flow id
        const subflowId = uuidv4();
        // create flow
        flowNodes.push(
            {
                id: subflowId,
                type: 'subflow',
                name,
                info: '',
                in: [
                    {
                        ...calculatePosition(inputNode),
                        wires: (
                            graph.successors(INPUT_KEY) as unknown as string[]
                        ).map(it => ({
                            id: it + '-' + subflowId,
                        })),
                    },
                ],
                out: [],
            },
            ...graph
                .nodes()
                .filter(it => it !== INPUT_KEY)
                .map(key => {
                    const { name, text, calls } = getNodeParms(
                        definitionsByKey[key]
                    );
                    const node = graph.node(key);
                    const successors = graph.successors(
                        key
                    ) as unknown as string[];
                    let base = {
                        id: key + '-' + subflowId,
                        z: subflowId,
                        name,
                        ...calculatePosition(node),
                        wires: [successors.map(it => it + '-' + subflowId)],
                    };

                    const parentKey = graph.predecessors(
                        key
                    )?.[0] as unknown as string;
                    if (
                        definitionsByKey[parentKey ?? '']?.callbacks?.find(
                            it =>
                                it.key === key.split('-').slice(0, -1).join('-')
                        )
                    ) {
                        base = {
                            ...base,
                            ...calculatePosition({
                                y: graph.node(parentKey).y,
                                x:
                                    graph.node(parentKey).x +
                                    getNodeDimensions().width,
                            } as unknown as dagre.Node),
                        };
                    }

                    return calls.length
                        ? {
                              ...base,
                              type:
                                  'subflow:' +
                                  outputDefinitions(
                                      {
                                          name: base.name,
                                          parent: { name, parent },
                                      },
                                      calls
                                  ),
                          }
                        : {
                              ...base,
                              type: 'function',
                              func: text,
                              outputs: 1,
                              noerr: 0,
                              initialize: '',
                              finalize: '',
                              libs: [],
                          };
                })
        );

        return subflowId;
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
