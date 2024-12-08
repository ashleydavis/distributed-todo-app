import axios from 'axios';
import { spawn as _spawn, ChildProcessWithoutNullStreams } from 'child_process';
import fs from "fs-extra";
import jsonStableStringify from 'json-stable-stringify';
import { expect } from "expect";
import http from 'http';
import { INodeDetailsMap } from 'sync';


//
// Prints an AggregateError so we can see what's in it.
//
export function printError(err: any): void {
    if (err.errors) {
        for (const error of err.errors) {
            console.error(error);
        }
    }
    else {
        console.error(err);
    };
}

//
// Unraps an AggregateError so we can see what's in it.
//
export function unwrapAggregateError(err: any): any {
    if (err.errors) {
        return new Error("AggregarateError: " + err.errors.map((error: any) => error.message).join(", "));
    }
    else {
        return err;
    }
}

//
// Spawns a process.
//
export function spawn(testRunId: string, nodeId: string, cmd: string, args?: string[], env?: any, outputPath?: string, cwd?: string, onErr?: (nodeId: string, err: any) => void, onExit?: (nodeId: string, code: any) => void): ChildProcessWithoutNullStreams {

    console.log(`[${testRunId}/${nodeId}]: Spawning "${cmd} ${args?.join(" ")}"`);

    const process = _spawn(cmd, args || [], {
        env,
        cwd,
    });

    process.stderr.on('data', (data: any) => {
        if (outputPath) {
            const output = data.toString()
                .split("\n")
                .filter((line: string) => line.trim().length > 0)
                .map((line: string) => `${nodeId}: stderr: ${line}`)
                .join("\n") + "\n";
            fs.appendFileSync(outputPath, output, { flush: true });
        }
    });

    process.stdout.on('data', (data: any) => {
        if (outputPath) {
            const output = data.toString()
                .split("\n")
                .filter((line: string) => line.trim().length > 0)
                .map((line: string) => `${nodeId}: ${line}`)
                .join("\n") + "\n";
            fs.appendFileSync(outputPath, output, { flush: true });
        }
    });

    process.on('exit', (code: any) => {
        if (outputPath) {
            fs.appendFileSync(outputPath, `${nodeId}: Process "${cmd}" exited with code ${code}`, { flush: true });
        }

        console.log(`[${testRunId}/${nodeId}]: Process "${cmd}" exited with code ${code}`);

        if (onExit) {
            onExit(nodeId, code);
        }
    });

    process.on('error', (err: any) => {
        if (outputPath) {
            fs.appendFileSync(outputPath, `${nodeId}: error: Process "${cmd}" errored with ${err.message}`, { flush: true });
        }

        console.error(`[${testRunId}]: Process "${cmd}" errored with ${err.message}`);
        console.error(err);

        if (onErr) {
            onErr(nodeId, err);
        }
    });

    return process;
}


