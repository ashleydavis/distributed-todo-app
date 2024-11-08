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
        const blockGraph = new BlockGraph(nullStorage);
        expect(blockGraph.getHeadBlockIds()).toEqual([]);
    });

    test("there is one head blocks for a single block", () => {
        const blockGraph = new BlockGraph(nullStorage);
        const block = blockGraph.commitBlock("data");
        expect(blockGraph.getHeadBlockIds()).toEqual([block.id])
    });

    test("can add first block", async () => {
        const blockGraph = new BlockGraph(nullStorage);
        const block = blockGraph.commitBlock("data");
        expect(blockGraph.getHeadBlockIds()).toEqual([
            block.id,
        ]);
        expect(await blockGraph.hasBlock(block.id)).toBe(true);
    });

    test("can add second block", () => {
        const blockGraph = new BlockGraph(nullStorage);
        const block1 = blockGraph.commitBlock("1");
        const block2 = blockGraph.commitBlock("2");
        expect(blockGraph.getHeadBlockIds()).toEqual([
            block2.id
        ]);
    });

    test("can integrate two graphs, each with a separate block", () => {
        const blockGraph1 = new BlockGraph(nullStorage);
        const block1 = blockGraph1.commitBlock("1");

        const blockGraph2 = new BlockGraph(nullStorage);
        const block2 = blockGraph2.commitBlock("2");

        blockGraph1.integrateBlock(block2);
        blockGraph2.integrateBlock(block1);

        expectEqualGraphs(blockGraph1, blockGraph2);
    });

    test("can integrate two graphs, in the reverse order", () => {
        const blockGraph1 = new BlockGraph(nullStorage);
        const block1 = blockGraph1.commitBlock("1");

        const blockGraph2 = new BlockGraph(nullStorage);
        const block2 = blockGraph2.commitBlock("2");

        blockGraph2.integrateBlock(block1);
        blockGraph1.integrateBlock(block2);

        expectEqualGraphs(blockGraph1, blockGraph2);
    });

    test("can integrate two graphs, ones has more blocks", () => {
        const blockGraph1 = new BlockGraph(nullStorage);
        const block1 = blockGraph1.commitBlock("1");
        const block2 = blockGraph1.commitBlock("2");

        const blockGraph2 = new BlockGraph(nullStorage);
        const block3 = blockGraph2.commitBlock("3");

        blockGraph1.integrateBlock(block3);
        blockGraph2.integrateBlock(block1);
        blockGraph2.integrateBlock(block2);

        expectEqualGraphs(blockGraph1, blockGraph2);
    });

    test("can integrate graphs and commit a new block", () => {
        const blockGraph1 = new BlockGraph(nullStorage);
        const block1 = blockGraph1.commitBlock("1");

        const blockGraph2 = new BlockGraph(nullStorage);
        const block2 = blockGraph2.commitBlock("2");

        blockGraph1.integrateBlock(block2);
        blockGraph2.integrateBlock(block1);

        const block3 = blockGraph1.commitBlock("3");

        expect(blockGraph1.getHeadBlockIds()).toEqual([
            block3.id
        ]);
    });

    test("can integrate graphs, commit a new block, then reintegrate", () => {
        const blockGraph1 = new BlockGraph(nullStorage);
        const block1 = blockGraph1.commitBlock("1");

        const blockGraph2 = new BlockGraph(nullStorage);
        const block2 = blockGraph2.commitBlock("2");

        blockGraph1.integrateBlock(block2);
        blockGraph2.integrateBlock(block1);

        const block3 = blockGraph1.commitBlock("3");

        blockGraph2.integrateBlock(block3);

        expectEqualGraphs(blockGraph1, blockGraph2);
    });
});
