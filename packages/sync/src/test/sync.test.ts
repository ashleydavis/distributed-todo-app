import { IBlock, IBlockDetails } from "../lib/block-graph";
import { DatabaseUpdate, IDatabaseUpdate } from "../lib/database-update";
import { doCheckIn, receiveBlocks } from "../lib/sync-core";

describe("sync", () => {

    test("checks in with head blocks", async () => {

        const headBlocks = [
            {
                id: "1234",
                prevBlocks: [],
            },
            {
                id: "5678",
                prevBlocks: [],
            },
        ];
        const mockBlockGraph: any = {
            getHeadBlocks() {
                return headBlocks;
            }
        };
        const pendingBlockMap = new Map<string, IBlock<DatabaseUpdate[]>>();
        const mockCheckIn = jest.fn(() => {
            const checkInResponse: any = {
                nodeDetails: {
                },
            };
            return checkInResponse;
        });
        await doCheckIn("node-1", mockBlockGraph, pendingBlockMap,
            mockCheckIn,
            async (toNodeId: string, blocks: IBlock<DatabaseUpdate[]>[]) => { },
            async (requiredHashes: string[]) => { }
        );

        expect(mockCheckIn).toHaveBeenCalledWith(headBlocks);
    });

    test("push blocks to waiting nodes", async () => {

        const block1 = {
            _id: "1234",
            prevBlocks: [],
            data: [],
        };
        const block2 = {
            _id: "5678",
            prevBlocks: [],
            data: [],
        };
        const mockBlockGraph: any = {
            getHeadBlocks() {
                return [];
            },
            getBlock(hash: string): IBlock<DatabaseUpdate[]> {
                if (hash === "1234") {
                    return block1;
                }
                else if (hash === "5678") {
                    return block2;
                }
                else {
                    throw new Error(`Unexpected hash ${hash}`);
                }
            }
        };
        const pendingBlockMap = new Map<string, IBlock<DatabaseUpdate[]>>();
        const mockPushBlocks = jest.fn();
        const otherNodeId = "other-node";
        await doCheckIn("node-1", mockBlockGraph, pendingBlockMap,
            () => {
                const checkInResponse: any = {
                    nodeDetails: {
                    },
                    wantsData: {
                        [otherNodeId]: {
                            requiredHashes: [ "1234", "5678" ],
                        },
                    }
                };
                return checkInResponse;
            },
            mockPushBlocks,
            async (requiredHashes: string[]) => { }
        );

        const blocksToSend: IBlock<DatabaseUpdate[]>[] = [];
        expect(mockPushBlocks).toHaveBeenCalledWith(otherNodeId, [
            block1,
            block2,
        ]);

    });

    test("push blocks to waiting nodes", async () => {

        const block1 = {
            _id: "1234",
            prevBlocks: [],
            data: [],
        };
        const block2 = {
            _id: "5678",
            prevBlocks: [],
            data: [],
        };
        const mockBlockGraph: any = {
            getHeadBlocks() {
                return [];
            },
            getBlock(hash: string): IBlock<DatabaseUpdate[]> {
                if (hash === "1234") {
                    return block1;
                }
                else if (hash === "5678") {
                    return block2;
                }
                else {
                    throw new Error(`Unexpected hash ${hash}`);
                }
            }
        };
        const pendingBlockMap = new Map<string, IBlock<DatabaseUpdate[]>>();
        const mockPushBlocks = jest.fn();
        const otherNodeId = "node-1";
        await doCheckIn("node-1", mockBlockGraph, pendingBlockMap,
            () => {
                const checkInResponse: any = {
                    nodeDetails: {
                    },
                    wantsData: {
                        [otherNodeId]: {
                            requiredHashes: [ "1234", "5678" ],
                        },
                    }
                };
                return checkInResponse;
            },
            mockPushBlocks,
            async (requiredHashes: string[]) => { }
        );

        expect(mockPushBlocks).not.toHaveBeenCalled();
    });

    test("requests blocks advertised by another node", async () => {

        const mockBlockGraph: any = {
            getHeadBlocks() {
                return [];
            },
            hasBlockInMemory() {
                return false;
            },
        };
        const pendingBlockMap = new Map<string, IBlock<DatabaseUpdate[]>>();
        const mockRequestBlocks = jest.fn();
        await doCheckIn("node-1", mockBlockGraph, pendingBlockMap,
            () => {
                const checkInResponse: any = {
                    nodeDetails: {
                        "other-node": {
                            headBlocks: [
                                {
                                    id: "1234",
                                    prevBlocks: [],
                                },
                                {
                                    id: "5678",
                                    prevBlocks: [],
                                },
                            ],
                        }
                    },
                };
                return checkInResponse;
            },
            async (toNodeId: string, blocks: IBlock<DatabaseUpdate[]>[]) => { },
            mockRequestBlocks
        );

        expect(mockRequestBlocks).toHaveBeenCalledWith(["1234", "5678"]);
    });

    test("don't request blocks we already have", async () => {

        const mockBlockGraph: any = {
            getHeadBlocks() {
                return [];
            },
            hasBlockInMemory() {
                return true; // We already have every block in memory.
            },
        };
        const pendingBlockMap = new Map<string, IBlock<DatabaseUpdate[]>>();
        const mockRequestBlocks = jest.fn();
        await doCheckIn("node-1", mockBlockGraph, pendingBlockMap,
            () => {
                const checkInResponse: any = {
                    nodeDetails: {
                        "other-node": {
                            headBlocks: [
                                {
                                    id: "1234",
                                    prevBlocks: [],
                                },
                                {
                                    id: "5678",
                                    prevBlocks: [],
                                },
                            ],
                        }
                    },
                };
                return checkInResponse;
            },
            async (toNodeId: string, blocks: IBlock<DatabaseUpdate[]>[]) => { },
            mockRequestBlocks
        );

        expect(mockRequestBlocks).not.toHaveBeenCalled();
    });

    test("requests blocks that are priors of pending blocks", async () => {

        const mockBlockGraph: any = {
            getHeadBlocks() {
                return [];
            },
            hasBlockInMemory() {
                return false;
            },
        };
        const pendingBlockMap = new Map<string, IBlock<DatabaseUpdate[]>>();
        pendingBlockMap.set("a-block", {
            _id: "a-block",
            prevBlocks: [ "1234", "5678" ],
            data: [],
        });
        const mockRequestBlocks = jest.fn();
        await doCheckIn("node-1", mockBlockGraph, pendingBlockMap,
            () => {
                const checkInResponse: any = {
                    nodeDetails: {},
                };
                return checkInResponse;
            },
            async (toNodeId: string, blocks: IBlock<DatabaseUpdate[]>[]) => { },
            mockRequestBlocks
        );

        expect(mockRequestBlocks).toHaveBeenCalledWith(["1234", "5678"]);
    });

    test("integrates incoming blocks that have no priors", async () => {

        const update = {
            timestamp: 25,
        };
        const incomingBlock: any = {
            id: "1234",
            prevBlocks: [],
            data: [ update ],
        };

        const mockIntegrateBlock = jest.fn();
        const mockBlockGraph: any = {
            getHeadBlocks() {
                return [];
            },
            integrateBlock: mockIntegrateBlock,
        };
        const mockRecieveUpdates = jest.fn();
        const pendingBlockMap = new Map<string, IBlock<DatabaseUpdate[]>>();
        await receiveBlocks(mockBlockGraph, pendingBlockMap,
            async () => {
                const pullBlocksResponse: any = {
                    incomingBlocks: [
                        incomingBlock,
                    ],
                };
                return pullBlocksResponse;
            },
            mockRecieveUpdates
        );

        expect(mockIntegrateBlock).toHaveBeenCalledWith(incomingBlock);
        expect(mockRecieveUpdates).toHaveBeenCalledWith([ update ]);
    });

    test("incoming block with no priors becomes a pending block", async () => {

        const update = {
            timestamp: 25,
        };
        const incomingBlock: any = {
            id: "1234",
            prevBlocks: [ "no-prior" ],
            data: [ update ],
        };

        const mockIntegrateBlock = jest.fn();
        const mockBlockGraph: any = {
            getHeadBlocks() {
                return [];
            },
            hasBlock() {
                return false;
            },
            integrateBlock: mockIntegrateBlock,
        };
        const mockRecieveUpdates = jest.fn();
        const pendingBlockMap = new Map<string, IBlock<DatabaseUpdate[]>>();
        await receiveBlocks(mockBlockGraph, pendingBlockMap,
            async () => {
                const pullBlocksResponse: any = {
                    incomingBlocks: [ incomingBlock ],
                };
                return pullBlocksResponse;
            },
            mockRecieveUpdates
        );

        expect(mockIntegrateBlock).not.toHaveBeenCalled();
        expect(mockRecieveUpdates).not.toHaveBeenCalled();
        expect(pendingBlockMap.has("1234")).toBe(true);
    });

    test("integrates pending blocks that have priors", async () => {

        const update = {
            timestamp: 25,
        };
        const pendingBlock: any = {
            id: "1234",
            prevBlocks: [ "have-prior" ],
            data: [ update ],
        };

        const mockIntegrateBlock = jest.fn();
        const mockBlockGraph: any = {
            getHeadBlocks() {
                return [];
            },
            hasBlock() {
                return true;
            },
            integrateBlock: mockIntegrateBlock,
        };
        const mockRecieveUpdates = jest.fn();
        const pendingBlockMap = new Map<string, IBlock<DatabaseUpdate[]>>();
        pendingBlockMap.set("1234", pendingBlock);

        await receiveBlocks(mockBlockGraph, pendingBlockMap,
            async () => {
                const pullBlocksResponse: any = {
                    incomingBlocks: [],
                };
                return pullBlocksResponse;
            },
            mockRecieveUpdates
        );

        expect(mockIntegrateBlock).toHaveBeenCalledWith(pendingBlock);
        expect(mockRecieveUpdates).toHaveBeenCalledWith([ update ]);
        expect(pendingBlockMap.has("1234")).toBe(false);
    });

    test("incoming updates are sorted by timestamp", async () => {

        const incomingBlock: any = {
            id: "1234",
            prevBlocks: [],
            data: [
                {
                    timestamp: 22,
                },
                {
                    timestamp: 15,
                },
                {
                    timestamp: 5,
                },
                {
                    timestamp: 100,
                },
            ],
        };

        const mockIntegrateBlock = jest.fn();
        const mockBlockGraph: any = {
            getHeadBlocks() {
                return [];
            },
            integrateBlock: mockIntegrateBlock,
        };
        const mockRecieveUpdates = jest.fn();
        const pendingBlockMap = new Map<string, IBlock<DatabaseUpdate[]>>();
        await receiveBlocks(mockBlockGraph, pendingBlockMap,
            async () => {
                const pullBlocksResponse: any = {
                    incomingBlocks: [ incomingBlock ],
                };
                return pullBlocksResponse;
            },
            mockRecieveUpdates
        );

        expect(mockIntegrateBlock).toHaveBeenCalledWith(incomingBlock);
        expect(mockRecieveUpdates).toHaveBeenCalledWith([
            {
                timestamp: 5,
            },
            {
                timestamp: 15,
            },
            {
                timestamp: 22,
            },
            {
                timestamp: 100,
            },
         ]);
    });
});