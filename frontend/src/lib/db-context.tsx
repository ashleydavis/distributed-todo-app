import React, { createContext, MutableRefObject, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SyncEngine, DatabaseUpdate, Database, ICollection, IDocument, IDatabase, ISubscription, SubscriptionCallbackFn } from "sync";
import { deleteDocument as _deleteDocument } from "./indexeddb";
import { v4 as uuid } from "uuid";
import { IndexeddbStorage } from "./indexeddb-storage";

const API_BASE_URL = process.env.API_BASE_URL!;
if (!API_BASE_URL) {
    throw new Error(`API_BASE_URL environment variable is required.`);
}

class Collection<DocumentT extends IDocument> implements ICollection<DocumentT> {

    constructor(private databaseRef: MutableRefObject<IDatabase | undefined>, private collectionName: string) {
    }

    name() {
        return this.collectionName;
    }

    getAll() {
        if (!this.databaseRef.current) {
            throw new Error(`Database is not open.`);
        }
        return this.databaseRef.current.collection<DocumentT>(this.collectionName).getAll();
    }

    getMatching(fieldName: string, fieldValue: string) {
        if (!this.databaseRef.current) {
            throw new Error(`Database is not open.`);
        }
        return this.databaseRef.current.collection<DocumentT>(this.collectionName).getMatching(fieldName, fieldValue);
    }

    getOne(id: string) {
        if (!this.databaseRef.current) {
            throw new Error(`Database is not open.`);
        }
        return this.databaseRef.current.collection<DocumentT>(this.collectionName).getOne(id);
    }

    deleteOne(id: string) {
        if (!this.databaseRef.current) {
            throw new Error(`Database is not open.`);
        }
        return this.databaseRef.current.collection<DocumentT>(this.collectionName).deleteOne(id);
    }

    upsertOne(id: string, update: Omit<DocumentT, "_id">) {
        if (!this.databaseRef.current) {
            throw new Error(`Database is not open.`);
        }
        return this.databaseRef.current.collection<DocumentT>(this.collectionName).upsertOne(id, update);
    }

    subscribe(callback: SubscriptionCallbackFn) {
        if (!this.databaseRef.current) {
            throw new Error(`Database is not open.`);
        }
        return this.databaseRef.current.collection<DocumentT>(this.collectionName).subscribe(callback);
    }
}

//
// Hook to access the database.
//
export interface IDatabaseHook {
    //
    // The database.
    //
    database: IDatabase;

    //
    // Set to true when the database is loaded.
    //
    loaded: boolean;

    //
    // The user id.
    //
    userId: string;

    //
    // Changes to a different user.
    // Simulates logging out and logging in.
    //
    changeUser: (userId: string) => void;

    //
    // Gets a collection from the database.
    //
    collection<DocumentT extends IDocument>(collectionName: string): ICollection<DocumentT>;
}

const DatabaseContext = createContext<IDatabaseHook | undefined>(undefined);

export interface IProps {
    //
    // The name of the database to open.
    //
    databaseName: string;

    children: ReactNode | ReactNode[];
}

