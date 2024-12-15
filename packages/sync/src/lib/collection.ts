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
export type SubscriptionCallbackFn = (updates: DatabaseUpdate[]) => void | Promise<void>;

//
// The type of a function that can be called when outgoing updates are received.
//
export type OnOutgoingUpdatesFn = (updates: DatabaseUpdate[]) => Promise<void>;

export interface ICollection<DocumentT extends IDocument> {
    //
    // Gets the name of the collection.
    //
    name(): string;

    //
    // Gets all the documents in the collection.
    //
    getAll(): Promise<DocumentT[]>;

    //
    // Gets all the documents in the collection that have a field with a matching value.
    //
    getMatching(fieldName: string, fieldValue: string): Promise<DocumentT[]>;

    //
    // Gets a document by id.

    getOne(documentId: string): Promise<DocumentT | undefined>;

    //
    // Upserts a document in the database.
    //
    upsertOne(documentId: string, update: Omit<Partial<DocumentT>, "_id">): Promise<void>;

    //
    // Deletes a document from the database.
    //
    deleteOne(documentId: string): Promise<void>;

    //
    // Subscribes to updates on the collection.
    //
    subscribe(callback: SubscriptionCallbackFn): ISubscription;
}

//
// Represents a collection of documents in the database.
//
export class Collection<DocumentT extends IDocument> implements ICollection<DocumentT> {

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
    // Gets all the documents in the collection.
    //
    getAll(): Promise<DocumentT[]> {
        return this.storage.getAllDocuments<DocumentT>(this.collectionName);
    }

    //
    // Gets all the documents in the collection that have a field with a matching value.
    //
    getMatching(fieldName: string, fieldValue: string): Promise<DocumentT[]> {
        return this.storage.getMatchingDocuments<DocumentT>(this.collectionName, fieldName, fieldValue);
    }

    //
    // Gets a document by id.
    //
    getOne(documentId: string): Promise<DocumentT | undefined> {
        return this.storage.getDocument<DocumentT>(this.collectionName, documentId);
    }

    //
    // Upserts a document in the database.
    //
    async upsertOne(documentId: string, update: Omit<Partial<DocumentT>, "_id">): Promise<void> {
        const updates: DatabaseUpdate[] = Object.keys(update)
            .filter(field => field !== '_id')
            .map(field => {
                return {
                    type: "field",
                    timestamp: Date.now(),
                    collection: this.collectionName,
                    _id: documentId,
                    field: field,
                    value: (update as any)[field],
                };
            });

        //
        // Trigger subscriptions and update in-memory state before the database is updated.
        //
        await this.notifySubscriptions(updates);

        //
        // Queue outgoing updates to other clients.
        //
        await this.onOutgoingUpdates(updates);

        //
        // Update the document in the database.
        //
        // This could be kind of expensive. Getting the document and saving it for every update.
        // But the subscription system means the UI doesn't wait for it it to complete.
        //
        // todo: Maybe a document cache is all that's needed?
        //
        let document = await this.storage.getDocument<DocumentT>(this.collectionName, documentId);
        if (!document) {
            document = {
                _id: documentId,
                ...update
            } as DocumentT;
        }
        else {
            document = {
                ...document,
                ...update
            };
        }

        await this.storage.storeDocument(this.collectionName, document);
    }

    //
    // Deletes a document from the database.
    //
    async deleteOne(documentId: string): Promise<void> {

        const updates: DatabaseUpdate[] = [{
            type: "delete",
            timestamp: Date.now(),
            collection: this.collectionName,
            _id: documentId,
        }];

        //
        // Trigger subscriptions and update in-memory state before the database is updated.
        //
        await this.notifySubscriptions(updates);

        //
        // Queue outgoing updates to other clients.
        //
        await this.onOutgoingUpdates(updates);

        //
        // Delete from indexedd db.
        //
        await this.storage.deleteDocument(this.collectionName, documentId);
    }

    //
    // Apply updates to the in-memory data.
    //
    async applyIncomingUpdates(updates: DatabaseUpdate[]): Promise<void> { //todo: This can even be moved up to the database level. Can do a Promise.all for these ops.

        for (const update of updates) {
            if (update.collection !== this.collectionName) {
                throw new Error(`Update collection name ${update.collection} does not match collection name ${this.collectionName}.`);
            }

            if (update.type === 'field') {
                //
                // Update the document in the database.
                //
                let document = await this.storage.getDocument<DocumentT>(this.collectionName, update._id);
                if (!document) {
                    document = {
                        _id: update._id,
                        [update.field]: update.value,
                    } as any;
                }
                else {
                    document = {
                        ...document,
                        [update.field]: update.value,
                    };
                }

                await this.storage.storeDocument(this.collectionName, document!);
            }
            else if (update.type === 'delete') {
                //
                // Delete the document from the database.
                //
                await this.storage.deleteDocument(this.collectionName, update._id);
            }
        }
    }

    //
    // Notify subscriptions of updates.
    //
    async notifySubscriptions(updates: DatabaseUpdate[]): Promise<void> {
        for (const subscription of this.subscriptions) {
            const promise = subscription(updates);
            if (promise) {
                await promise;
            }
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