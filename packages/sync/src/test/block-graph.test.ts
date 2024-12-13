import { BlockGraph } from "../lib/block-graph";

//
// Expects two graphs to be equivalent.
//
function expectEqualGraphs(blockGraph1: BlockGraph<any>, blockGraph2: BlockGraph<any>) {
    const hashes1 = blockGraph1.getHeadBlockIds();
    const hashes2 = blockGraph2.getHeadBlockIds();

    //
    // Sort for comparison.
    //
    hashes1.sort((a, b) => a.localeCompare(b));
    hashes2.sort((a, b) => a.localeCompare(b));

    //
    // State should be equal after integration (not including the need to sort)
    //
    expect(hashes1).toEqual(hashes2);
}

const nullStorage: any = {
    async getAllRecords() {
        return [];
    },
    async getRecord() {
        return undefined;
    },
    async storeRecord() {
    },
    async deleteRecord() {
    },
    async deleteAllRecords() {
    }
};

describe("BlockGraph", () => {
    test("there are no head blocks for empty graph", () => {
        const blockGraph = new BlockGraph<any>(nullStorage);
        expect(blockGraph.getHeadBlockIds()).toEqual([]);
    });

    test("there is one head blocks for a single block", async () => {
        const blockGraph = new BlockGraph<any>(nullStorage);
        const block = await blockGraph.commitBlock("data");
        expect(blockGraph.getHeadBlockIds()).toEqual([block._id])
    });

    test("can add first block", async () => {
        const blockGraph = new BlockGraph<any>(nullStorage);
        const block = await blockGraph.commitBlock("data");
        expect(blockGraph.getHeadBlockIds()).toEqual([
            block._id,
        ]);
        expect(await blockGraph.hasBlock(block._id)).toBe(true);
    });

    test("can add second block", async () => {
        const blockGraph = new BlockGraph<any>(nullStorage);
        const block1 = await blockGraph.commitBlock("1");
        const block2 = await blockGraph.commitBlock("2");
        expect(blockGraph.getHeadBlockIds()).toEqual([
            block2._id
        ]);
    });

    test("can integrate two graphs, each with a separate block", async () => {
        const blockGraph1 = new BlockGraph<any>(nullStorage);
        const block1 = await blockGraph1.commitBlock("1");

        const blockGraph2 = new BlockGraph<any>(nullStorage);
        const block2 = await blockGraph2.commitBlock("2");

        await blockGraph1.integrateBlock(block2);
        await blockGraph2.integrateBlock(block1);

        expectEqualGraphs(blockGraph1, blockGraph2);
    });

    test("can integrate two graphs, in the reverse order", async () => {
        const blockGraph1 = new BlockGraph<any>(nullStorage);
        const block1 = await blockGraph1.commitBlock("1");

        const blockGraph2 = new BlockGraph<any>(nullStorage);
        const block2 = await blockGraph2.commitBlock("2");

        await blockGraph2.integrateBlock(block1);
        await blockGraph1.integrateBlock(block2);

        expectEqualGraphs(blockGraph1, blockGraph2);
    });

    test("can integrate two graphs, ones has more blocks", async () => {
        const blockGraph1 = new BlockGraph<any>(nullStorage);
        const block1 = await blockGraph1.commitBlock("1");
        const block2 = await blockGraph1.commitBlock("2");

        const blockGraph2 = new BlockGraph<any>(nullStorage);
        const block3 = await blockGraph2.commitBlock("3");

        await blockGraph1.integrateBlock(block3);
        await blockGraph2.integrateBlock(block1);
        await blockGraph2.integrateBlock(block2);

        expectEqualGraphs(blockGraph1, blockGraph2);
    });

    test("can integrate graphs and commit a new block", async () => {
        const blockGraph1 = new BlockGraph<any>(nullStorage);
        const block1 = await blockGraph1.commitBlock("1");

        const blockGraph2 = new BlockGraph<any>(nullStorage);
        const block2 = await blockGraph2.commitBlock("2");

        await blockGraph1.integrateBlock(block2);
        await blockGraph2.integrateBlock(block1);

        const block3 = await blockGraph1.commitBlock("3");

        expect(blockGraph1.getHeadBlockIds()).toEqual([
            block3._id
        ]);
    });

    test("can integrate graphs, commit a new block, then reintegrate", async () => {
        const blockGraph1 = new BlockGraph<any>(nullStorage);
        const block1 = await blockGraph1.commitBlock("1");

        const blockGraph2 = new BlockGraph<any>(nullStorage);
        const block2 = await blockGraph2.commitBlock("2");

        await blockGraph1.integrateBlock(block2);
        await blockGraph2.integrateBlock(block1);

        const block3 = await blockGraph1.commitBlock("3");

        await blockGraph2.integrateBlock(block3);

        expectEqualGraphs(blockGraph1, blockGraph2);
    });
});