export function DatabaseContextProvider({ databaseName, children }: IProps) {

    //
    // Reference to database storage.
    //
    const storageRef = useRef<IndexeddbStorage | undefined>(undefined);

    //
    // Reference to the database.
    //
    const databaseRef = useRef<Database | undefined>(undefined);

    //
    // Reference to the synchronization engine.
    //
    const syncEngineRef = useRef<SyncEngine | undefined>(undefined);

    //
    // Eventually this must be passed to the server as a JWT form the auth system.
    //
    const [userId, setUserId] = useState<string>("user-1");

    //
    // Look up table for collections.
    //
    const collectMapRef = useRef<{ [collectionName: string]: Collection<any> }>({});

    //
    // Changes to a different user.
    // Simulates logging out and logging in.
    //
    function changeUser(userId: string): void {
        setUserId(userId);
    }

    // Set to true when the database is loaded.
    //
    const [loaded, setLoaded] = useState(false);

    //
    // Receives updates from other clients and applies them to the database.
    //
    async function onIncomingUpdates(updates: DatabaseUpdate[]): Promise<void> {
        if (!databaseRef.current) {
            throw new Error(`Database is not open.`);
        }

        await databaseRef.current.applyIncomingUpdates(updates);
    }

    //
    // Routes outgoing updates from the database to the synchronization engine.
    //
    async function onOutgoingUpdates(updates: DatabaseUpdate[]): Promise<void> {
        if (!syncEngineRef.current) {
            throw new Error(`Synchronization engine is not created!`);
        }

        await syncEngineRef.current.commitUpdates(updates);
    }

    useEffect(() => {

        let nodeId = uuid();

        console.log(`Starting the sync engine for user ${userId} and node ${nodeId}`);

        const userDatabaseName = `${databaseName}-${userId}`;

        storageRef.current = new IndexeddbStorage(userDatabaseName);
        const database = new Database(storageRef.current, onOutgoingUpdates);
        databaseRef.current = database;
        setLoaded(true);

        syncEngineRef.current = new SyncEngine(nodeId, userId, API_BASE_URL, onIncomingUpdates, storageRef.current, 1000);
        syncEngineRef.current.startSync()
            .catch(error => {
                console.error(`Failed to open database and start synchronization:`);
                console.error(error.stack || error.message || error);
            });

        return () => {
            console.log(`Stopping the sync engine for user ${userId} and node ${nodeId}`);
            setLoaded(false);

            //
            // Stop the synchronization engine.
            //
            if (syncEngineRef.current) {
                syncEngineRef.current.stopSync();
                syncEngineRef.current = undefined;
            }

            if (storageRef.current) {
                storageRef.current.close();
                storageRef.current = undefined;
            }

            databaseRef.current = undefined;
        };
    }, [userId]);

    //
    // Gets a collection from the database.
    //
    function collection<DocumentT extends IDocument>(collectionName: string): ICollection<DocumentT> {
        let collection = collectMapRef.current[collectionName];
        if (!collection) {
            collection = collectMapRef.current[collectionName] = new Collection<any>(databaseRef, collectionName);
        }
        return collection;
    }

    const database: IDatabase = {
        collection: (collectionName: string) => {
            return collection(collectionName);
        },
    }

    const value: IDatabaseHook = {
        database,
        userId,
        changeUser,
        loaded,
        collection,
    };

    return (
        <DatabaseContext.Provider value={value} >
            {children}
        </DatabaseContext.Provider>
    );
}

//
// Hook to access the database.
//
export function useDatabase(): IDatabaseHook {
    const context = useContext(DatabaseContext);
    if (!context) {
        throw new Error(`Database context is not set! Add DatabaseContextProvider to the component tree.`);
    }
    return context;
}

export interface ICollectionHook<T extends IDocument> {
    //
    // Set to true when the database is loaded.
    //
    loaded: boolean;

    //
    // The database collection.
    //
    collection: ICollection<T>;
}

//
// Hook to access a collection of documents.
//
export function useCollection<DocumentT extends IDocument>(collectionName: string): ICollectionHook<DocumentT> {
    const { database, loaded } = useDatabase();
    return {
        loaded,
        collection: database.collection<DocumentT>(collectionName),
    };
}

//
// Function to transform a collection of documents.
//
export type TransformFn<T extends IDocument> = (documents: T[]) => T[];

//
// Options for the query.
//
export interface IQueryOptions<T extends IDocument> {
    //
    // Function to transform the documents before they are set in state.
    //
    transform?: TransformFn<T>;

    //
    // The query to filter the documents.
    // Matches documents where the requested field equals the value.
    //
    match?: {
        //
        // The field name to match.
        //
        name: string;

        //
        // The value to match.
        //
        value: any;
    }
}

export interface IQueryResult<DocumentT extends IDocument> {
    //
    // Set to true when loading.
    //
    loading: boolean;

    //
    // Set to true when loaded.
    //
    loaded: boolean;

    //
    // Set if an error occurred.
    //
    error: any;

