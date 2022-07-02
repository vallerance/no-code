import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { CompiledDefinitions, ParsedDefinition } from '../../lib/compiler';
import {
    calculatePosition,
    createLayoutGraph,
    getBlockCalls,
    getNodeParms,
    indexDefinitions,
} from '../../lib/node-red';

const LINK_IN_KEY = 'LINK_IN_24819';

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

        const graph = createLayoutGraph(definitions, LINK_IN_KEY);

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
                    const { name, text, block } = getNodeParms(
                        definitionsByKey[key]
                    );
                    const calls = getBlockCalls(block);
                    const node = graph.node(key);
                    const successors = graph.successors(
                        key
                    ) as unknown as string[];

                    const base = {
                        id: key,
                        z: flowId,
                        name,
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
                              func: text,
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
