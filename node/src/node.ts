import axios from "axios";
import fs from "fs-extra";
import { makeSeed, Random } from './lib/random';
import { writeBlockGraph } from './lib/write-block-graph';
import { Database, DatabaseUpdate, SyncEngine } from "sync";
import { v4 as uuid } from 'uuid';
import { ITask } from "./lib/task";
import { hashDatabase } from "./lib/hash-database";

axios.defaults.timeout = 5 * 60 * 1000; // 5 mins. Only the long poll needs a long timeout, and it probably doesn't need to be this big in prod.

process.on('uncaughtException', (err) => {
    console.error('There was an uncaught exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason);
    process.exit(1);
});

function getEnvVar(name: string, defaultValue?: any): string {
    const value = process.env[name];
    if (!value) {
        if (defaultValue) {
            return defaultValue;
        }

        console.error(`${name} environment variable is required.`);
        process.exit(1);
    }

    return value;
}

const nodeId = getEnvVar("NODE_ID");
const maxGenerationTicks = parseInt(getEnvVar("MAX_GENERATION_TICKS", "15"));
const tickInterval = parseInt(getEnvVar("TICK_INTERVAL", "10000"));
const outputDir = getEnvVar("OUTPUT_DIR", "./storage");
const brokerPort = parseInt(getEnvVar("BROKER_PORT", "3000"));
const randomSeed = getEnvVar("RANDOM_SEED", makeSeed().join(",")).split(",").map(s => parseInt(s));
const brokerBaseUrl = `http://localhost:${brokerPort}`;

fs.ensureDirSync(outputDir);

const nullStorage = {
    async getAllRecords(collectionName: string) {
        return [];
    },
    async getRecord() {
        return undefined;
    },
    async storeRecord(collectionName: string, record: any) {
    },
    async deleteRecord(collectionName: string, id: string) {
    },
    async deleteAllRecords(collectionName: string) {
    }
};

//
// Called when incoming updates are received from other clients.
//
function onIncomingUpdates(updates: DatabaseUpdate[]): void {

    //
    // Apply incoming updates to the database.
    //
    database.applyIncomingUpdates(updates);

    fs.appendFileSync(`${outputDir}/updates.json`, JSON.stringify({
        time: Date.now(),
        direction: "incoming",
        round,
        updates,
        records: database.collection<ITask>("tasks").getAll().slice().sort((a, b) => a.id.localeCompare(b.id)),
        databaseHash: hashDatabase(database),
        headBlocks: syncEngine.getBlockGraph().getHeadBlockIds(),
    }, null, 2) + "\n===\n", { flush: true });

    //
    // For testing, check that the database is consistent with the entire history.
    //
    checkDatabaseConsistency();
}

//
// Called when updates are outgoing to other clients.
//
function onOutgoingUpdates(updates: DatabaseUpdate[]): void {
    //
    // Queue outgoing updates to send to other clients.
    //
    syncEngine.commitUpdates(updates)

    //
    // For testing, check that the database is consistent with the entire history.
    //
    checkDatabaseConsistency();

    fs.appendFileSync(`${outputDir}/updates.json`, JSON.stringify({
        time: Date.now(),
        direction: "outgoing",
        round,
        updates,
        records: database.collection<ITask>("tasks").getAll().slice().sort((a, b) => a.id.localeCompare(b.id)),
        databaseHash: hashDatabase(database),
        headBlocks: syncEngine.getBlockGraph().getHeadBlockIds(),
    }, null, 2) + "\n===\n", { flush: true });
}

//
// The synchronization engine is responsible for managing the block graph and the synchronization of database updates.
//
const syncEngine = new SyncEngine(nodeId, brokerBaseUrl, onIncomingUpdates, nullStorage, tickInterval, payload => {
    return {
        ...payload,
        //
        // For the testing framework.
        //
        databaseHash: hashDatabase(database),
        generatingData: round <= maxGenerationTicks,
    };
});

//
// The current state of the database.
//
const database = new Database(nullStorage, onOutgoingUpdates);
database.collection<ITask>("tasks");

fs.removeSync(`${outputDir}/events.json`);
fs.removeSync(`${outputDir}/updates.json`);

//
// The current round of generation in the node.
//
let round = 0;

//
// The number of updates made on this node.
//
let numUpdates = 0;

console.log(`Using seed: ${randomSeed}`);
const random = new Random(randomSeed);

fs.appendFileSync(`${outputDir}/events.json`, JSON.stringify({ time: Date.now(), type: "seed", randomSeed }, null, 2) + "\n===\n", { flush: true });

function writeState() {
    fs.writeFileSync(`${outputDir}/state.json`, JSON.stringify({
        time: Date.now(),
        round: round,
        databaseHash: hashDatabase(database),
        records: database.collection<ITask>("tasks").getAll().slice().sort((a, b) => a.id.localeCompare(b.id)),
        headBlocks: syncEngine.getBlockGraph().getHeadBlockIds(),
    }, null, 2), { flush: true });

    //
    // Writes the state round by round:
    //
    // fs.ensureDirSync(`${outputDir}/state`);
    // fs.writeFileSync(`${outputDir}/state/${timeNow}.json`, JSON.stringify({
    //     time: Date.now(),
    //     round: timeNow,
    //     databaseHash: database.hash,
    //     records: database.records,
    //     blocks: syncEngine.getBlockGraph().committedBlocks,
    //     headHashes: syncEngine.getBlockGraph().getHeadHashes(),
    // }, null, 2), { flush: true });

    writeBlockGraph(syncEngine.getBlockGraph(), outputDir);
}

//
// Generate some rendom updates.
//
async function generateRandomUpdates(round: number): Promise<void> {

    // if (numUpdates > 0) {
    //     // Stop generation after the first update.
    //     console.log(`===== Node ${nodeId} has stopped after limited updates.`);
    //     return;
    // }

    if (round > maxGenerationTicks) {
        // Stop after a while to make sure the graph stablizes
        console.log(`===== Node ${nodeId} has reached the maximum number of generation ticks.`);
        return;
    }
    else {
        console.log(`----- Node ${nodeId} is in generation tick ${round}`);
    }

    const records = database.collection<ITask>("tasks").getAll()
    if (records.length > 0 && random.getRand() > 0.6) {
        //
        // Makes an update to a todo.
        //
        if (random.getRand() > 0.5) {
            //
            // Make a random todo completed.
            //
            const randomItem = records[Math.floor(random.getRand() * records.length)];

            numUpdates += 1;

            database.collection("tasks").upsertOne(randomItem.id, { completed: !randomItem.completed });
        }
        else {
            //
            // Update the text of a random todo.
            //
            const randomItem = records[Math.floor(random.getRand() * records.length)];

            numUpdates += 1;

            database.collection("tasks").upsertOne(randomItem.id, {
                text: `Random todo ${Math.floor(random.getRand() * 1000)}`,
            });
        }
    }
    else if (random.getRand() > 0.6) {
        //
        // Makes a random todo and add it.
        //
        const newRecordId = uuid();

        numUpdates += 1;

        database.collection("tasks").upsertOne(newRecordId, {
            text: `Random todo ${Math.floor(random.getRand() * 1000)}`,
            completed: false,
        });
    }
}

syncEngine.startSync()
    .then(() => {
        runGenerationLoop()
            .catch(error => {
                console.error(`Error in generation loop:`);
                console.error(error.stack);
            });
    })
    .catch(error => {
        console.error(`Error starting sync:`);
        console.error(error.stack);
    });

//
// Runs the loop that generates updates.
//
async function runGenerationLoop(): Promise<void> {
    generateRandomUpdates(round);

    setTimeout(() => {
        writeState();

        round += 1;

        runGenerationLoop()
            .catch(error => {
                console.error(`Error:`);
                console.error(error.stack);
            });
    }, tickInterval);
}


//
// Checks the database consistency and aborts the node if it's not consistent.
//
function checkDatabaseConsistency() {
    const checkDatabase = new Database(nullStorage, () => {});
    checkDatabase.collection<ITask>("tasks"); //todo: It's a bit awkward.

    let allUpdates: DatabaseUpdate[] = [];
    for (const block of syncEngine.getBlockGraph().getLoadedBlocks()) {
        allUpdates = allUpdates.concat(block.data);
    }
    allUpdates.sort((a, b) => a.timestamp - b.timestamp);
    checkDatabase.applyIncomingUpdates(allUpdates);

    writeState();

    const databaseHash = hashDatabase(database);
    const checkDatabaseHash = hashDatabase(checkDatabase);
    if (databaseHash !== checkDatabaseHash) {
        console.error(`Database hashes do not match!`);
        console.error(`Local database hash: ${databaseHash}`);
        console.error(`Check database hash: ${checkDatabaseHash}`);
        console.error(`Local records:`);
        console.error(database.collection<ITask>("tasks").getAll().slice().sort((a, b) => a.id.localeCompare(b.id)));
        console.error(`Check records:`);
        console.error(checkDatabase.collection<ITask>("tasks").getAll().slice().sort((a, b) => a.id.localeCompare(b.id)));
        process.exit(1);
    }
}