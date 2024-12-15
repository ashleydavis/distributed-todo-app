import { IStorage } from "sync";
import { deleteAllDocuments, deleteDocument, getAllDocuments, getMatchingDocuments, getDocument, hasIndex, IIndexeddbDatabaseConfiguration, openDatabase, storeDocument } from "./indexeddb";

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
    private async openDatabase(collectionName: string, index?: string, versionNumber?: number): Promise<IDBDatabase> {
        let indexeddb = this.indexeddb[collectionName];
        if (!indexeddb) {
            const databaseConfiguration: IIndexeddbDatabaseConfiguration = {
                versionNumber: versionNumber,
                collections: [{
                    name: "documents",
                    idField: "_id",
                    indexKeys: index ? [ index ] : undefined,
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

    async getAllDocuments<DocumentT>(collectionName: string): Promise<DocumentT[]> {
        const indexeddb = await this.openDatabase(collectionName);
        return await getAllDocuments(indexeddb, "documents");
    }

    async getMatchingDocuments<DocumentT>(collectionName: string, fieldName: string, fieldValue: string): Promise<DocumentT[]> {
        let databaseVersion: number | undefined = undefined;
        let indexeddb: IDBDatabase | undefined = this.indexeddb[collectionName];
        if (indexeddb !== undefined) {
            //
            // Database is open.
            // Check if the index exists.
            //
            const hasIndexResult = await hasIndex(indexeddb, "documents", fieldName);
            if (!hasIndexResult) {
                //
                // Index doesn't exist, close the database to make it reopen with the new index.
                //
                databaseVersion = indexeddb.version + 1;
                indexeddb.close();
                delete this.indexeddb[collectionName];
                indexeddb = undefined;
            }
        }

        if (indexeddb === undefined) {
            //
            // Open the database with the requested index.
            //
            indexeddb = await this.openDatabase(collectionName, fieldName, databaseVersion);
        }
        return await getMatchingDocuments(indexeddb, "documents", fieldName, fieldValue);
    }

    async getDocument<DocumentT>(collectionName: string, id: string): Promise<DocumentT | undefined> {
        const indexeddb = await this.openDatabase(collectionName);
        return await getDocument(indexeddb, "documents", id);
    }

    async storeDocument<DocumentT>(collectionName: string, document: DocumentT): Promise<void> {
        const indexeddb = await this.openDatabase(collectionName);
        await storeDocument(indexeddb, "documents", document);
    }

    async deleteDocument(collectionName: string, id: string): Promise<void> {
        const indexeddb = await this.openDatabase(collectionName);
        await deleteDocument(indexeddb, "documents", id);
    }

    async deleteAllDocuments(collectionName: string): Promise<void> {
        const indexeddb = await this.openDatabase(collectionName);
        await deleteAllDocuments(indexeddb, "documents");
    }
}