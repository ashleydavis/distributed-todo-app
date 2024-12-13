import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { SyncEngine, DatabaseUpdate, Database, ICollection, IDocument } from "sync";
import { IIndexeddbDatabaseConfiguration, openDatabase, deleteRecord as _deleteRecord, IIndexeddbCollectionConfig } from "./indexeddb";
import { v4 as uuid } from "uuid";
import { IndexeddbStorage } from "./indexeddb-storage";

const API_BASE_URL = process.env.API_BASE_URL!;
if (!API_BASE_URL) {
    throw new Error(`API_BASE_URL environment variable is required.`);
}

//
// Hook to access the database.
//
export interface IDatabaseHook {
    //
    // The database.
    //
    database?: Database;

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

    const value: IDatabaseHook = {
        database: databaseRef.current,
        userId,
        changeUser,
        loaded,
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
export function useCollection<T extends IDocument>(collectionName: string): ICollectionHook<T> {
    const { database, loaded } = useDatabase();
    return {
        loaded,
        collection: {
            name: () => collectionName,
            getAll: () => {
                if (!database) {
                    throw new Error(`Database is not open.`);
                }
                return database.collection<T>(collectionName).getAll();
            },
            getOne: (id: string) => {
                if (!database) {
                    throw new Error(`Database is not open.`);
                }
                return database.collection<T>(collectionName).getOne(id);
            },
            deleteOne: (id: string) => {
                if (!database) {
                    throw new Error(`Database is not open.`);
                }
                return database.collection<T>(collectionName).deleteOne(id);
            },
            upsertOne: (id: string, record: Omit<T, "_id">) => {
                if (!database) {
                    throw new Error(`Database is not open.`);
                }
                return database.collection<T>(collectionName).upsertOne(id, record);
            },
            subscribe: (callback) => {
                if (!database) {
                    throw new Error(`Database is not open.`);
                }
                return database.collection<T>(collectionName).subscribe(callback);
            },
        }
    };
}

//
// Function to transform a collection of records.
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
}

//
// Hook to access a collection of documents.
//
export function useQuery<T extends IDocument>(collectionName: string, options?: IQueryOptions<T>): { documents: T[] } {
    
    const { collection, loaded } = useCollection<T>(collectionName);
    const [ documents, setDocuments ] = useState<T[]>([]);

    useEffect(() => {
        if (!loaded) {
            return;
        }

        collection.getAll()
            .then((documents) => {
                if (options?.transform) {
                    documents = options.transform(documents);
                }
                setDocuments(documents);
            });
    }, [loaded]);

    useEffect(() => {
        if (!loaded) {
            return;
        }

        //
        // Subscribe to changes to the collection and update the query.
        //
        const subscription = collection.subscribe((updates) => {
            let working = documents.slice(); 

            //
            // Apply the updates to the documents in state.
            //
            for (const update of updates) {
                if (update.type === "field") {
                    let documentIndex = working.findIndex(document => document._id === update.recordId); //todo: Could be a fast lookup.
                    if (documentIndex === -1) {                   
                        //
                        // Creates the document.
                        //
                        const record: any = {
                            _id: update.recordId,
                            [update.field]: update.value,
                        };
                        working.push(record);
                    }
                    else {
                        //
                        // Updates the document.
                        //
                        (working[documentIndex] as any)[update.field] = update.value;
                    }                }
                else if (update.type === "delete") {
                    const deleteIndex = working.findIndex(document => document._id === update.recordId); //todo: Could be a fast lookup.
                    if (deleteIndex !== -1) {
                        working.splice(deleteIndex, 1);
                    }
                }
            }

            if (options?.transform) {
                working = options.transform(working);
            }
            setDocuments(working);
        });

        return () => {
            subscription.unsubscribe();
        };

    }, [loaded, documents]);

    return { documents };
}

//
// Hook to access a single document.
//
export function useDocumentQuery<T extends IDocument>(collectionName: string, recordId: string) {
    const { collection, loaded } = useCollection<T>(collectionName);
    const [document, setDocument] = useState<T | undefined>(undefined);
    
    useEffect(() => {
        if (!loaded) {
            return;
        }

        collection.getOne(recordId)
            .then((document) => {
                setDocument(document);
            });

        //
        // Subscribe to changes to the document.
        //
        const subscription = collection.subscribe((updates) => {
            let working: any = undefined;

            for (const update of updates) {
                if (update.recordId === recordId) {
                    if (update.type === "delete") {
                        setDocument(undefined);
                        break;
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
                setDocument(working);
            }
        });

        return () => {
            subscription.unsubscribe();
        };

    }, [loaded, recordId]);

    return { document };
}