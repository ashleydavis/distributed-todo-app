import { IStorage } from "sync";
import { deleteAllRecords, deleteRecord, getAllRecords, getRecord, storeRecord } from "./indexeddb";

//
// A wrapper around the IndexedDB storage to plug it into the sync library.
//
export class IndexeddbStorage implements IStorage {

    constructor(private indexeddb: IDBDatabase) {
    }

    async getAllRecords<RecordT>(collectionName: string): Promise<RecordT[]> {
        return await getAllRecords(this.indexeddb, collectionName);
    }

    async getRecord<RecordT>(collectionName: string, id: string): Promise<RecordT | undefined> {
        return await getRecord(this.indexeddb, collectionName, id);
    }        

    async storeRecord(collectionName: string, record: any): Promise<void> {
        await storeRecord(this.indexeddb, collectionName, record);
    }

    async deleteRecord(collectionName: string, id: string): Promise<void> {
        await deleteRecord(this.indexeddb, collectionName, id);
    }

    async deleteAllRecords(collectionName: string): Promise<void> {
        await deleteAllRecords(this.indexeddb, collectionName);
    }
}