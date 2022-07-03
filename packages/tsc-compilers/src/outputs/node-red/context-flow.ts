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
    getBlockCalls,
    getDeclarationName,
    getDefaultNodeName,
    getNodeDimensions,
    NODE_DIMENSIONS,
} from '../../lib/node-red';
import { createNodeKey } from '../../lib/source-file';

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

    function outputDefinition(
        { name: definitionName, parent }: FlowParams,
        definition: DeclaredDefinition
    ): string {
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
                            const callbackKey = callback.id;
                            nodesByKey[callbackKey] = {
                                id: uuidv4(),
                                key: createNodeKey(callback.definition),
                                type: ParsedNodeType.CALL_EXPRESSION,
                                functionDefinition: callback,
                                callExpression: ts.factory.createCallExpression(
                                    ts.factory.createParenthesizedExpression(
                                        callback.definition as CallableDefinition
                                    ),
                                    undefined,
                                    undefined
                                ),
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
                        id: it + '-' + subflowId,
                    })),
                },
            ],
            out: [],
        });

        graph
            .nodes()
            .filter(it => it !== INPUT_KEY)
            .forEach(key =>
                (function outputNode(key: string) {
                    // if we've already been output
                    if (flowNodes.find(it => it.id === key + '-' + subflowId)) {
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
                    };
                    if (node.type === ParsedNodeType.BLOCK) {
                        nodeParams = {
                            name: getDefaultNodeName(
                                (node as ParsedBlock).blockNode.parent
                            ),
                            text: '',
                            block: node as ParsedBlock,
                            calls: [],
                            callbackParentKey: null,
                        };
                    } else if (
                        (node as ParsedCallExpression).functionDefinition
                            .type === ParsedDefinitionType.DECLARED
                    ) {
                        const { declaration, definition, block } = (
                            node as ParsedCallExpression
                        ).functionDefinition as DeclaredDefinition;
                        const parentNode = nodesByKey[parentKey];
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
                                ).callbacks.find(it => it.id === key)
                                    ? parentKey
                                    : null,
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
                            it => it.id === callbackParentKey + '-' + subflowId
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
                            it => it.id === parentKey + '-' + subflowId
                        ) as { x: number; y: number };
                        // base our position off our parent's
                        position = {
                            y: parentPosition.y + 40,
                            x: parentPosition.x + 20,
                        };
                    }

                    const base = {
                        id: key + '-' + subflowId,
                        z: subflowId,
                        name,
                        ...position,
                        wires: [successors.map(it => it + '-' + subflowId)],
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
                                  node.type === ParsedNodeType.CALL_EXPRESSION
                                      ? (
                                            node as ParsedCallExpression
                                        ).callExpression.arguments
                                            .map(it => getDefaultNodeName(it))
                                            .join(', ')
                                      : '',
                              finalize: '',
                              libs: [],
                          };
                    flowNodes.push(flowNode);
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
        `${directory}/${name}.json`,
        JSON.stringify(flowNodes, undefined, 2)
    );
};
