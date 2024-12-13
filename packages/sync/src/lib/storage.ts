import { IDocument } from "./document";

//
// An abstracted storage mechanism for the database.
//
export interface IStorage {

    //
    // Gets all records in a collection.
    //
    getAllRecords<RecordT extends IDocument>(collectionName: string): Promise<RecordT[]>;

    //
    // Gets one record from the database.
    //
    getRecord<RecordT extends IDocument>(collectionName: string, id: string): Promise<RecordT | undefined>;

    //
    // Stores a record in the database.
    //
    storeRecord<RecordT extends IDocument>(collectionName: string, record: RecordT): Promise<void>;

    //
    // Deletes a record from the database.
    //
    deleteRecord(collectionName: string, id: string): Promise<void>;

    //
    // Deletes all records from a collection.
    //
    deleteAllRecords(collectionName: string): Promise<void>;
}