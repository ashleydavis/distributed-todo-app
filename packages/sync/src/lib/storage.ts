import { IDocument } from "./document";

//
// An abstracted storage mechanism for the database.
//
export interface IStorage {

    //
    // Gets all documents in a collection.
    //
    getAllDocuments<DocumentT extends IDocument>(collectionName: string): Promise<DocumentT[]>;

    //
    // Gets all documents in a collection that have a field with a matching value.
    //
    getMatchingDocuments<DocumentT extends IDocument>(collectionName: string, fieldName: string, fieldValue: string): Promise<DocumentT[]>;

    //
    // Gets one document from the database.
    //
    getDocument<DocumentT extends IDocument>(collectionName: string, id: string): Promise<DocumentT | undefined>;

    //
    // Stores a document in the database.
    //
    storeDocument<DocumentT extends IDocument>(collectionName: string, document: DocumentT): Promise<void>;

    //
    // Deletes a document from the database.
    //
    deleteDocument(collectionName: string, id: string): Promise<void>;

    //
    // Deletes all documents from a collection.
    //
    deleteAllDocuments(collectionName: string): Promise<void>;
}