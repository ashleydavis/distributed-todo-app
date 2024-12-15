//
// Configuratino for an indexedb collection.
//
export interface IIndexeddbCollectionConfig {
    //
    // The name of the collection.
    //
    name: string;

    //
    // The field that is used as the id.
    //
    idField: string;

    //
    // Keys used to index the collection.
    //
    indexKeys?: string[];
}

//
// Configures a database.
//
export interface IIndexeddbDatabaseConfiguration {
    //
    // The configuration of the collections in the database.
    //
    collections: IIndexeddbCollectionConfig[];

    //
    // The version number of the database.
    //
    versionNumber?: number;
}

//
// Opens the database.
//
export function openDatabase(databaseName: string, configuration: IIndexeddbDatabaseConfiguration): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, configuration.versionNumber);

        request.onupgradeneeded = event => { // This is called when the version field above is incremented.
            createObjectStores(event.target as IDBOpenDBRequest, configuration.collections);
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
//
// Creates object store only if they don't already exist.
//
function createObjectStores(dbOpenRequest: IDBOpenDBRequest, collections: IIndexeddbCollectionConfig[]) {
    const db = dbOpenRequest.result;
    for (const collection of collections) {
        let objectStore: IDBObjectStore;
        if (!db.objectStoreNames.contains(collection.name)) {
            // Creates the collection.
            objectStore = db.createObjectStore(collection.name, { keyPath: collection.idField });
        }
        else {
            // Gets the collection.
            objectStore = dbOpenRequest.transaction!.objectStore(collection.name);
        }

        if (collection.indexKeys) {
            // Add indexes.
            for (const indexKey of collection.indexKeys) {
                if (!objectStore.indexNames.contains(indexKey)) {
                    objectStore.createIndex(indexKey, indexKey, { unique: false });
                }
            }
        }
    }
}

//
// Stores a document in the database.
//
export function storeDocument<DocumentT>(db: IDBDatabase, collectionName: string, document: DocumentT): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(collectionName, 'readwrite');
        const store = transaction.objectStore(collectionName);
        const request = store.put(document);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

//
// Gets a document from the database.
//
export function getDocument<DocumentT>(db: IDBDatabase, collectionName: string, documentId: string): Promise<DocumentT | undefined> {
    return new Promise<DocumentT>((resolve, reject) => {
        const transaction = db.transaction(collectionName, 'readonly');
        const store = transaction.objectStore(collectionName);
        const request = store.get(documentId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

//
// Gets the least recent document from the database.
// This relies on the ids being timestamps in reverse chronological order.
//
export function getLeastRecentDocument<DocumentT>(db: IDBDatabase, collectionName: string): Promise<[string, DocumentT] | undefined> {
    return new Promise<[string, DocumentT] | undefined>((resolve, reject) => {
        const transaction = db.transaction(collectionName, 'readonly');
        const store = transaction.objectStore(collectionName);
        const request = store.openCursor(null, 'prev');
        request.onerror = () => reject(request.error);
        request.onsuccess = event => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                resolve([cursor.key as string, cursor.value]);
            }
            else {
                resolve(undefined);
            }
        };
    });
}

//
// Gets all document ids from the database.
//
export function getAllKeys(db: IDBDatabase, collectionName: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        const transaction = db.transaction([collectionName], "readonly");
        const store = transaction.objectStore(collectionName);
        const allRecordsRequest = store.getAllKeys();
        allRecordsRequest.onsuccess = () => resolve(Array.from(allRecordsRequest.result as string[]));
        allRecordsRequest.onerror = () => reject(allRecordsRequest.error);
    });
}

//
// Gets all documents from the database.
//
export function getAllDocuments<DocumentT>(db: IDBDatabase, collectionName: string): Promise<DocumentT[]> {
    return new Promise<DocumentT[]>((resolve, reject) => {
        const transaction = db.transaction([collectionName], "readonly");
        const store = transaction.objectStore(collectionName);
        const allRecordsRequest = store.getAll();
        allRecordsRequest.onsuccess = () => resolve(allRecordsRequest.result);
        allRecordsRequest.onerror = () => reject(allRecordsRequest.error);
    });
}

//
// Checks if an index exists.
//
export function hasIndex(db: IDBDatabase, collectionName: string, indexName: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const transaction = db.transaction([collectionName], "readonly");
        const store = transaction.objectStore(collectionName);
        resolve(store.indexNames.contains(indexName));
    });
}

//
// Gets all documents that have a field with a matching value.
//
export function getMatchingDocuments<DocumentT>(db: IDBDatabase, collectionName: string, fieldName: string, fieldValue: any): Promise<DocumentT[]> {
    return new Promise<DocumentT[]>((resolve, reject) => {
        const transaction = db.transaction([collectionName], "readonly");
        const store = transaction.objectStore(collectionName);
        const index = store.index(fieldName);
        const request = index.getAll(fieldValue);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

//
// Gets all documents matching the requested from the database.
//
export function getAllByIndex<DocumentT>(db: IDBDatabase, collectionName: string, indexName: string, indexValue: any): Promise<DocumentT[]> {
    return new Promise<DocumentT[]>((resolve, reject) => {
        const transaction = db.transaction([collectionName], "readonly");
        const store = transaction.objectStore(collectionName);
        const index = store.index(indexName);
        const request = index.getAll(indexValue);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

//
// Deletes a document.
//
export function deleteDocument(db: IDBDatabase, collectionName: string, documentId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(collectionName, 'readwrite');
        const store = transaction.objectStore(collectionName);
        const request = store.delete(documentId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

//
// Deletes all documents in a collection.
//
export function deleteAllDocuments(db: IDBDatabase, collectionName: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(collectionName, 'readwrite');
        const store = transaction.objectStore(collectionName);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

//
// Gets the number of documents in the collection.
//
export function getNumDocuments(db: IDBDatabase, collectionName: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const transaction = db.transaction([collectionName], 'readonly');
        const store = transaction.objectStore(collectionName);
        const request = store.count();
        request.onsuccess = () => {
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

//
// Deletes the database.
//
export function deleteDatabase(databaseName: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Database deletion is blocked"));
    });
}