//
// Wait until the generation rounds are done.
//
export async function waitDone(testRunId: string, baseUrl: string, brokerPort: number, onTick?: () => void): Promise<INodeDetailsMap> {
    return new Promise<INodeDetailsMap>((resolve, reject) => {

        let numStatusErrors = 0;

        async function checkDone() {
            let data: INodeDetailsMap;

            if (onTick) {
                try {
                    onTick();
                }
                catch (err) {
                    reject(err);
                    return;
                }
            }

            try {
                const response = await axios.get(`${baseUrl}:${brokerPort}/status`, { httpAgent: new http.Agent({ keepAlive: true }) });
                data = response.data['--test-user--'].nodes;

                numStatusErrors = 0; // Resets the error count.
            }
            catch (err: any) {
                if (numStatusErrors > 30) {
                    console.error(`### Error getting server status: ${err.stack || err.message}`);
                    reject(unwrapAggregateError(err));
                    return;
                }
                else {
                    numStatusErrors++;
                    // console.error(`Error getting server status: ${err.message}`);
                    // printError(err);
                    setTimeout(checkDone, 20000);
                }
                return;
            }

            fs.writeFileSync(`./test-runs/${testRunId}/test-status.json`, jsonStableStringify(data, { space: 2 }));

            // Write ony the head hashes to a separate file.
            const headHashes = Object.fromEntries(Object.entries(data).map(([nodeId, nodeDetails]) => {
                const hashes = nodeDetails.headBlocks.map(block => block.id);
                hashes.sort();
                return [
                    nodeId,
                    hashes,
                ];
            }));
            fs.writeFileSync(`./test-runs/${testRunId}/head-hashes.json`, jsonStableStringify(headHashes, { space: 2 }));

            // Write only the generating status to a separate file.
            const generatingStatus = Object.fromEntries(Object.entries(data).map(([nodeId, nodeDetails]) => [nodeId, nodeDetails.generatingData]));
            fs.writeFileSync(`./test-runs/${testRunId}/generating-status.json`, jsonStableStringify(generatingStatus, { space: 2 }));

            const nodes = Object.values(data);
            if (nodes.length === 0) {
                setTimeout(checkDone, 15000);
                return;
            }

            let generatingData = false;

            for (const nodeDetails of nodes) {
                if (nodeDetails.generatingData) {
                    generatingData = true;
                    break;
                }
            }

            if (generatingData) {
                // Still generating data. Check again soon.
                setTimeout(checkDone, 15000);
                return;
            }
            
            console.log(`${testRunId}: All nodes have finished generation, now waiting for synchronization.`);

            function checkSynchronized() {
                axios.get(`${baseUrl}:${brokerPort}/status`, { httpAgent: new http.Agent({ keepAlive: true }) })
                    .then(response => {
                        const data: INodeDetailsMap = response.data['--test-user--'].nodes;
                        fs.writeFileSync(`./test-runs/${testRunId}/test-status.json`, jsonStableStringify(data, { space: 2 }));

                        // Write ony the head hashes to a separate file.
                        const headHashes = Object.fromEntries(Object.entries(data).map(([nodeId, nodeDetails]) => {
                            const hashes = nodeDetails.headBlocks.map(block => block.id);
                            hashes.sort();
                            return [
                                nodeId,
                                hashes,
                            ];
                        }));
                        fs.writeFileSync(`./test-runs/${testRunId}/head-hashes.json`, jsonStableStringify(headHashes, { space: 2 }));

                        // Write only the generating status to a separate file.
                        const generatingStatus = Object.fromEntries(Object.entries(data).map(([nodeId, nodeDetails]) => [nodeId, nodeDetails.generatingData]));
                        fs.writeFileSync(`./test-runs/${testRunId}/generating-status.json`, jsonStableStringify(generatingStatus, { space: 2 }));

                        // Check if all nodes have the same hashes.
                        const nodeIds = Object.keys(data);
                        const nodeHashes = nodeIds.map(nodeId => {
                            const hashes = data[nodeId].headBlocks.map(block => block.id);
                            hashes.sort();
                            return {
                                nodeId,
                                hashes
                            };
                        });

                        // Are all the hashes equal?
                        const firstNodeHashes = nodeHashes[0];
                        let hashesEqual = true;

                        for (const otherNodeHashes of nodeHashes.slice(1)) {
                            if (!arraysEqual(firstNodeHashes.hashes, otherNodeHashes.hashes)) {
                                hashesEqual = false;
                                break;
                            }
                        }

                        if (hashesEqual) {
                            console.log(`[${testRunId}]: All nodes have the same head hashes.`);
                            console.log(nodeHashes.map(node => `${node.nodeId}: ${node.hashes}`).join("\n"));
                            clearTimeout(failureTimeout);
                            resolve(data);
                        }
                        else {
                            // console.log(`[${testRunId}]: Nodes have different head hashes`);
                            statusCheckTimeout = setTimeout(checkSynchronized, 10000);
                        }
                    })
                    .catch(err => {
                        console.error(`=== Error getting server status: ${err.stack || err.message}`);
                    });
            }

            let statusCheckTimeout = setTimeout(checkSynchronized, 10000);

            const failureTimeout = setTimeout(() => {
                clearTimeout(statusCheckTimeout);

                reject(new Error(`Timed out waiting for all nodes to have the same head hashes.`));
            }, 50 * 60 * 1000);
        }

        setTimeout(() => {
            checkDone();
        }, 20000);
    });
}

//
// Determine if two arrays are equal.
//
function arraysEqual(a: any[], b: any[]): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }

    return true;
}

//
// Check that all nodes are are in sync.
//
export function expectNodesInSync(testRunId: string, expectedNumNodes: number, nodeDetails: INodeDetailsMap) {
    const nodeIds = Object.keys(nodeDetails);
    expect(nodeIds.length).toBe(expectedNumNodes);

    //
    // Check that all nodes have the same hashes.
    //
    const nodeHashes = nodeIds.map(nodeId => {
        const hashes = nodeDetails[nodeId].headBlocks.map(block => block.id);
        hashes.sort();
        return {
            nodeId,
            hashes
        };
    });

    const firstNodeHashes = nodeHashes[0];

    for (const otherNodeHashes of nodeHashes.slice(1)) {

        if (otherNodeHashes.hashes.length !== firstNodeHashes.hashes.length) {
            throw new Error(`Nodes have different number of head hashes: \n` + nodeHashes.map(node => `${node.nodeId}: ${node.hashes.length}`).join("\n"));
        }

        if (!arraysEqual(firstNodeHashes.hashes, otherNodeHashes.hashes)) {
            throw new Error(`Nodes have different head hashes: \n` + nodeHashes.map(node => `${node.nodeId}: ${node.hashes}`).join("\n"));
        }
    }

    const firstNode = nodeDetails[nodeIds[0]];

    //
    // Check that all nodes have some blocks.
    //
    for (const nodeId of nodeIds) {
        const node = nodeDetails[nodeId];

        if (node.databaseHash !== firstNode.databaseHash) {
            throw new Error(`Nodes have different final database hashes: \n` + Object.entries(nodeDetails).map(([nodeId, details]) => `${nodeId}: ${details.databaseHash}`).join("\n"));
        }
    }

    //todo:
    // for (const nodeId of nodeIds) {
    //     //
    //     // Rebuild the database and check the final hash is the same as the one we expect.
    //     //
    //     const { database } = rebuildDatabase(nodeId, `./test-runs/${testRunId}/${nodeId}/blocks.json`);
    //     const node = nodeDetails[nodeId];
    //     expect(database.hash).toBe(node.databaseHash);
    // }
}

//
// Sleeps for the given number of milliseconds.
//
export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
