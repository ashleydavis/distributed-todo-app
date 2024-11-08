import { IStorage } from './storage';
import { v4 as uuid } from 'uuid';

//
// Details of a block, not including the data.
//
export interface IBlockDetails {
    //
    // The id of the block.
    //
    id: string;

    //
    // The ids of the previous blocks.
    //
    prevBlocks: string[];
}

//
// A block in the graph, including the data.
//
export interface IBlock<DataT> extends IBlockDetails {
    //
    // The data in the block.
    //
    data: DataT;
}

//
// Represents a block graph.
// It can be partially loaded from storage.
//
export class BlockGraph<DataT> {

    //
    // Nodes in the block graph, looked up by id.
    // This not a complete set of block, only the ones that have been loaded so far.
    //
    private blockMap = new Map<string, IBlock<DataT>>;

    //
    // Blocks currently at the head of the graph.
    // A new block added must be based on these.
    //
    private headBlockIds: string[] = [];

    constructor(private storage: IStorage) {        
    }

    //
    // Loads the head blocks from storage.
    //
    async loadHeadBlocks(): Promise<void> {
        const headBlocks = await this.storage.getRecord<{ headBlockIds: string[] }>("block-graphs", "head-blocks");
        if (headBlocks) {
            this.headBlockIds = headBlocks.headBlockIds;
            for (const id of this.headBlockIds) {
                const block = await this.storage.getRecord<IBlock<DataT>>("blocks", id);
                if (block) {
                    this.blockMap.set(id, block);
                }
            }
        }
    }

    //
    // Get the ids of the head block in the graph.
    //
    getHeadBlockIds(): string[] {
        return this.headBlockIds;
    }

    //
    // Get the head blocks in the block graph.
    //
    getHeadBlocks(): IBlock<DataT>[] {
        const headBlockIds = this.getHeadBlockIds();
        const headBlocks: IBlock<DataT>[] = [];
        for (const id of headBlockIds) {
            const block = this.blockMap.get(id); // We expect that head blocks are always already loaded.
            if (!block) {
                throw new Error(`Head block ${id} not found.`);
            }
            headBlocks.push(block);
        }
        return headBlocks;
    }

    //
    // Determine if the request block is loaded into memory.
    //
    hasBlockInMemory(id: string): boolean {
        return this.blockMap.has(id);
    }

    //
    // Determine if the request block exists in the graph.
    // Loads the block from storage if necessary.
    //
    async hasBlock(id: string): Promise<boolean> {
        if (this.blockMap.has(id)) {
            // The block is loaded in the block map.
            return true;
        }

        const block = await this.storage.getRecord<IBlock<DataT>>("blocks", id);
        if (block) {
            this.blockMap.set(id, block);
            return true;
        }
        else {
            return false;
        }
    }

    //
    // Gets a block, loading it from storage if necessary.
    //
    async getBlock(id: string): Promise<IBlock<DataT> | undefined> {
        if (this.blockMap.has(id)) {
            return this.blockMap.get(id);
        }

        const block = await this.storage.getRecord<IBlock<DataT>>("blocks", id);
        if (block) {
            this.blockMap.set(id, block);
            return block;
        }
        else {
            return undefined;
        }
    }

    //
    // Commits a new block to the graph.
    //
    commitBlock(data: DataT): IBlock<DataT> {
        const id = uuid();
        const prevBlocks = this.getHeadBlockIds();
        const block: IBlock<DataT> = {
            id,
            prevBlocks,
            data,
        };

        this.headBlockIds = [ id ];
        this.blockMap.set(block.id, block);
        
        this.storeBlock(block);
        this.storeHeadBlocks();

        return block;
    }

    //
    // Integrates a block from another node into this graph.
    //
    integrateBlock(block: IBlock<DataT>): void {

        if (this.blockMap.has(block.id)) {
            console.log(`Block ${block.id} already exists in the graph.`);
            return;
        }

        this.blockMap.set(block.id, block);

        const headNodes = new Set<string>(this.getHeadBlockIds());

        for (const prevBlockId of block.prevBlocks) {
            headNodes.delete(prevBlockId);
        }
        
        headNodes.add(block.id);

        this.headBlockIds = Array.from(headNodes);

        this.storeBlock(block);
        this.storeHeadBlocks();
    }

    //
    // Gets block that are currently loading.
    //
    getLoadedBlocks(): IBlock<DataT>[] {
        return Array.from(this.blockMap.values());
    }

    //
    // Write the block to storage.
    //
    private storeBlock(block: IBlock<DataT>): void {
        this.storage.storeRecord("blocks", block)
            .catch(err => {
                console.error(`Failed to store block or delete updates.:`);
                console.error(err.stack || err.message || err);
            });
    }

    //
    // Write head is to storage.
    //
    private storeHeadBlocks(): void {
        //todo: Might be good if there was a uuid for a graph. Each graph can be for a particular set!
        this.storage.storeRecord("block-graphs", { id: "head-blocks", headBlockIds: this.headBlockIds })
            .catch(err => {
                console.error(`Failed to store head blocks.:`);
                console.error(err.stack || err.message || err);
            });
    }
}
