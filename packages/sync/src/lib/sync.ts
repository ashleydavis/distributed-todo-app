import { IBlock, BlockGraph, IBlockDetails } from "./block-graph";
import { DatabaseUpdate } from "./database-update";

//
// The type of a function that can be called when database updates are received from other clients.
//
export type OnIncomingUpdatesFn = (updates: DatabaseUpdate[]) => Promise<void>;

//
// The details of a node participating in the synchronization.
//
export interface INodeDetails {
    //
    // Details of head blocks for the node.
    //
    headBlocks: IBlockDetails[];

    //
    // The current time on the node.
    //
    time: number;

    //
    // The server time when the node was last seen.
    //
    lastSeen: number;

    //
    // The hash of the database on the node.
    // This is used for testing only.
    //
    databaseHash?: string;

    //
    // Set to true while the node is still generating data.
    // For testing only.
    //
    generatingData?: boolean;
}

//
// Lookup of node details by node id.
//
export interface INodeDetailsMap {
    [nodeId: string]: INodeDetails;
}

//
// Response from a check in.
//
export interface ICheckInResponse {

    //
    // Other nodes are requesting blocks.
    //
    wantsData?: {
        [nodeId: string]: {
            requiredHashes: string[];
        }
    };

    //
    // Details on other nodes.
    //
    nodeDetails: INodeDetailsMap;
}

//
// Progress the synchronization of the node.
//
export async function doCheckIn(
    nodeId: string,
    blockGraph: BlockGraph<DatabaseUpdate[]>,
    pendingBlockMap: Map<string, IBlock<DatabaseUpdate[]>>,
    checkIn: (headBlocks: IBlockDetails[]) => Promise<ICheckInResponse>,
    pushBlocks: (toNodeId: string, blocks: IBlock<DatabaseUpdate[]>[]) => Promise<void>,
    requestBlocks: (requiredHashes: string[]) => Promise<void>,
    ): Promise<void> {

    //
    // Prepare the head blocks for the check in.
    //
    const headBlocks = blockGraph.getHeadBlocks().map(block => {
        return {
            id: block.id,
            prevBlocks: block.prevBlocks,
        };
    });

    //
    // Check in with the broker.
    // Communicates our latest hashes to the broker.
    // Checks to see if there are any updates from other nodes.
    // Checks for request from other nodes for blocks.
    //
    const checkinResponse = await checkIn(headBlocks);

    //
    // After check in we can see if any other nodes are waiting for us to supply
    // them with blocks they don't have.
    //
    if (checkinResponse.wantsData) {
        for (const [otherNodeId, { requiredHashes }] of Object.entries(checkinResponse.wantsData)) {

            if (otherNodeId === nodeId) {
                // No point trying to push blocks to ourselves.
                continue;
            }

            //
            // Send requested blocks (if we have them) to the other node.
            //
            const blocksToSend = [];

            for (const hash of requiredHashes) {
                const block = await blockGraph.getBlock(hash);
                if (block) {
                    blocksToSend.push(block);
                }
            }

            if (blocksToSend.length > 0) {
                await pushBlocks(otherNodeId, blocksToSend);
            }
        }
    }

    //
    // Hashes for blocks required from other nodes.
    //
    const requiredHashes = new Set<string>();

    //
    // After check in we know what block the other nodes have.
    // When they have blocks we don't have, we request those blocks.
    //
    for (const [otherNodeId, nodeDetails] of Object.entries(checkinResponse.nodeDetails)) {
        if (otherNodeId === nodeId) {
            continue;
        }

        for (const block of nodeDetails.headBlocks) {
            if (pendingBlockMap.has(block.id)) {
                // We have it pending.
                continue;
            }

            if (blockGraph.hasBlockInMemory(block.id)) {
                // We have it.
                continue;
            }

            //
            // We don't have it and it's not already in our pending list.
            //
            requiredHashes.add(block.id);
        }
    }

    //
    // Try to get all the prior blocks for the pending blocks.
    //
    for (const pendingBlock of pendingBlockMap.values()) {
        for (const prevHash of pendingBlock.prevBlocks) {
            if (pendingBlockMap.has(prevHash)) {
                // We have it pending.
                continue;
            }

            if (blockGraph.hasBlockInMemory(prevHash)) {
                // We have it.
                continue;
            }

            //
            // We don't have it and it's not already in our pending list.
            //
            requiredHashes.add(prevHash);
        }
    }

    if (requiredHashes.size > 0) {
        await requestBlocks(Array.from(requiredHashes));
    }
}

