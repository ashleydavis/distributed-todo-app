import { DatabaseUpdate } from "./database-update";
import { IStorage } from "./storage";

//
// Represents a database record.
//
export interface IRecord {
    //
    // The unique ID of the record.
    //
    id: string;
}

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
export type SubscriptionCallbackFn<RecordT extends IRecord> = (records: RecordT[]) => void;

//
// The type of a function that can be called when outgoing updates are received.
//
export type OnOutgoingUpdatesFn = (updates: DatabaseUpdate[]) => void;

//
// Represents a collection of records in the database.
//
export class Collection<RecordT extends IRecord> {

    //
    // The records in this collection.
    //
    private records: RecordT[] = [];

    //
    // The subscriptions to updates on this collection.
    //
    private subscriptions: SubscriptionCallbackFn<RecordT>[] = [];

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
    getAll(): RecordT[] {
        return this.records;
    }

    //
    // Upserts a record in the database.
    //
    upsertOne(recordId: string, update: Omit<Partial<RecordT>, "id">): void {
        //
        // Update in memory.
        //
        this.records = this.records.slice(); // Clone the array.
        const recordIndex = this.records.findIndex(r => r.id === recordId);
        let updatedRecord: RecordT;
        if (recordIndex < 0) {
            updatedRecord = {
                id: recordId,
                ...update
            } as any;
            this.records.push(updatedRecord);
        }
        else {
            updatedRecord = {
                ...this.records[recordIndex],
                ...update
            };
            this.records[recordIndex] = updatedRecord;
        }

        this.notifySubscriptions(); // Trigger subscriptions.

        //
        // Send outgoing updates.
        //
        this.onOutgoingUpdates(
            Object.keys(update)
                .filter(field => field !== 'id')
                .map(field => {
                    return {
                        type: "field",
                        timestamp: Date.now(),
                        collectionName: this.collectionName,
                        recordId: recordId,
                        field: field,
                        value: (update as any)[field],
                    };
                })
        );

        //
        // Store the updated record in the database.
        //
        this.storage.storeRecord(this.collectionName, updatedRecord)
            .catch(err => {
                console.error(`Error storing record ${recordId} in collection ${this.collectionName}:`);
                console.error(err.stack || err.message || err);
            });
    }

    //
    // Deletes a record from the database.
    //
    deleteOne(recordId: string): void {

        //
        // Delete from memory.
        //
        const recordIndex = this.records.findIndex(r => r.id === recordId);
        if (recordIndex === -1) {
            console.error(`Record ${recordId} not found in collection ${this.collectionName}.`);
            return;
        }

        this.records = this.records.slice(); // Clone the array.
        this.records.splice(recordIndex, 1);
        this.notifySubscriptions(); // Trigger subscriptions.

        //
        // Send outgoing updates.
        //
        this.onOutgoingUpdates([{
            type: "delete",
            timestamp: Date.now(),
            collectionName: this.collectionName,
            recordId: recordId,
        }]);

        //
        // Delete from indexedd db.
        //
        this.storage.deleteRecord(this.collectionName, recordId)
            .catch(err => {
                console.error(`Error deleting record ${recordId} from collection ${this.collectionName}:`);
                console.error(err.stack || err.message || err);
            });
    }

    //
    // Apply updates to the in-memory data.
    //
    applyIncomingUpdates(updates: DatabaseUpdate[]) {
        let changed = false;

        const updatedRecords = new Set<number>();

        for (const update of updates) {
            if (update.collectionName !== this.collectionName) {
                continue;
            }

            if (update.type === 'field') {
                if (!changed) {
                    this.records = this.records.slice(); // Clone the array.
                    changed = true;
                }

                let recordIndex = this.records.findIndex(r => r.id === update.recordId); //todo: Want fast lookup.
                if (recordIndex < 0) {                   
                    //
                    // Creates the record.
                    //
                    const record: any = {
                        id: update.recordId,
                        [update.field]: update.value,
                    };

                    this.records.push(record);
                    recordIndex = this.records.length - 1;
                }
                else {
                    this.records[recordIndex] = { // Clones the record.
                        ...this.records[recordIndex] ,
                        [update.field]: update.value,
                    };
                }

                updatedRecords.add(recordIndex);
            }
            else if (update.type === 'delete') {
                const recordIndex = this.records.findIndex(r => r.id === update.recordId);
                if (recordIndex !== -1) {
                    if (!changed) {
                        this.records = this.records.slice(); // Clone the array.
                        changed = true;
                    }

                    this.records.splice(recordIndex, 1);

                    //
                    // Delete the record from the database.
                    //
                    this.storage.deleteRecord(this.collectionName, update.recordId)
                        .catch(err => {
                            console.error(`Error deleting record ${update.recordId} from collection ${this.collectionName}:`);
                            console.error(err.stack || err.message || err);
                        });
                }
            }

            //
            // Store update records in the database.
            //
            for (const recordIndex of updatedRecords) {
                this.storage.storeRecord(this.collectionName, this.records[recordIndex])
                    .catch(err => {
                        console.error(`Error storing record ${update.recordId} in collection ${this.collectionName}:`);
                        console.error(err.stack || err.message || err);
                    });
            }
        }

        if (changed) {
            this.notifySubscriptions();
        }
    }

    //
    // Notify subscriptions of updates.
    //
    private notifySubscriptions() {
        for (const subscription of this.subscriptions) {
            subscription(this.records);
        }
    }

    //
    // Subscribes to updates on the collection.
    //
    subscribe(callback: SubscriptionCallbackFn<RecordT>): ISubscription {
        this.subscriptions.push(callback);

        //
        // Load records.
        // todo: Should only do this once even if there are multiple subscriptions.
        //
        this.storage.getAllRecords<RecordT>(this.collectionName)
            .then(records => {
                this.records = records;
                callback(this.records);
            });

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