import fs from 'fs-extra';
import { INodeTestSpec, ITestSpec } from "./lib/test-defs";
import { v4 as uuid } from 'uuid';
import { makeSeed } from './test/random';

//
// Create randomized test specs.
//
async function createTests() {
    const tests: ITestSpec[] = JSON.parse(fs.readFileSync(`./test-specs.json`, 'utf-8'));
    const prevNumTests = tests.length;

    function makeRandomNode(nodeIndex: number): INodeTestSpec {
        const roundTime = Math.floor(Math.random() * 5000) + 100;
        const numGenerationRounds = Math.floor(Math.random() * 100) + 10;
        return {
            nodeIndex,
            roundTime,
            numGenerationRounds,
            randomSeed: makeSeed(),
        };
    }

    const maxTests = 20;

    for (let testIndex = 0; testIndex < maxTests; testIndex++) {
        // Compute a random number of nodes between 5 and 20.
        const numNodes = Math.floor(Math.random() * 15) + 5;

        const nodes: INodeTestSpec[] = [];

        for (let nodeIndex = 0; nodeIndex < numNodes; nodeIndex++) {
            nodes.push(makeRandomNode(nodeIndex));
        }

        // Make a randomized test spec.
        tests.push({
            testId: uuid(),
            testIndex: testIndex + prevNumTests,
            title: `test run: ${testIndex + prevNumTests}`,
            nodes,
        });
    }

    fs.writeFileSync(`./test-specs.json`, JSON.stringify(tests, null, 2));
}

async function main() {
    await createTests();
}

main()
    .catch(err => {
        console.error(`Failed to create tests.`);
        console.error(err);
    });
