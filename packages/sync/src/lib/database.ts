import { Collection, IRecord, OnOutgoingUpdatesFn } from './collection';
import { DatabaseUpdate } from './database-update';
import { IStorage } from './storage';

export class Database {

    //
    // Database collections.
    //
    private collectionMap = new Map<string, Collection<any>>();

    //
    // The collections in the database.
    //
    readonly collections: Collection<any>[] = [];    

    constructor(private storage: IStorage, private onOutgoingUpdates: OnOutgoingUpdatesFn) {
    }

    //
    // Gets a collection from the database.
    //
    collection<RecordT extends IRecord>(collectionName: string): Collection<RecordT> {
        let collection = this.collectionMap.get(collectionName);
        if (!collection) {
            collection = new Collection(collectionName, this.storage, this.onOutgoingUpdates);

            this.collectionMap.set(collectionName, collection);
            this.collections.push(collection);
        }

        return collection;
    }

    //
    // Apply updates to the in-memory data.
    //
    applyIncomingUpdates(updates: DatabaseUpdate[]) {

        //todo: when a collection isn't loaded... still want to update the indexeddb.

        for (const collection of this.collectionMap.values()) {
            collection.applyIncomingUpdates(updates);
        }
    }
}
