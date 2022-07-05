import dagre from 'dagre';
import * as fs from 'fs';
import ts from 'typescript';
import { v4 as uuidv4 } from 'uuid';

import {
    CallableDefinition,
    CompiledDefinitions,
    DeclaredDefinition,
    ParsedBlock,
    ParsedCallExpression,
    ParsedDefinitionType,
    ParsedNode,
    ParsedNodeType,
    SyntheticDefinition,
} from '../../lib/compiler';
import {
    calculatePosition,
    FlowNodeInfo,
    getBlockCalls,
    getDeclarationName,
    getDefaultNodeName,
    getFlowFilename,
    getFlowInfoKey,
    getNodeDimensions,
    NODE_DIMENSIONS,
    TsNodeInfo,
} from '../../lib/node-red';
import { createNodeKey, forceAddNodeToFile } from '../../lib/source-file';

const INPUT_KEY = 'INPUT_4823958';

export default (
    functionDefinitions: CompiledDefinitions,
    directory: string,
    name: string
) => {
    const flowNodes: Record<string, unknown>[] = [];
    const subflows: Record<string, string> = {};
    // store node info in flow
    const nodeInfo: Record<string, FlowNodeInfo> = {};
    const flowKey = uuidv4();
    flowNodes.push(
        {
            id: flowKey,
            type: 'tab',
            label: name,
        },
        {
            id: getFlowInfoKey(),
            type: 'comment',
            name: 'nodeInfo',
            x: 200,
            y: 200,
            z: flowKey,
            info: nodeInfo,
        }
    );

    type FlowParams = {
        name: string;
        parent: FlowParams | null;
    };

    function outputDefinition(
        { name: definitionName, parent }: FlowParams,
        definition: DeclaredDefinition
    ): string {
        // if we have already created a subflow for this definition
        if (subflows[definition.id]) {
            // don't create a duplicate, just re-use the one we have
            return subflows[definition.id];
        }
        // index nodes as we loop them
        const nodesByKey: Record<string, ParsedNode> = {};
        // Create a new directed graph
        const graph = new dagre.graphlib.Graph();
        graph.setGraph({});
        graph.setDefaultEdgeLabel(function () {
            return {};
        });
        // create first node
        const firstNodeKey = INPUT_KEY;
        graph.setNode(firstNodeKey, { ...NODE_DIMENSIONS });

        (function addBlockToGraph(parentKey: string, block: ParsedBlock) {
            // index our block
            const blockKey = block.id;
            nodesByKey[blockKey] = block;
            // add our block to the graph
            graph.setNode(blockKey, { ...NODE_DIMENSIONS });
            graph.setEdge(parentKey, blockKey);
            // add our block's children to the graph
            block.parsedNodes.forEach((node, idx) => {
                // get our parent node
                const previousKey = block.parsedNodes[idx - 1]?.id ?? blockKey;
                // handle our current node
                if (node.type === ParsedNodeType.CALL_EXPRESSION) {
                    // index our call expression
                    const nodeKey = node.id;
                    nodesByKey[nodeKey] = node;
                    // add our call expression to the graph
                    graph.setNode(nodeKey, { ...NODE_DIMENSIONS });
                    graph.setEdge(previousKey, nodeKey);
                    // process callbacks
                    (node as ParsedCallExpression).callbacks.forEach(
                        callback => {
                            const callbackKey = uuidv4();
                            const callExpression =
                                ts.factory.createCallExpression(
                                    ts.factory.createParenthesizedExpression(
                                        callback.definition as CallableDefinition
                                    ),
                                    undefined,
                                    undefined
                                );
                            forceAddNodeToFile(
                                callExpression,
                                callback.definition
                            );
                            nodesByKey[callbackKey] = {
                                id: callbackKey,
                                key: createNodeKey(callback.definition),
                                type: ParsedNodeType.CALL_EXPRESSION,
                                functionDefinition: callback,
                                callExpression,
                                callbacks: [],
                            };
                            graph.setNode(callbackKey, { ...NODE_DIMENSIONS });
                            graph.setEdge(nodeKey, callbackKey);
                        }
                    );
                } else {
                    addBlockToGraph(previousKey, node as ParsedBlock);
                }
            });
        })(firstNodeKey, definition.block);

        // calculate layout
        dagre.layout(graph);

        const inputNode = graph.node(INPUT_KEY);

        // create flow id
        const subflowId = uuidv4();
        // track our subflow
        subflows[definition.id] = subflowId;
        // create flow
        flowNodes.push({
            id: subflowId,
            type: 'subflow',
            name: definitionName,
            info: '',
            in: [
                {
                    ...calculatePosition(inputNode),
                    wires: (
                        graph.successors(INPUT_KEY) as unknown as string[]
                    ).map(it => ({
                        id: it,
                    })),
                },
            ],
            out: [
                {
                    x: 160,
                    y: 30,
                    wires: [],
                },
            ],
        });

        graph
            .nodes()
            .filter(it => it !== INPUT_KEY)
            .forEach(key =>
                (function outputNode(key: string) {
                    // if we've already been output
                    if (flowNodes.find(it => it.id === key)) {
                        // then there is nothing more to do
                        return;
                    }
                    // else, it's time to output our node
                    const node = nodesByKey[key];
                    const parentKey = graph.predecessors(
                        key
                    )?.[0] as unknown as string;
                    let nodeParams: {
                        name: string;
                        text: string;
                        block: ParsedBlock;
                        calls: ParsedCallExpression[];
                        callbackParentKey: string | null;
                        tsNodeInfo: TsNodeInfo;
                    };
                    if (node.type === ParsedNodeType.BLOCK) {
                        const { blockNode } = node as ParsedBlock;
                        nodeParams = {
                            name: getDefaultNodeName(blockNode.parent),
                            text: '',
                            block: node as ParsedBlock,
                            calls: [],
                            callbackParentKey: null,
                            tsNodeInfo: {
                                end: blockNode.end,
                                pos: blockNode.pos,
                                fileName: blockNode.getSourceFile().fileName,
                            },
                        };
                    } else if (
                        (node as ParsedCallExpression).functionDefinition
                            .type === ParsedDefinitionType.DECLARED
                    ) {
                        const {
                            id: definitionId,
                            declaration,
                            definition,
                            block,
                        } = (node as ParsedCallExpression)
                            .functionDefinition as DeclaredDefinition;
                        const parentNode = nodesByKey[parentKey];
                        const callExpression = (node as ParsedCallExpression)
                            .callExpression;
                        nodeParams = {
                            name: getDeclarationName(declaration),
                            text: definition.getText(),
                            block,
                            calls: getBlockCalls(block),
                            callbackParentKey:
                                parentNode?.type ===
                                    ParsedNodeType.CALL_EXPRESSION &&
                                (
                                    parentNode as ParsedCallExpression
                                ).callbacks.find(it => it.id === definitionId)
                                    ? parentKey
                                    : null,
                            tsNodeInfo: {
                                end: callExpression.end,
                                pos: callExpression.pos,
                                fileName:
                                    callExpression.getSourceFile().fileName,
                            },
                        };
                    } else {
                        const { nodes } = (node as ParsedCallExpression)
                            .functionDefinition as SyntheticDefinition;
                        nodeParams = {
                            name: getDefaultNodeName(nodes[0]),
                            text: nodes.map(it => it.getText()).join('\n'),
                            block: {
                                id: uuidv4(),
                                key: createNodeKey(nodes[0]),
                                type: ParsedNodeType.BLOCK,
                                parsedNodes: [],
                                blockNode: undefined as unknown as ts.Block,
                            },
                            calls: [],
                            callbackParentKey: null,
                            tsNodeInfo: {
                                pos: nodes[0].pos,
                                end: nodes.slice(-1)[0].end,
                                fileName: nodes[0].getSourceFile().fileName,
                            },
                        };
                    }
                    const { name, text, calls, callbackParentKey } = nodeParams;
                    const graphNode = graph.node(key);
                    const successors = graph.successors(
                        key
                    ) as unknown as string[];

                    // calculate our node position
                    let position = calculatePosition(graphNode);
                    // if we're a callback
                    if (callbackParentKey) {
                        // ensure that our callback parent has already been output (with the correct position)
                        outputNode(callbackParentKey);
                        // get our parent's position
                        const parentPosition = flowNodes.find(
                            it => it.id === callbackParentKey
                        ) as { x: number; y: number };
                        // base our position off our parent's
                        position = {
                            y: parentPosition.y,
                            x: parentPosition.x + getNodeDimensions().width,
                        };
                    }
                    // if we're the child of a parent block
                    if (
                        node.parentNode &&
                        node.parentNode != definition.block &&
                        parentKey
                    ) {
                        // ensure that our callback parent has already been output (with the correct position)
                        outputNode(parentKey);
                        // get our parent's position
                        const parentPosition = flowNodes.find(
                            it => it.id === parentKey
                        ) as { x: number; y: number };
                        // base our position off our parent's
                        position = {
                            y: parentPosition.y + 40,
                            x: parentPosition.x + 20,
                        };
                    }

                    const base = {
                        id: key,
                        z: subflowId,
                        name,
                        ...position,
                        wires: [successors],
                        initialize: '',
                    };

                    const flowNode = calls.length
                        ? {
                              ...base,
                              type:
                                  'subflow:' +
                                  outputDefinition(
                                      {
                                          name: base.name,
                                          parent: {
                                              name: definitionName,
                                              parent,
                                          },
                                      },
                                      (node as ParsedCallExpression)
                                          .functionDefinition as DeclaredDefinition
                                  ),
                          }
                        : {
                              ...base,
                              type: 'function',
                              func: text,
                              outputs: 1,
                              noerr: 0,
                              initialize:
                                  node.type ===
                                      ParsedNodeType.CALL_EXPRESSION &&
                                  (node as ParsedCallExpression)
                                      .functionDefinition.type ===
                                      ParsedDefinitionType.DECLARED
                                      ? (
                                            node as ParsedCallExpression
                                        ).callExpression.getText()
                                      : '',
                              finalize: '',
                              libs: [],
                          };
                    flowNodes.push(flowNode);
                    nodeInfo[flowNode.id] = {
                        flowNode: {
                            id: flowNode.id,
                            name: flowNode.name,
                            type: flowNode.type,
                            wires: flowNode.wires,
                            initialize: flowNode.initialize,
                        },
                        tsNodeInfo: nodeParams.tsNodeInfo,
                    };
                    return flowNode;
                })(key)
            );

        return subflowId;
    }

    Object.values(functionDefinitions).forEach(it => {
        if (it.type === ParsedDefinitionType.DECLARED) {
            outputDefinition(
                {
                    name: getDeclarationName(
                        (it as DeclaredDefinition).declaration
                    ),
                    parent: { name: '[[Root]]', parent: null },
                },
                it as DeclaredDefinition
            );
        }
    });

    // output flow
    fs.writeFileSync(
        getFlowFilename(directory, name),
        JSON.stringify(flowNodes, undefined, 2)
    );
};
