import express from 'express';
import { expect } from 'expect';
import cors from 'cors';
import { IBlock, ICheckInPayload, ICheckInResponse, INodeDetailsMap } from 'sync';

//
// Blocks of data that are pushed from one node to another.
//
export interface IPushedData<DataT> {
    //
    // Blocks being pushed.
    //
    blocks: IBlock<DataT>[];

    //
    // The node that pushed the blocks.
    //
    fromNodeId: string;
}

//
// A pending block request from a node.
//
export interface IPendingBlockRequest {
    //
    // The callback to call when the data is ready.
    //
    callback: (data: IPushedData<any>) => void;
}

//
// Nodes that are waiting for data.
//
export interface IPendingBlockRequestMap {
    [nodeId: string]: IPendingBlockRequest;
}

process.on('uncaughtException', (err) => {
    console.error('There was an uncaught exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason);
    process.exit(1);
});

function getEnvVar(name: string, defaultValue?: any): string {
    const value = process.env[name];
    if (!value) {
        if (defaultValue) {
            return defaultValue;
        }

        console.error(`${name} environment variable is required.`);
        process.exit(1);
    }

    return value;
}

const app = express();
const port = parseInt(getEnvVar("PORT", "3000"));

app.use(cors());
app.use(express.json());

//
// That node that is currenlty requesting data.
//
let pendingBlockRequests: IPendingBlockRequestMap = {};

//
// Timestamps for latest data on each node.
//
const nodeDetailsMap: INodeDetailsMap = {};

const nodeBlockRequests: { [nodeId: string]: Set<string> } = {};

app.get("/status", (req, res) => {
    res.json(nodeDetailsMap);
});

//
// Check in with the broker.
// Communicates the latest timestamp from this node.
// Checks to see if there are any updates from other nodes.
// Checks if other nodes are waiting for updates from this node.
//
app.post("/check-in", (req, res) => {

    debugger;

    const { nodeId, headBlocks, time, databaseHash, generatingData }: ICheckInPayload = req.body;

    console.log(`Node ${nodeId} is checking in with head blocks:`);
    console.log(`  ` + headBlocks.map(b => b.id).join("  \r\n"));

    nodeDetailsMap[nodeId] = {
        headBlocks,
        time,
        lastSeen: Date.now(),
        databaseHash,
        generatingData,
    };

    const data: ICheckInResponse = {
        nodeDetails: nodeDetailsMap,
    };

    if (pendingBlockRequests) {
        for (const nodeId of Object.keys(pendingBlockRequests)) {
            // A node is waiting for blocks.
            if (nodeBlockRequests[nodeId] !== undefined) {
                // The node has advertised a requrest for block.
                const requiredHashes = Array.from(nodeBlockRequests[nodeId]);
                if (requiredHashes.length > 0) {
                    if (data.wantsData === undefined) {
                        data.wantsData = {};
                    }
                    data.wantsData[nodeId] = { requiredHashes };
                }
            }
        }
    }

    res.json(data);
});

//
// Long polling request to request blocks from other nodes.
//
app.post("/pull-blocks", (req, res) => {

    debugger;

    const { nodeId } = req.body;

    console.log(`Node ${nodeId} is waiting for blocks.`);

    if (pendingBlockRequests[nodeId]) {
        console.log(`Node ${nodeId} is already waiting for blocks.`);
        res.json({ blocks: [], fromNodeId: "broker" });
        return;
    }

    const timeout = setTimeout(() => {
        // Timeout the long poll.
        delete pendingBlockRequests[nodeId];
        res.json({ blocks: [], fromNodeId: "broker" });
    }, 2 * 60 * 1000);  // Timeout after 2 minutes. Can probably be shorter in production.

    pendingBlockRequests[nodeId] = {
        callback: (data: IPushedData<any>) => {
            expect(data.fromNodeId).not.toBeUndefined();

            // Completes the long poll.
            clearTimeout(timeout);

            for (const block of data.blocks) {
                // Remove the request because we are fullfilling it.
                nodeBlockRequests[nodeId].delete(block.id);
            }

            delete pendingBlockRequests[nodeId];
            res.json(data);
        },
    };
});

//
// Push blocks to a waiting node.
//
app.post("/push-blocks", (req, res) => {

    debugger;

    const { toNodeId, fromNodeId } = req.body;

    expect(toNodeId).not.toBeUndefined();
    expect(fromNodeId).not.toBeUndefined();

    if (pendingBlockRequests[toNodeId]) {
        console.log(`Pushing blocks from ${fromNodeId} to ${toNodeId}: ${req.body.blocks.map((b: IBlock<any>) => b.id).join(", ")}`);
        pendingBlockRequests[toNodeId].callback(req.body);
    }
    else {
        console.log(`Node ${fromNodeId} has pushed blocks to ${toNodeId}. But ${toNodeId} is not waiting for blocks, it probably already received the blocks.`);
    }

    res.sendStatus(200);
});

//
// One node is requesting blocks from other nodes.
//
app.post("/request-blocks", (req, res) => {

    const { nodeId, requiredHashes } = req.body;

    console.log(`Node ${nodeId} is requesting blocks: ${requiredHashes}`);

    nodeBlockRequests[nodeId] = new Set(requiredHashes);

    res.sendStatus(200);
});

app.listen(port, () => {
    console.log(`Broker running on http://localhost:${port}`);
});

//
// Automatically cleanup nodes that have gone offline.
//
setInterval(() => {
    const now = Date.now();
    for (const [nodeId, nodeDetails] of Object.entries(nodeDetailsMap)) {
        const nodeTimeoutMs = 20 * 1000;
        if (now - nodeDetails.lastSeen > nodeTimeoutMs) {
            console.log(`Node ${nodeId} has gone offline.`);
            delete nodeDetailsMap[nodeId];
        }
    }
});