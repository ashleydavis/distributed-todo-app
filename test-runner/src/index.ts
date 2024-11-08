import fs from 'fs-extra';
import killSync from 'kill-sync';
import { spawn as _spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { expectNodesInSync, sleep, spawn, waitDone } from "./lib/test-utils";
import minimist, { ParsedArgs } from 'minimist';
import _ from 'lodash';
import chalk from 'chalk';
import { ITestSpec } from './lib/test-defs';

const BASE_URL = "http://localhost";

const numStreams = 12;

let numTests = 0;

let numPassed = 0;

let numFailed = 0;

const testsFailed: ITestSpec[] = [];

//
// Make this number bigger to make tests complete more quickly.
//
const speedUp = 1;

//
// Runs a test.
//
async function runTest(testSpec: ITestSpec): Promise<void> {

    const testRunId = testSpec.testId;

    let brokerProcess: ChildProcessWithoutNullStreams | undefined = undefined;
    const nodeProcesses: ChildProcessWithoutNullStreams[] = [];

    try {
        numTests += 1;
        const nodes = testSpec.nodes;
        const brokerPort = 3300 + testSpec.testIndex;
        const debuggerPort = 7000 + testSpec.testIndex * 100;
        let okToExit = false;

        const outputDir = `./test-runs/${testRunId}`;
        fs.removeSync(outputDir);
        fs.ensureDirSync(outputDir);

        const errors: any[] = [];
        const earlyExits: any[] = [];

        const logFilePath = `${outputDir}/log.txt`;
        brokerProcess = spawn(
            testRunId,
            'broker', 'node', [ `-r`, `ts-node/register`, `src/broker.ts` ], {
            // 'broker', 'node', [ `--inspect=${debuggerPort}`, `build/broker.js` ], {
                PORT: brokerPort.toString(),
                OUTPUT_DIR: `${outputDir}/broker`,
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

        console.log(chalk.blue(`Started test ${testSpec.testIndex}: ${testRunId} with broker pid ${brokerProcess.pid} on port ${brokerPort} (debugger port ${debuggerPort}).`));

        //
        // Give the broker some time to start before the nodes try to talk to it.
        //
        await sleep(10000);

        for (const nodeSpec of nodes) {
            const nodeId = `node-${nodeSpec.nodeIndex}`;
            const nodeOutputDir = `${outputDir}/${nodeId}`;
            const nodeDebuggerPort = debuggerPort + 1 + nodeSpec.nodeIndex;
            const nodeProcess = spawn(
                testRunId,
                nodeId,
                `node`, [ `-r`, `ts-node/register`, `src/node.ts` ], {
                // `node`, [ `--inspect=${nodeDebuggerPort}`, `build/node.js` ], {
                    NODE_ID: nodeId,
                    MAX_GENERATION_TICKS: nodeSpec.numGenerationRounds.toString(),
                    TICK_INTERVAL:  Math.trunc(nodeSpec.roundTime * (1.0/speedUp)).toString(),
                    OUTPUT_DIR: nodeOutputDir,
                    BROKER_PORT: brokerPort.toString(),
                    RANDOM_SEED: nodeSpec.randomSeed.join(","),
                    PATH: process.env.PATH,
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
            console.log(`[${testRunId}]: Starting node ${nodeId} with pid ${nodeProcess.pid} (debugger port ${nodeDebuggerPort}).`);
            nodeProcesses.push(nodeProcess);
        }

        //
        // Wait for nodes to finish random gneneration rounds.
        //
        const lastNodeDetails = await waitDone(testRunId, BASE_URL, brokerPort, () => {
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
        for (const nodeProcess of nodeProcesses) {
            killSync(nodeProcess.pid!, 'SIGKILL', true);
        }

        killSync(brokerProcess.pid!, 'SIGKILL', true);

        await sleep(5000); // Give the nodes time to exit.

        if (errors.length > 0) {
            throw new Error(`Errors occurred in nodes: ${errors.map(({ nodeId, err }) => `${nodeId}: ${err.message}`).join("\n")}`);
        }

        if (earlyExits.length > 0) {
            throw new Error(`Nodes exited early: ${earlyExits.map(({ nodeId, code }) => `${nodeId}: ${code}`).join("\n")}`);
        }

        expectNodesInSync(testRunId, nodes.length, lastNodeDetails!);

        console.log(chalk.green(`Test ${testSpec.testIndex}: ${testSpec.testId} passed.`));
        numPassed += 1;
    }
    catch (err) {
        console.error(chalk.red(`Test ${testSpec.testIndex}: ${testSpec.testId} failed.`));
        console.error(err);
        numFailed += 1;

        testsFailed.push(testSpec);

        console.log(`[${testRunId}]: Killing all processes.`);

        //
        // Make sure all nodes are dead.
        //
        try {
            for (const nodeProcess of nodeProcesses) {
                killSync(nodeProcess.pid!, 'SIGKILL', true);
            }

            if (brokerProcess) {
                killSync(brokerProcess.pid!, 'SIGKILL', true);
            }
        }
        catch (err: any) {
            console.error(`Error killing processes: ${err.message}`);
        }
    }
}

//
// Runs a stream of tests.
//
async function runTestStream(testSpecs: ITestSpec[]) {
    while (testSpecs.length > 0) {
        const nextTestSpec = testSpecs.shift();
        await runTest(nextTestSpec!);
    }
}

async function main(argv: ParsedArgs) {

    const testSpecs: ITestSpec[] = JSON.parse(fs.readFileSync(`./test-specs.json`, 'utf-8'));

    if (argv["test-id"]) {
        const testId = argv["test-id"];
        const testSpec = testSpecs.find(testSpec => testSpec.testId === testId);
        if (testSpec) {
            await runTest(testSpec);
            return;
        }
        else {
            throw new Error(`Test with id ${testId} not found.`);
        }
    }
    else if (argv.inband) {
        for (const testSpec of testSpecs) {
            await runTest(testSpec);
        }
    }
    else {
        const testQueue = [...testSpecs]
        await Promise.all(_.range(0, numStreams).map(() => runTestStream(testQueue)));
    }

    // await runTest(testSpecs[0]);

    console.log(chalk.cyan(`Tests passed: ${numPassed}`));
    console.log(chalk.cyan(`Tests failed: ${numFailed}`));
    console.log(chalk.cyan(`Tests total: ${numTests}`));

    if (numFailed > 0) {
        console.log(`Tests failed: ${testsFailed.map(t => t.testId).join(", ")}`);
    }
}

main(minimist(process.argv.slice(2)))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });

