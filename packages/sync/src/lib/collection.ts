import { DatabaseUpdate } from "./database-update";
import { IDocument } from "./document";
import { IStorage } from "./storage";

//
// Represents a subscriptipon to updates on a database collection.
//
export interface ISubscription {
    //
    // Unsubscribes from the updates.
    //
    unsubscribe(): void;
}

//
// The type of a function that can be called when a subscription receives updates.
//
export type SubscriptionCallbackFn = (updates: DatabaseUpdate[]) => void;

//
// The type of a function that can be called when outgoing updates are received.
//
export type OnOutgoingUpdatesFn = (updates: DatabaseUpdate[]) => Promise<void>;

export interface ICollection<RecordT extends IDocument> {
    //
    // Gets the name of the collection.
    //
    name(): string;

    //
    // Gets all the records in the collection.
    //
    getAll(): Promise<RecordT[]>;

    //
    // Gets a record by id.
    
    getOne(recordId: string): Promise<RecordT | undefined>;

    //
    // Upserts a record in the database.
    //
    upsertOne(recordId: string, update: Omit<Partial<RecordT>, "_id">): Promise<void>;

    //
    // Deletes a record from the database.
    //
    deleteOne(recordId: string): Promise<void>;

    //
    // Subscribes to updates on the collection.
    //
    subscribe(callback: SubscriptionCallbackFn): ISubscription;
}

//
// Represents a collection of records in the database.
//
export class Collection<RecordT extends IDocument> implements ICollection<RecordT> {

    //
    // The subscriptions to updates on this collection.
    //
    private subscriptions: SubscriptionCallbackFn[] = [];

    constructor(private collectionName: string, private storage: IStorage, private onOutgoingUpdates: OnOutgoingUpdatesFn) {
    }

    //
    // Gets the name of the collection.
    //
    name(): string {
        return this.collectionName;
    }

    //
    // Gets all the records in the collection.
    //
    getAll(): Promise<RecordT[]> {
        return this.storage.getAllRecords<RecordT>(this.collectionName);
    }

    //
    // Gets a record by id.
    //
    getOne(recordId: string): Promise<RecordT | undefined> {
        return this.storage.getRecord<RecordT>(this.collectionName, recordId);
    }

    //
    // Upserts a record in the database.
    //
    async upsertOne(recordId: string, update: Omit<Partial<RecordT>, "_id">): Promise<void> {
        const updates: DatabaseUpdate[] = Object.keys(update)
            .filter(field => field !== '_id')
            .map(field => {
                return {
                    type: "field",
                    timestamp: Date.now(),
                    collectionName: this.collectionName,
                    recordId: recordId,
                    field: field,
                    value: (update as any)[field],
                };
            });

        //
        // Trigger subscriptions and update in-memory state before the database is updated.
        //
        this.notifySubscriptions(updates); 

        //
        // Queue outgoing updates to other clients.
        //
        await this.onOutgoingUpdates(updates);

        //
        // Update the record in the database.
        //
        // This could be kind of expensive. Getting the record and saving it for every update.
        // But the subscription system means the UI doesn't wait for it it to complete.
        //
        // todo: Maybe a document cache is all that's needed?
        //
        let record = await this.storage.getRecord<RecordT>(this.collectionName, recordId); 
        if (!record) {
            record = {
                _id: recordId,
                ...update
            } as RecordT;
        }
        else {
            record = {
                ...record,
                ...update
            };
        }

        await this.storage.storeRecord(this.collectionName, record);
    }

    //
    // Deletes a record from the database.
    //
    async deleteOne(recordId: string): Promise<void> {

        const updates: DatabaseUpdate[] = [{
            type: "delete",
            timestamp: Date.now(),
            collectionName: this.collectionName,
            recordId: recordId,
        }];

        //
        // Trigger subscriptions and update in-memory state before the database is updated.
        //
        this.notifySubscriptions(updates); 

        //
        // Queue outgoing updates to other clients.
        //
        await this.onOutgoingUpdates(updates);

        //
        // Delete from indexedd db.
        //
        await this.storage.deleteRecord(this.collectionName, recordId);
    }

    //
    // Apply updates to the in-memory data.
    //
    async applyIncomingUpdates(updates: DatabaseUpdate[]): Promise<void> { //todo: This can even be moved up to the database level. Can do a Promise.all for these ops.
       
        for (const update of updates) {
            if (update.collectionName !== this.collectionName) {
                throw new Error(`Update collection name ${update.collectionName} does not match collection name ${this.collectionName}.`);
            }

            if (update.type === 'field') {
                //
                // Update the record in the database.
                //
                let record = await this.storage.getRecord<RecordT>(this.collectionName, update.recordId);
                if (!record) {
                    record = {
                        _id: update.recordId,
                        [update.field]: update.value,
                    } as any;
                }
                else {
                    record = {
                        ...record,
                        [update.field]: update.value,
                    };
                }

                await this.storage.storeRecord(this.collectionName, record!);
            }
            else if (update.type === 'delete') {                
                //
                // Delete the record from the database.
                //
                await this.storage.deleteRecord(this.collectionName, update.recordId);
            }
        }
    }

    //
    // Notify subscriptions of updates.
    //
    notifySubscriptions(updates: DatabaseUpdate[]): void {
        for (const subscription of this.subscriptions) {
            subscription(updates);
        }
    }

    //
    // Subscribes to updates on the collection.
    //
    subscribe(callback: SubscriptionCallbackFn): ISubscription {
        this.subscriptions.push(callback);

        return {
            unsubscribe: () => {
                const index = this.subscriptions.indexOf(callback);
                if (index !== -1) {
                    this.subscriptions.splice(index, 1);
                }
            }
        };
    }
}