import { spawn as _spawn } from 'child_process';
import killSync from 'kill-sync';
import axios from 'axios';
import fs from 'fs-extra';
import { expectNodesInSync, sleep, spawn, waitDone } from '../lib/test-utils';

axios.defaults.timeout = 5000; // 5 seconds

describe("sync tests", () => {

    jest.setTimeout(1000000);

    fs.ensureDirSync('./test-runs');

    test("two nodes remain in sync", async () => {
        const roundTime = Math.floor(Math.random() * 900) + 100;
        const numGenerationRounds = Math.floor(Math.random() * 40) + 10;
        const brokerPort = 3001;
        const testRunId = `72134056-5e99-4f9f-b983-7a0b66b03e5a`;

        console.log(`Running test ${testRunId}`);

        let okToExit = false;
        const errors: any[] = [];
        const earlyExits: any[] = [];

        const logFilePath = `./test-runs/${testRunId}/log.txt`;
        const broker = spawn(testRunId, 'broker', 'node', [ `-r`, `ts-node/register`, `src/broker.ts` ], {
                PORT: brokerPort.toString(),
                PATH: process.env.PATH,
            },
            logFilePath,
            `../broker`,
            (nodeId, err) => {
                errors.push({ nodeId, err });
            },
            (nodeId, code) => {
                if (!okToExit) {
                    earlyExits.push({ nodeId, code });
                }
            }
        );

        //
        // Give the broker some time to start before the nodes try to talk to it.
        //
        await sleep(2000);

        const nodeA = spawn(testRunId, 'node-a', `node`, [ `-r`, `ts-node/register`, `src/node.ts` ], {
                NODE_ID: 'node-a',
                MAX_GENERATION_TICKS: numGenerationRounds.toString(),
                TICK_INTERVAL: roundTime.toString(),
                OUTPUT_DIR: `./test-runs/${testRunId}/node-a`,
                BROKER_PORT: brokerPort.toString(),
                PATH: process.env.PATH,

                // Uncomment this to make the test play out the same everytime.
                // RANDOM_SEED: [ 2497430509, 3364162443, 1583985156,  2211610666 ].join(","),
            },
            logFilePath,
            `../node`,
            (nodeId, err) => {
                errors.push({ nodeId, err });
            },
            (nodeId, code) => {
                if (!okToExit) {
                    earlyExits.push({ nodeId, code });
                }
            }
        );

        const nodeB = spawn(testRunId, 'node-b', `node`, [ `-r`, `ts-node/register`, `src/node.ts` ], {
                NODE_ID: 'node-b',
                MAX_GENERATION_TICKS: numGenerationRounds.toString(),
                TICK_INTERVAL: roundTime.toString(),
                OUTPUT_DIR: `./test-runs/${testRunId}/node-b`,
                BROKER_PORT: brokerPort.toString(),
                PATH: process.env.PATH,

                // Uncomment this to make the test play out the same everytime.
                // RANDOM_SEED:  [ 3197571136, 3763634791, 2306291631, 2163881427 ].join(","),
            },
            logFilePath,
            `../node`,
            (nodeId, err) => {
                errors.push({ nodeId, err });
            },
            (nodeId, code) => {
                if (!okToExit) {
                    earlyExits.push({ nodeId, code });
                }
            }
        );

        const lastNodeDetails = await waitDone(testRunId, `http://localhost`,  brokerPort, () => {
            if (errors.length > 0) {
                throw new Error(`Errors occurred in nodes: \n${errors.map(({ nodeId, err }) => `${nodeId}: ${err.message}`).join("\n")}`);
            }

            if (earlyExits.length > 0) {
                throw new Error(`Nodes exited early: ${earlyExits.map(({ nodeId, code }) => `${nodeId}: ${code}`).join(", ")}`);
            }
        });

        okToExit = true;

        //
        // All nodes are past their generation rounds.
        //
        killSync(nodeA.pid!, 'SIGKILL', true);
        killSync(nodeB.pid!, 'SIGKILL', true);
        killSync(broker.pid!, 'SIGKILL', true);

        await sleep(5000); // Give the nodes time to exit.

        if (errors.length > 0) {
            throw new Error(`Errors occurred in nodes: ${errors.map(({ nodeId, err }) => `${nodeId}: ${err.message}`).join("\n")}`);
        }

        if (earlyExits.length > 0) {
            throw new Error(`Nodes exited early: ${earlyExits.map(({ nodeId, code }) => `${nodeId}: ${code}`).join("\n")}`);
        }

        expectNodesInSync(testRunId, 2, lastNodeDetails!);
    });
});