import express from 'express';
import { expect } from 'expect';
import cors from 'cors';
import { IBlock, ICheckInPayload, ICheckInResponse, INodeDetailsMap } from 'sync';

declare global {
    namespace Express {
        interface Request {
            userId?: string;
        }
    }
}

//
// Blocks of data that are pushed from one node to another.
//
interface IPushedData<DataT> {
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
interface IPendingBlockRequest {
    //
    // The callback to call when the data is ready.
    //
    callback: (data: IPushedData<any>) => void;
}

//
// Nodes that are waiting for data.
//
interface IPendingBlockRequestMap {
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
// Records block requests from each node.
//
interface IBlockRequestMap {
    [nodeId: string]: Set<string>;
}

//
// Details for a particular user.
//
interface IUserDetails {
    //
    // Latest details for each of the user's nodes.
    //
    nodes: INodeDetailsMap;

    //
    // Nodes that are currenlty waiting for blocks.
    //
    pullBlockRequests: IPendingBlockRequestMap;

    //
    // Block requests from nodes.
    //
    blockRequests: IBlockRequestMap;
}

//
// Records the details for each separate user.
//
interface IUserDetailsMap {
    [userId: string]: IUserDetails;    
}

//
// Updated details for each connected user.
//
const userDetailsMap: IUserDetailsMap = {};

//
// Get's user details, lazily creating them if they don't exist.
//
function getUserDetails(userId: string): IUserDetails {
    let userDetails = userDetailsMap[userId];
    if (!userDetails) {
        userDetails  = userDetailsMap[userId] = {
            nodes: {},
            pullBlockRequests: {},
            blockRequests: {},
        };
    }

    return userDetails;
}

//
// NOTE: This is for testing purposes only.
//       Not to be included in production code.
//
app.get("/status", (req, res) => {
    res.json(userDetailsMap);
});

//
// Checks the header of requests for the user id.
// 
// NOTE: This should be replaced with a JWT for production use.
//
app.use((req, res, next) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
        res.sendStatus(401);
        return;
    }

    req.userId = userId;

    next();
});

//
// Check in with the broker.
// Communicates the latest timestamp from this node.
// Checks to see if there are any updates from other nodes.
// Checks if other nodes are waiting for updates from this node.
//
app.post("/check-in", (req, res) => {

    debugger;

    const userId = req.userId;
    if (!userId) {
        throw new Error("User is not identified.");
    }

    const { nodeId, headBlocks, time, databaseHash, generatingData }: ICheckInPayload = req.body;

    if (!nodeId) {
        throw new Error("Node ID is required.");
    }

    if (!headBlocks) {
        throw new Error("Head blocks are required.");
    }

    if (!time) {
        throw new Error("Time is required.");
    }

    // console.log(`Node ${nodeId} is checking in with head blocks:`); 
    // console.log(`  ` + headBlocks.map(b => b.id).join("  \r\n"));

    let userDetails = getUserDetails(userId);
    userDetails.nodes[nodeId] = {
        headBlocks,
        time,
        lastSeen: Date.now(),
        databaseHash,
        generatingData,
    };

    const data: ICheckInResponse = {
        nodeDetails: userDetails.nodes,
    };

    for (const [nodeId, blockRequests] of Object.entries(userDetails.blockRequests)) {
        if (blockRequests.size > 0) {
            if (data.wantsData === undefined) {
                data.wantsData = {};
            }

            data.wantsData[nodeId] = { requiredHashes: Array.from(blockRequests) };
        }
    }

    res.json(data);
});

//
// Long polling request to request blocks from other nodes.
//
app.post("/pull-blocks", (req, res) => {

    debugger;

    const userId = req.userId;
    if (!userId) {
        throw new Error("User is not identified.");
    }

    const { nodeId } = req.body;
    if (!nodeId) {
        throw new Error("Node ID is required.");
    }

    // console.log(`Node ${nodeId} is waiting for blocks.`);

    let userDetails = getUserDetails(userId)
    if (userDetails.pullBlockRequests[nodeId]) {
        // console.log(`Node ${nodeId} is already waiting for blocks.`);
        res.json({ blocks: [], fromNodeId: "broker" });
        return;
    }

    const timeout = setTimeout(() => {
        // Timeout the long poll.
        delete userDetails.pullBlockRequests[nodeId];
        res.json({ blocks: [], fromNodeId: "broker" });
    }, 2 * 60 * 1000);  // Timeout after 2 minutes. Can probably be shorter in production.

    userDetails.pullBlockRequests[nodeId] = {
        callback: (data: IPushedData<any>) => {
            expect(data.fromNodeId).not.toBeUndefined();

            // Completes the long poll.
            clearTimeout(timeout);

            for (const block of data.blocks) {
                // Remove the request because we are fullfilling it.
                userDetails.blockRequests[nodeId].delete(block._id);
            }

            delete userDetails.pullBlockRequests[nodeId];
            res.json(data);
        },
    };
});

//
// Push blocks to a waiting node.
//
app.post("/push-blocks", (req, res) => {

    debugger;

    const userId = req.userId;
    if (!userId) {
        throw new Error("User is not identified.");
    }

    const { toNodeId, fromNodeId } = req.body;

    if (!toNodeId) {
        throw new Error("To node ID is required.");
    }

    if (!fromNodeId) {
        throw new Error("From node ID is required.");
    }

    let userDetails = getUserDetails(userId);
    if (userDetails.pullBlockRequests[toNodeId]) {
        console.log(`Pushing blocks from ${fromNodeId} to ${toNodeId}: ${req.body.blocks.map((b: IBlock<any>) => b._id).join(", ")}`);
        userDetails.pullBlockRequests[toNodeId].callback(req.body);
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

    const userId = req.userId;
    if (!userId) {
        throw new Error("User is not identified.");
    }

    const { nodeId, requiredHashes } = req.body;

    if (!nodeId) {
        throw new Error("Node ID is required.");
    }

    if (!requiredHashes) {
        throw new Error("Required hashes are required.");
    }

    console.log(`Node ${nodeId} is requesting blocks: ${requiredHashes}`);

    let userDetails = getUserDetails(userId);
    userDetails.blockRequests[nodeId] = new Set(requiredHashes);

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
    for (const [userId, userDetails] of Object.entries(userDetailsMap)) {
        for (const [nodeId, nodeDetails] of Object.entries(userDetails.nodes)) {
            const nodeTimeoutMs = 20 * 1000;
            if (now - nodeDetails.lastSeen > nodeTimeoutMs) {
                console.log(`Node ${nodeId} has gone offline.`);
                delete userDetails.nodes[nodeId];
            }
        }

        if (Object.keys(userDetails.nodes).length === 0) {
            console.log(`User ${userId} has gone offline.`);
            delete userDetailsMap[userId];
        }
    }
});
