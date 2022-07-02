import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { CompiledDefinitions, DeclaredDefinition } from '../../lib/compiler';
import { getBlockCalls } from '../../lib/node-red';

export default (
    functionDefinitions: CompiledDefinitions,
    directory: string,
    name: string
) => {
    // create layer
    const flowId = uuidv4();
    // increment y value
    let yPos = 100;
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
        ...(
            Object.entries(functionDefinitions).filter(
                ([_, it]) => 'definition' in it
            ) as [string, DeclaredDefinition][]
        ).map(([_, { id, declaration, definition, block }]) => ({
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
            x: 160,
            y: (yPos += 50),
            wires: [getBlockCalls(block).map(it => it.id)],
        })),
    ];
    // output flow
    fs.writeFileSync(
        `${directory}/${name}.json`,
        JSON.stringify(flow, undefined, 2)
    );
};
