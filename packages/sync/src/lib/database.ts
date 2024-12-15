import { Collection, ICollection, OnOutgoingUpdatesFn } from './collection';
import { DatabaseUpdate } from './database-update';
import { IDocument } from './document';
import { IStorage } from './storage';

export interface IDatabase {
    //
    // Gets a collection from the database.
    //
    collection<DocumentT extends IDocument>(collectionName: string): ICollection<DocumentT>;
}

export class Database implements IDatabase {

    //
    // Database collections.
    //
    private collectionMap = new Map<string, Collection<IDocument>>();

    //
    // The collections in the database.
    //
    readonly collections: Collection<IDocument>[] = [];

    constructor(private storage: IStorage, private onOutgoingUpdates: OnOutgoingUpdatesFn) {
    }

    //
    // Gets a collection from the database.
    //
    collection<DocumentT extends IDocument>(collectionName: string): ICollection<DocumentT> {
        return this._collection<DocumentT>(collectionName);
    }

    //
    // Internal version of collection that returns the full collection type.
    //
    private _collection<DocumentT extends IDocument>(collectionName: string): Collection<DocumentT> {
        let collection = this.collectionMap.get(collectionName);
        if (!collection) {
            collection = new Collection(collectionName, this.storage, this.onOutgoingUpdates);

            this.collectionMap.set(collectionName, collection);
            this.collections.push(collection);
        }

        return collection as Collection<DocumentT>;
    }

    //
    // Apply updates to the database.
    //
    async applyIncomingUpdates(updates: DatabaseUpdate[]): Promise<void> {

        //
        // Sort updates by collections.
        //
        const collections = new Map<string, DatabaseUpdate[]>();
        for (const update of updates) {
            let collectionUpdates = collections.get(update.collection);
            if (!collectionUpdates) {
                collectionUpdates = [];
                collections.set(update.collection, collectionUpdates);
            }

            collectionUpdates.push(update);
        }

        //
        // Trigger subscriptions first to update in-memory state for a fast UI.
        //
        for (const [collectionName, collectionUpdates] of collections.entries()) {
            const collection = this._collection(collectionName);
            await collection.notifySubscriptions(collectionUpdates);
        }

        //
        // Applies updates into the datbase.
        //
        for (const [collectionName, collectionUpdates] of collections.entries()) {
            const collection = this._collection(collectionName);
            await collection.applyIncomingUpdates(collectionUpdates);
        }
    }
}