    //
    // The documents in the query.
    //
    documents: DocumentT[];
}

//
// Represents the state of a query.
//
interface IQueryState<DocumentT extends IDocument> {
    //
    // Set to true while loadinbg.
    //
    loading: boolean;

    //
    // Set to true when loaded.
    //
    loaded: boolean;

    //
    // Set to the error, if an error occurred.
    //
    error: any;

    //
    // The documents that the query retrieved.
    //
    documents: DocumentT[];
}

//
// Execute a query to retrieve items from the database.
//
async function executeQuery<DocumentT extends IDocument>(collection: ICollection<DocumentT>, options?: IQueryOptions<DocumentT>): Promise<IQueryState<DocumentT>> {

    let query: Promise<DocumentT[]>;

    if (options?.match) {
        //
        // Matches requested documents.
        //
        query = collection.getMatching(options.match.name, options.match.value);
    }
    else {
        //
        // Gets all documents.
        //
        query = collection.getAll();
    }

    let documents = await query;

    if (options?.transform) {
        documents = options.transform(documents);
    }

    return {
        loading: false,
        loaded: true,
        error: undefined,
        documents,
    };
}

//
// Updates query results from incoming database updates.
//
async function updateQueryResult<DocumentT extends IDocument>(
    curQueryState: IQueryState<DocumentT>,
    collection: ICollection<DocumentT>,
    updates: DatabaseUpdate[],
    options?: IQueryOptions<DocumentT>)
        : Promise<IQueryState<DocumentT> | undefined> {

    //
    // Always clone the documents array to avoid mutating state.
    //
    let working = curQueryState.documents;
    let cloned = false;

    //
    // Apply the updates to the documents.
    //
    for (const update of updates) {
        if (update.type === "field") {
            let documentIndex = working.findIndex(document => document._id === update._id); //todo: Could be a fast lookup.
            if (documentIndex === -1) {
                if (!options?.match
                    || (update.field === options.match.name && update.value === options.match.value)) {
                    if (!cloned) {
                        //
                        // Lazy clone, just in case we don't need any update.
                        //
                        working = working.slice();
                        cloned = true;
                    }
                    //
                    // Adds the document to the query result.
                    //
                    const existingDocument = await collection.getOne(update._id);
                    const updatedDocument: any = {
                        _id: update._id,
                        ...(existingDocument || {}),
                        [update.field]: update.value,
                    };
                    working.push(updatedDocument);
                }
                else {
                    // Document update doesn't match the query.
                }
            }
            else {
                if (options?.match && update.field === options.match.name && update.value !== options.match.value) {
                    if (!cloned) {
                        //
                        // Lazy clone, just in case we don't need any update.
                        //
                        working = working.slice();
                        cloned = true;
                    }
                    //
                    // Removes the document if it no longer matches the query.
                    //
                    working.splice(documentIndex, 1);
                }
                else {
                    if (!cloned) {
                        //
                        // Lazy clone, just in case we don't need any update.
                        //
                        working = working.slice();
                        cloned = true;
                    }
                    //
                    // Updates the document in the query results.
                    //
                    (working[documentIndex] as any)[update.field] = update.value;
                }
            }
        }
        else if (update.type === "delete") {
            //
            // Removes the document from the query results.
            //
            const deleteIndex = working.findIndex(document => document._id === update._id); //todo: Could be a fast lookup.
            if (deleteIndex !== -1) {
                if (!cloned) {
                    //
                    // Lazy clone, just in case we don't need any update.
                    //
                    working = working.slice();
                    cloned = true;
                }
                working.splice(deleteIndex, 1);
            }
        }
    }

    if (cloned) {
        if (options?.transform) {
            working = options.transform(working);
        }

        return {
            loading: false,
            loaded: true,
            error: undefined,
            documents: working,
        }
    }
    else {
        return undefined;
    }
}

