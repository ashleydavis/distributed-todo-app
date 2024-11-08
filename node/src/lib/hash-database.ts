import crypto from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
import { Database } from "sync";

//
// Create a hash of the database that can be used to determine if
// two databases are the same.
//
export function hashDatabase(database: Database): string {
  const recordMap: any = {};

  for (const collection of database.collections) {
      const records = collection.getAll().slice();
      records.sort((a, b) => a.id.localeCompare(b.id));
      recordMap[collection.name()] = records;
  }

  return crypto.createHash('sha256')
      .update(jsonStableStringify(recordMap))
      .digest('hex');
}