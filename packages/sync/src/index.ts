import axios from "axios";
import { BlockGraph, IBlock, IBlockDetails } from "./lib/block-graph";
import { doCheckIn, ICheckInResponse, IPullBlocksResponse, OnIncomingUpdatesFn, receiveBlocks } from "./lib/sync";
import { IStorage } from "./lib/storage";
export { BlockGraph, IBlock, IBlockDetails } from "./lib/block-graph";
export { doCheckIn, receiveBlocks, ICheckInResponse, INodeDetailsMap, IPullBlocksResponse } from "./lib/sync";
export { DatabaseUpdate, IDatabaseUpdate, IFieldUpdate, IDeleteUpdate } from "./lib/database-update";
export * from "./lib/database";
export * from "./lib/collection";
export * from "./lib/storage";
import http from 'http';
import { DatabaseUpdate } from "./lib/database-update";

export class SyncEngine {

    //
    // Set to true when the sync engine is running.
    //
    private running = false;

    //
    // The graph of database updates.
    //
    private blockGraph: BlockGraph<DatabaseUpdate[]> | undefined = undefined;

    //
    // Pending blocks are blocks that have been received but not yet committed.
    // We still need to fulfil previous node.
    //
    private pendingBlockMap: Map<string, IBlock<DatabaseUpdate[]>> | undefined = undefined;

    constructor(
        private nodeId: string, 
        private apiBaseUrl: string, 
        private onIncomingUpdates: OnIncomingUpdatesFn,
        private storage: IStorage,
        private tickInterval: number,
        private annotateCheckInPayload?: (payload: ICheckInPayload) => ICheckInPayload
        ) {        
    }

    //
    // Get the block graph.
    //
    getBlockGraph(): BlockGraph<DatabaseUpdate[]> {
        if (!this.blockGraph) {
            throw new Error(`Block graph not initialized.`);
        }

        return this.blockGraph;
    }

    //
    // Starts the database synchronization engine.
    //
    async startSync(): Promise<void> {
        if (this.running) {
            throw new Error(`The sync engine is already running.`);
        }

        this.blockGraph = new BlockGraph<DatabaseUpdate[]>(this.storage);
        await this.blockGraph.loadHeadBlocks();
        this.pendingBlockMap = new Map<string, IBlock<DatabaseUpdate[]>>();
        this.running = true;

        this.runCheckinLoop()
            .catch(error => {
                console.error(`Error:`);
                console.error(error.stack);
            });

        this.runReceiveBlocksLoop()
            .catch(error => {
                console.error(`Error:`);
                console.error(error.stack);
            });
    }

    //
    // Stops the database synchronization engine.
    //
    stopSync(): void {
        this.running = false;
    }

    //
    // Commit updates to the block graph.
    //
    commitUpdates(updates: DatabaseUpdate[]): IBlock<DatabaseUpdate[]> {
        if (!this.blockGraph) {
            throw new Error(`Block graph not initialized.`);
        }

        return this.blockGraph.commitBlock(updates);
    }

    //
    // Starts a loop checking in with the broker to sync the database.
    //
    private async runCheckinLoop(): Promise<void> {

        if (!this.running) {
            return;
        }

        if (!this.blockGraph) {
            throw new Error(`Block graph not initialized.`);
        }

        if (!this.pendingBlockMap) {
            throw new Error(`Pending block map not initialized.`);
        }

        await doCheckIn(
            this.nodeId,
            this.blockGraph,
            this.pendingBlockMap,

            // Check in
            async (headBlocks: IBlockDetails[]): Promise<ICheckInResponse> => {
                let checkInPayload: ICheckInPayload = {
                    nodeId: this.nodeId,
                    headBlocks,
                    time: Date.now(),
                };

                if (this.annotateCheckInPayload) {
                    checkInPayload = this.annotateCheckInPayload(checkInPayload);
                }
                const response = await axios.post(`${this.apiBaseUrl}/check-in`, checkInPayload, { httpAgent: new http.Agent({ keepAlive: true }) });
                return response.data;
            },

            // Push data
            async (toNodeId: string, blocks: IBlock<DatabaseUpdate[]>[]): Promise<void> => {
                await axios.post(`${this.apiBaseUrl}/push-blocks`, {
                    toNodeId,
                    fromNodeId: this.nodeId,
                    blocks,
                }, { httpAgent: new http.Agent({ keepAlive: true }) });
            },

            // Request blocks
            async (requiredHashes: string[]): Promise<void> => {
                await axios.post(`${this.apiBaseUrl}/request-blocks`, {
                    nodeId: this.nodeId,
                    requiredHashes,
                }, { httpAgent: new http.Agent({ keepAlive: true }) });
            },
        );

        if (!this.running) {
            return;
        }

        // Schedule the next tick.
        // This needs to be an exponential backoff. Maybe backoff if there's nothing to sync.
        // Reset the timeout if anything changed.
        // Reset the timeout if the user interacts with the UI.
        setTimeout(() => {
            this.runCheckinLoop()
                .catch(error => {
                    console.error(`Error:`);
                    console.error(error.stack);
                });
        }, this.tickInterval);
    }

    //
    // Starts a loop receiving blocks from other clients.
    //
    private async runReceiveBlocksLoop(): Promise<void> {

        if (!this.running) {
            return;
        }

        if (!this.blockGraph) {
            throw new Error(`Block graph not initialized.`);
        }

        if (!this.pendingBlockMap) {
            throw new Error(`Pending block map not initialized.`);
        }

        await receiveBlocks(
            this.blockGraph,
            this.pendingBlockMap,

            // Pull blocks
            async (): Promise<IPullBlocksResponse> => {

                try {
                    //
                    // We must pull blocks we don't have from the other node.
                    //
                    const response = await axios.post(`${this.apiBaseUrl}/pull-blocks`, {
                        nodeId: this.nodeId,
                    }, { httpAgent: new http.Agent({ keepAlive: true }) });

                    //
                    // Integrate the new blocks into the graph.
                    //
                    const { blocks } = response.data;

                    return { incomingBlocks: blocks };
                }
                catch (error: any) {
                    if (error.code === "ECONNABORTED") {
                        console.log(`Hit timeout on pull data.`);
                        return { incomingBlocks: [] };
                    }
                    else {
                        throw error;
                    }
                }
            },

            this.onIncomingUpdates
        );

        if (!this.running) {
            return;
        }

        // Schedule the next tick.
        // This needs to be an exponential backoff. Maybe backoff if there's nothing to sync.
        // Reset the timeout if anything changed.
        // Reset the timeout if the user interacts with the UI.
        setTimeout(() => {
            this.runReceiveBlocksLoop()
                .catch(error => {
                    console.error(`Error:`);
                    console.error(error.stack);
                });
        }, 0);
    }
}

//
// Payload to the /check-in endpoint.
//
export interface ICheckInPayload {
    //
    // The unique id of the node.
    //
    nodeId: string;

    //
    // Details of head blocks for the node.
    //
    headBlocks: IBlockDetails[];

    //
    // The current time on the node.
    //
    time: number;

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

