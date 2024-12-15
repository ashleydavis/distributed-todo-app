import axios from "axios";
import fs from "fs-extra";
import { makeSeed, Random } from './lib/random';
import { writeBlockGraph } from './lib/write-block-graph';
import { IStorage, Database, DatabaseUpdate, SyncEngine } from "sync";
import { v4 as uuid } from 'uuid';
import { hashDatabase } from "./lib/hash-database";

interface ITask {
    _id: string;
    text: string;
    completed: boolean;
 }

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
const userId = "--test-user--";
const maxGenerationTicks = parseInt(getEnvVar("MAX_GENERATION_TICKS", "15"));
const tickInterval = parseInt(getEnvVar("TICK_INTERVAL", "10000"));
const outputDir = getEnvVar("OUTPUT_DIR", "./storage");
const brokerPort = parseInt(getEnvVar("BROKER_PORT", "3000"));
const randomSeed = getEnvVar("RANDOM_SEED", makeSeed().join(",")).split(",").map(s => parseInt(s));
const brokerBaseUrl = `http://localhost:${brokerPort}`;

fs.ensureDirSync(outputDir);

class MemoryStorage implements IStorage {
    documents: any = [];

    async getAllDocuments(collectionName: string) {
        return this.documents[collectionName] || [];
    }

    async getMatchingDocuments(collectionName: string, fieldName: string, fieldValue: string) {
        if (this.documents[collectionName] === undefined) {
            return [];
        }
        return this.documents[collectionName].filter((document: any) => document[fieldName] === fieldValue);
    }

    async getDocument(collectionName: string, documentId: string) {
        if (this.documents[collectionName] === undefined) {
            return undefined;
        }
        return this.documents[collectionName].find((document: any) => document._id === documentId);
    }

    async storeDocument(collectionName: string, document: any) {

        if (!this.documents[collectionName]) {
            this.documents[collectionName] = [];
        }

        const index = this.documents[collectionName].findIndex((r: any) => r._id === document._id);
        if (index === -1) {
            this.documents[collectionName].push(document);
        }
        else {
            this.documents[collectionName][index] = document;
        }
    }

    async deleteDocument(collectionName: string, id: string) {
        if (this.documents[collectionName] === undefined) {
            return;
        }

        const index = this.documents[collectionName].findIndex((r: any) => r._id === id);
        if (index !== -1) {
            this.documents[collectionName].splice(index);
        }
    }

    async deleteAllDocuments(collectionName: string) {
        this.documents[collectionName] = [];
    }
};

const memoryStorage = new MemoryStorage();

//
// Called when incoming updates are received from other clients.
//
async function onIncomingUpdates(updates: DatabaseUpdate[]): Promise<void> {

    //
    // Apply incoming updates to the database.
    //
    await database.applyIncomingUpdates(updates);

    // fs.appendFileSync(`${outputDir}/updates.json`, JSON.stringify({
    //     time: Date.now(),
    //     direction: "incoming",
    //     round,
    //     updates,
    //     records: database.collection("tasks").getAll().slice().sort((a, b) => a.id.localeCompare(b.id)),
    //     databaseHash: hashDatabase(database),
    //     headBlocks: syncEngine.getBlockGraph().getHeadBlockIds(),
    // }, null, 2) + "\n===\n", { flush: true });

    //
    // For testing, check that the database is consistent with the entire history.
    //
    await checkDatabaseConsistency();
}

//
// Called when updates are outgoing to other clients.
//
async function onOutgoingUpdates(updates: DatabaseUpdate[]): Promise<void> {
    //
    // Queue outgoing updates to send to other clients.
    //
    await syncEngine.commitUpdates(updates)

    //
    // For testing, check that the database is consistent with the entire history.
    //
    await checkDatabaseConsistency();

    // fs.appendFileSync(`${outputDir}/updates.json`, JSON.stringify({
    //     time: Date.now(),
    //     direction: "outgoing",
    //     round,
    //     updates,
    //     records: database.collection("tasks").getAll().slice().sort((a, b) => a.id.localeCompare(b.id)),
    //     databaseHash: hashDatabase(database),
    //     headBlocks: syncEngine.getBlockGraph().getHeadBlockIds(),
    // }, null, 2) + "\n===\n", { flush: true });
}

//
// The synchronization engine is responsible for managing the block graph and the synchronization of database updates.
//
const syncEngine = new SyncEngine(nodeId, userId, brokerBaseUrl, onIncomingUpdates, memoryStorage, tickInterval, async (payload) => {
    return {
        ...payload,
        //
        // For the testing framework.
        //
        databaseHash: await hashDatabase(database),
        generatingData: round <= maxGenerationTicks,
    };
});

//
// The current state of the database.
//
const database = new Database(memoryStorage, onOutgoingUpdates);
database.collection("tasks"); //todo: Shouldn't have to have this!

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
    // fs.writeFileSync(`${outputDir}/state.json`, JSON.stringify({
    //     time: Date.now(),
    //     round: round,
    //     databaseHash: hashDatabase(database),
    //     records: database.collection("tasks").getAll().slice().sort((a, b) => a.id.localeCompare(b.id)),
    //     headBlocks: syncEngine.getBlockGraph().getHeadBlockIds(),
    // }, null, 2), { flush: true });

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

    const document = await database.collection<ITask>("tasks").getAll()
    if (document.length > 0 && random.getRand() > 0.6) {
        //
        // Makes an update to a todo.
        //
        if (random.getRand() > 0.5) {
            //
            // Make a random todo completed.
            //
            const randomItem = document[Math.floor(random.getRand() * document.length)];

            numUpdates += 1;

            await database.collection("tasks").upsertOne(randomItem._id, { completed: !randomItem.completed });
        }
        else {
            //
            // Update the text of a random todo.
            //
            const randomItem = document[Math.floor(random.getRand() * document.length)];

            numUpdates += 1;

            await database.collection("tasks").upsertOne(randomItem._id, {
                text: `Random todo ${Math.floor(random.getRand() * 1000)}`,
            });
        }
    }
    else if (random.getRand() > 0.6) {
        //
        // Makes a random todo and add it.
        //
        const newDocumentId = uuid();

        numUpdates += 1;

        await database.collection("tasks").upsertOne(newDocumentId, {
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
async function checkDatabaseConsistency() {
    const checkDatabase = new Database(memoryStorage, async () => {});

    let allUpdates: DatabaseUpdate[] = [];
    for (const block of syncEngine.getBlockGraph().getLoadedBlocks()) {
        allUpdates = allUpdates.concat(block.data);
    }
    allUpdates.sort((a, b) => a.timestamp - b.timestamp);
    await checkDatabase.applyIncomingUpdates(allUpdates);

    writeState();

    const databaseHash = await hashDatabase(database);
    const checkDatabaseHash = await hashDatabase(checkDatabase);
    if (databaseHash !== checkDatabaseHash) {
        console.error(`Database hashes do not match!`);
        console.error(`Local database hash: ${databaseHash}`);
        console.error(`Check database hash: ${checkDatabaseHash}`);
        console.error(`Local records:`);
        // console.error(database.collection("tasks").getAll().slice().sort((a, b) => a.id.localeCompare(b.id)));  //todo: Be good to make this work with all collections.
        console.error(`Check records:`);
        // console.error(checkDatabase.collection("tasks").getAll().slice().sort((a, b) => a.id.localeCompare(b.id)));
        process.exit(1);
    }
}