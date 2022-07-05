import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { Operation, OperationType } from '../../lib/decompiler';
import {
    FlowNode,
    FlowNodeInfo,
    getFlowFilename,
    getFlowInfoKey,
} from '../../lib/node-red';

export default (directory: string, name: string): Operation[] => {
    // parse our json file
    const flowNodes = JSON.parse(
        fs.readFileSync(getFlowFilename(directory, name)).toString()
    ) as FlowNode[];
    // get our node info
    const nodeInfo = (
        flowNodes.splice(
            flowNodes.findIndex(flow => flow.id === getFlowInfoKey()),
            1
        )[0] as FlowNode & { info: Record<string, FlowNodeInfo> }
    ).info;

    // track wire changes
    // NOTE: This algorithm only supports a single wire leading to each node
    const addedWires: Record<string, string> = {};
    const removedWires: string[] = [];
    // track new nodes
    const newNodes: string[] = [];
    // index our flow nodes
    const nodesById: Record<string, FlowNode> = Object.fromEntries(
        flowNodes.map(node => {
            // track any old or new wires
            const previous = nodeInfo[node.id]?.flowNode;
            const next = node;
            // if this is a new node
            if (!previous) {
                // track it
                newNodes.push(node.id);
            }
            Object.assign(
                addedWires,
                Object.fromEntries(
                    next.wires?.[0]
                        ?.filter(it => !previous?.wires[0]?.includes(it))
                        .map(it => [it, node.id]) ?? []
                )
            );
            removedWires.push(
                ...(previous?.wires[0]?.filter(
                    it => !next.wires?.[0]?.includes(it)
                ) ?? [])
            );

            return [node.id, node];
        })
    );

    const getNewPredecessorId = (node: FlowNode): string | undefined => {
        const predecessorId = addedWires[node.id];
        // if we couldn't find a wire for ourselves
        if (!predecessorId) {
            // this isn't a fatal error, it could just mean this was an orphan node
            console.warn('Ingoring new orphaned node: ', node.name);
            return;
        } // else, we have our predecessor
        return predecessorId;
    };

    const populateNewNodeInfo = (node: FlowNode): boolean => {
        // get our new position by first getting our new wire
        const predecessorId = getNewPredecessorId(nodesById[node.id]);
        if (!predecessorId) {
            flowNodes.splice(flowNodes.indexOf(node), 1);
            return false;
        }
        // if our predecessor doesn't have node info
        if (!nodeInfo[predecessorId]) {
            // try and populate it now
            populateNewNodeInfo(nodesById[predecessorId]);
        }
        if (!nodeInfo[predecessorId]) {
            console.warn(
                'Unable to find predecessor info for: ' + predecessorId
            );
            flowNodes.splice(flowNodes.indexOf(node), 1);
            return false;
        }
        // our position should start immediately after our predecessor
        const { fileName, end } = nodeInfo[predecessorId].tsNodeInfo;
        // add ts info for this node
        nodeInfo[node.id] = {
            flowNode: null as unknown as FlowNodeInfo['flowNode'],
            tsNodeInfo: {
                fileName,
                pos: end + 1,
                end: end + 1 + (node.initialize?.length ?? 0),
            },
        };
        return true;
    };
    // loop our new nodes
    newNodes.forEach(nodeId => {
        const node = nodesById[nodeId];
        // first pad it with some newlines
        if (node.initialize) {
            node.initialize = '\n' + node.initialize + '\n';
        }
        // ensure it has node info populated, if it doesn't
        if (!populateNewNodeInfo(node)) {
            // it should have been removed, let's stop working on it
            return;
        }
        // get our predecessor
        const predecessorId = getNewPredecessorId(node);
        if (!predecessorId) {
            return;
        }
        // add our wires onto our predecessor's to avoid extra move operations
        const { wires: predecessorWires } = nodeInfo[predecessorId].flowNode;
        if (!predecessorWires.length) {
            predecessorWires.push([]);
        }
        predecessorWires[0].push(...node.wires[0]);
        // also, remove them from removedWires
        node.wires[0]
            ?.filter(it => removedWires.includes(it))
            .forEach(it => removedWires.splice(removedWires.indexOf(it), 1));
    });

    // find every node that was deleted by searching the old wires
    removedWires.forEach(wire => {
        // if this node no longer exists
        if (!nodesById[wire]) {
            const { fileName, pos, end } = nodeInfo[wire].tsNodeInfo;
            // create a delete op for it
            operations.push({
                id: uuidv4(),
                type: OperationType.DELETE,
                fileName,
                pos,
                end,
            });
        }
    });

    // track new nodes
    // const newNodes: Record<string, FlowNode> = {};
    // loop our flow nodes, build list of operations
    const operations: Operation[] = [];
    flowNodes.forEach(node => {
        const previous = nodeInfo[node.id].flowNode;
        const next = node;
        const { fileName, pos, end } = nodeInfo[node.id].tsNodeInfo;

        // if we have no previous state
        if (!previous) {
            // then this is a new node
            // create an insert operation for our node
            operations.push({
                id: uuidv4(),
                type: OperationType.INSERT,
                fileName,
                pos,
                text: node.initialize,
            });
            // that's all we need to do
            return;
        }

        // if our wire was removed but not added back in anywhere
        if (removedWires.includes(node.id) && !addedWires[node.id]) {
            // then this is a delete operation
            operations.push({
                id: uuidv4(),
                type: OperationType.DELETE,
                fileName,
                pos,
                end,
            });
            // that's all
            return;
        }

        // check and see if our node has moved
        const moved = addedWires[node.id] && removedWires.includes(node.id);

        // if our call has changed
        if (
            previous.initialize != next.initialize &&
            typeof next.initialize !== 'undefined'
        ) {
            // if we have no wire changes
            if (!addedWires[node.id] && !removedWires.includes(node.id)) {
                // then this is a replace operation
                // create a replace operation for our node
                operations.push({
                    id: uuidv4(),
                    type: OperationType.REPLACE,
                    fileName,
                    pos,
                    end,
                    text: next.initialize,
                });
                // that's all we need to do
                return;
            }

            // if we've also moved
            if (moved) {
                // then we should just delete our previous node and insert our new node
                const predecessorId = getNewPredecessorId(node);
                if (!predecessorId) {
                    return;
                }
                // our position should start immediately after our predecessor
                const nextPos = nodeInfo[predecessorId].tsNodeInfo.end + 1;
                operations.push({
                    id: uuidv4(),
                    type: OperationType.DELETE,
                    fileName,
                    pos,
                    end,
                });
                operations.push({
                    id: uuidv4(),
                    type: OperationType.INSERT,
                    fileName,
                    pos: nextPos,
                    text: node.initialize,
                });
                // that's all we need to do
                return;
            }
        }

        // our call hasn't changed, but if we've moved
        if (moved) {
            // then this is a move operation
            const predecessorId = getNewPredecessorId(node);
            if (!predecessorId) {
                return;
            }
            // our position should start immediately after our predecessor
            const nextPos = nodeInfo[predecessorId].tsNodeInfo.end + 1;
            operations.push({
                id: uuidv4(),
                type: OperationType.MOVE,
                fileName,
                pos,
                end,
                to: nextPos,
            });
        }
    });

    return operations;
};