//
// Response when pulling blocks.
//
export interface IPullBlocksResponse {
    //
    // The blocks that have been pulled.
    //
    incomingBlocks: IBlock<DatabaseUpdate[]>[],
}

//
// Recieves blocks and integrates them.
// This has to happen out of line with the checkIn process
// to avoid deadlocks when all nodes are waiting for each other.
//
export async function receiveBlocks(
    blockGraph: BlockGraph<DatabaseUpdate[]>,
    pendingBlockMap: Map<string, IBlock<DatabaseUpdate[]>>,
    pullBlocks: () => Promise<IPullBlocksResponse>,
    onIncomingUpdates: OnIncomingUpdatesFn
): Promise<void> {

    //
    // Pulls blocks and add them to the pending block list.
    //
    const { incomingBlocks } = await pullBlocks();
    for (const block of incomingBlocks) {
        pendingBlockMap.set(block.id, block);
    }

    //
    // Try to commit pending blocks whose previous blocks we already have.
    //
    let changed = true;

    while (changed) {

        changed = false;

        for (const pendingBlock of pendingBlockMap.values()) {

            let havePriors = true;

            for (const prevHash of pendingBlock.prevBlocks) {
                if (!await blockGraph.hasBlock(prevHash)) {
                    havePriors = false;
                    break;
                }
            }

            if (havePriors) {
                await integrateBlock(pendingBlock, blockGraph, onIncomingUpdates);
                pendingBlockMap.delete(pendingBlock.id);
                changed = true;
            }
        }
    }
}

//
// Integrate a single block into the database from another node.
// Rerun all updates from the last common ancestor.
//
async function integrateBlock(
    incomingBlock: IBlock<DatabaseUpdate[]>,
    blockGraph: BlockGraph<DatabaseUpdate[]>,
    onIncomingUpdates: OnIncomingUpdatesFn
): Promise<void> {

    //
    // Find all blocks that are in the range of the new block.
    //
    // UNOPTIMIZED VERSION
    //
    // for (const block of this.updateBlocks.committedBlocks) {
    //     if (block.data[block.data.length - 1].timestamp < incomingBlock.data[0].timestamp) {
    //         // This block was before the new block.
    //     }
    //     else {
    //         localBlocks.push(block);
    //     }
    // }

    const minTime = incomingBlock.data[0].timestamp;
    const localBlocks = await findBlocksFromTime(minTime, blockGraph);

    localBlocks.push(incomingBlock);

    await blockGraph.integrateBlock(incomingBlock); //todo: Can this be done at the same time as onIncomingUpdates?

    //
    // Sort updates by timestamp so they are applied in order.
    //
    const updates = localBlocks.flatMap(block => block.data.map(update => {
        return {
            ...update,
            //
            // It can be useful for debugging to know which block the update came from.
            //
            // block: block.hash,
            // nodeId: block.nodeId,
        };
    }));
    updates.sort((a, b) => a.timestamp - b.timestamp);

    //
    // Let the app handle the incoming updates.
    //
    await onIncomingUpdates(updates);
}

//
// Find blocks from the requested time.
//
async function findBlocksFromTime(minTime: number, blockGraph: BlockGraph<DatabaseUpdate[]>): Promise<IBlock<DatabaseUpdate[]>[]> {

    let blocks: IBlock<DatabaseUpdate[]>[] = [];

    const queue = blockGraph.getHeadBlocks().slice();
    const visited = new Set<IBlock<DatabaseUpdate[]>>();

    while (queue.length > 0) {
        const block = queue.shift()!;
        if (visited.has(block)) {
            continue;
        }

        visited.add(block);

        const data = block.data

        if (data[data.length-1].timestamp < minTime) {
            // This block was before the new block.
            continue;
        }

        blocks.push(block);

        for (const prevBlockId of block.prevBlocks) {
            const prevBlock = await blockGraph.getBlock(prevBlockId);
            if (prevBlock) {
                queue.push(prevBlock);
            }
        }
    }

    return blocks;
}
