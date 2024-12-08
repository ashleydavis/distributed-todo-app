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
    let mermaid = "```mermaid\ngraph TD;\n";

    for (const block of blockNodes) {
        const prevBlocks = block.prevBlocks.slice();
        prevBlocks.sort((a, b) => a.localeCompare(b));


        if (prevBlocks && prevBlocks.length > 0) {
            for (const prevBlock of prevBlocks) {
                mermaid += `${prevBlock.substring(0, 5)} --> ${block.id.substring(0, 5)};\n`;
            }
        }
        else {
            mermaid += `${block.id.substring(0, 5)};\n`;
        }
    }

    mermaid += "```";

    //
    // Write a diagram of the blocks.
    //
    fs.writeFileSync(`${outputDir}/block-graph.md`, mermaid, { flush: true });
}
