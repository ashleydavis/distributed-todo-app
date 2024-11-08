//
// An abstracted storage mechanism for the database.
//
export interface IStorage {

    //
    // Gets all records in a collection.
    //
    getAllRecords<RecordT>(collectionName: string): Promise<RecordT[]>;

    //
    // Gets one record from the database.
    //
    getRecord<RecordT>(collectionName: string, id: string): Promise<RecordT | undefined>;

    //
    // Stores a record in the database.
    //
    storeRecord(collectionName: string, record: any): Promise<void>;

    //
    // Deletes a record from the database.
    //
    deleteRecord(collectionName: string, id: string): Promise<void>;

    //
    // Deletes all records from a collection.
    //
    deleteAllRecords(collectionName: string): Promise<void>;
}