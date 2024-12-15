import crypto from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
import { Database } from "sync";

//
// Create a hash of the database that can be used to determine if
// two databases are the same.
//
export async function hashDatabase(database: Database): Promise<string> {
  const documentMap: any = {};

  for (const collection of database.collections) {
      const documents = (await collection.getAll()).slice();
      documents.sort((a, b) => a._id.localeCompare(b._id));
      documentMap[collection.name()] = documents;
  }

  return crypto.createHash('sha256')
      .update(jsonStableStringify(documentMap))
      .digest('hex');
}