//
// Hook to query for documents in the database.
//
export function useQuery<DocumentT extends IDocument>(collectionName: string, options?: IQueryOptions<DocumentT>): IQueryResult<DocumentT> {

    const { collection, loaded: databaseLoaded } = useCollection<DocumentT>(collectionName);
    const [ _, setUpdateTime ] = useState(Date.now()); // Used to make dependent component rerender.
    const match = useMemo(() => options?.match, [options?.match?.name, options?.match?.value])

    const queryState = useRef<IQueryState<DocumentT>>({
        loading: false,
        loaded: false,
        error: undefined,
        documents: [] as DocumentT[],
    });

    useEffect(() => {
        if (!databaseLoaded) {
            return;
        }

        queryState.current.loading = true;
        setUpdateTime(Date.now()); // Rerender.

        let subscription: ISubscription | undefined = undefined;

        //
        // Executes the initial query and sets the state.
        //
        executeQuery(collection, options)
            .then(newQueryState => {
                queryState.current = newQueryState;
                setUpdateTime(Date.now()); // Rerender.

                //
                // Subscribe to changes to the collection and update the query.
                //
                subscription = collection.subscribe(async (updates) => {
                    const newQueryState = await updateQueryResult(queryState.current, collection, updates, options);
                    if (newQueryState) {
                        queryState.current = newQueryState;
                        setUpdateTime(Date.now()); // Rerender.
                    }
                });
            })
            .catch(error => {
                queryState.current = {
                    loading: false,
                    loaded: true,
                    error,
                    documents: [],
                };
                setUpdateTime(Date.now()); // Rerender.
            });

        return () => {
            if (subscription) {
                subscription.unsubscribe();
                subscription = undefined;
            }
        };
    }, [databaseLoaded, collection, match]);

    return queryState.current;
}

//
// Represents the state of a query for a single document.
//
interface IQueryDocumentState<DocumentT extends IDocument> {
    //
    // Set to true while loadinbg.
    //
    loading: boolean;

    //
    // Set to true when loaded.
    //
    loaded: boolean;

    //
    // Set to the error, if an error occurred.
    //
    error: any;

    //
    // The document that the query retrieved.
    //
    document?: DocumentT;
}


//
// Hook to access a single document.
//
export function useDocument<DocumentT extends IDocument>(collectionName: string, documentId: string): IQueryDocumentState<DocumentT> {
    const { collection, loaded: databaseLoaded } = useCollection<DocumentT>(collectionName);
    const [ _, setUpdateTime ] = useState(Date.now()); // Used to make dependent component rerender.

    const queryState = useRef<IQueryDocumentState<DocumentT>>({
        loading: false,
        loaded: false,
        error: undefined,
        document: undefined,
    });

    useEffect(() => {
        if (!databaseLoaded) {
            return;
        }

        queryState.current.loading = true;
        setUpdateTime(Date.now()); // Rerender.

        let subscription: ISubscription | undefined = undefined;

        collection.getOne(documentId)
            .then((document) => {

                queryState.current = {
                    loading: false,
                    loaded: true,
                    error: undefined,
                    document,
                };
                setUpdateTime(Date.now()); // Rerender.

                //
                // Subscribe to changes to the document.
                //
                subscription = collection.subscribe((updates) => {
                    let working: any = undefined;

                    for (const update of updates) {
                        if (update._id === documentId) {
                            if (update.type === "delete") {
                                queryState.current = {
                                    loading: false,
                                    loaded: true,
                                    error: undefined,
                                    document,
                                };
                                setUpdateTime(Date.now()); // Rerender.
                                return;
                            }
                            else if (update.type === "field") {
                                if (!working) {
                                    working = { ...document };
                                }
                                working[update.field] = update.value;
                            }
                        }
                    }

                    if (working) {
                        setUpdateTime(Date.now()); // Rerender.
                    }
                });
            })
            .catch(error => {
                queryState.current = {
                    loading: false,
                    loaded: true,
                    error,
                    document: undefined,
                };
                setUpdateTime(Date.now()); // Rerender.
            });

        return () => {
            if (subscription) {
                subscription.unsubscribe();
                subscription = undefined;
            }
        };

    }, [databaseLoaded, collectionName, documentId]);

    return queryState.current;
}