import fs from "fs-extra";
import { BlockGraph } from "sync";

export function writeBlockGraph<DataT = any>(blockGraph: BlockGraph<DataT>, outputDir: string) {

    fs.ensureDirSync(outputDir);

    //
    // Write the block graph.
    //
    fs.writeFileSync(`${outputDir}/block-graph.json`, JSON.stringify(blockGraph.getLoadedBlocks(), null, 2), { flush: true });

    const blockNodes = Array.from(blockGraph.getLoadedBlocks());
    blockNodes.sort((a, b) => a.id.localeCompare(b.id));

    //
    // To fix this I need to make it walk backwards from the head blocks.
    //
    // let mermaid = "```mermaid\ngraph TD;\n";

    // for (const block of blockNodes) {
    //     const nextBlocks = block.nextBlocks.slice();
    //     nextBlocks.sort((a, b) => a.block.id.localeCompare(b.block.id));


    //     if (nextBlocks && nextBlocks.length > 0) {
    //         for (const nextBlock of nextBlocks) {
    //             mermaid += `${block.block.id.substring(0, 5)} --> ${nextBlock.block.id.substring(0, 5)};\n`;
    //         }
    //     }
    //     else {
    //         mermaid += `${block.block.id.substring(0, 5)};\n`;
    //     }
    // }

    // mermaid += "```";

    // //
    // // Write a diagram of the blocks.
    // //
    // fs.writeFileSync(`${outputDir}/block-graph.md`, mermaid, { flush: true });
}
