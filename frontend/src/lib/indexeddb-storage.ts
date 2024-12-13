import { IStorage } from "sync";
import { deleteAllRecords, deleteRecord, getAllRecords, getRecord, IIndexeddbDatabaseConfiguration, openDatabase, storeRecord } from "./indexeddb";

//
// A wrapper around the IndexedDB storage to plug it into the sync library.
//
export class IndexeddbStorage implements IStorage {

    //
    // Look up table of open databases.
    //
    private indexeddb: { [collectionName: string]: IDBDatabase } = {};

    constructor(private databaseName: string) {
    }

    //
    // Lazily opens database for each collection.
    //
    private async openDatabase(collectionName: string): Promise<IDBDatabase> {
        let indexeddb = this.indexeddb[collectionName];
        if (!indexeddb) {
            const databaseConfiguration: IIndexeddbDatabaseConfiguration = {
                versionNumber: 1,
                collections: [{ 
                    name: "documents", 
                    idField: "_id", //todo: does everything have an _id field?
                }],
            };
            indexeddb = this.indexeddb[collectionName] = await openDatabase(`${this.databaseName}-${collectionName}`, databaseConfiguration);
        }

        return indexeddb;
    }

    //
    // Closes underlying databases.
    //
    close() {
        for (const [collectionName, db] of Object.entries(this.indexeddb)) {
            db.close();
        }

        this.indexeddb = {};
    }

    async getAllRecords<RecordT>(collectionName: string): Promise<RecordT[]> {
        const indexeddb = await this.openDatabase(collectionName);
        return await getAllRecords(indexeddb, "documents");
    }

    async getRecord<RecordT>(collectionName: string, id: string): Promise<RecordT | undefined> {
        const indexeddb = await this.openDatabase(collectionName);
        return await getRecord(indexeddb, "documents", id);
    }        

    async storeRecord(collectionName: string, record: any): Promise<void> {
        const indexeddb = await this.openDatabase(collectionName);
        await storeRecord(indexeddb, "documents", record);
    }

    async deleteRecord(collectionName: string, id: string): Promise<void> {
        const indexeddb = await this.openDatabase(collectionName);
        await deleteRecord(indexeddb, "documents", id);
    }

    async deleteAllRecords(collectionName: string): Promise<void> {
        const indexeddb = await this.openDatabase(collectionName);
        await deleteAllRecords(indexeddb, "documents");
    }
}