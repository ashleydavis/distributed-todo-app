import crypto from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
import { Database } from "sync";

//
// Create a hash of the database that can be used to determine if
// two databases are the same.
//
export async function hashDatabase(database: Database): Promise<string> {
  const recordMap: any = {};

  for (const collection of database.collections) {
      const records = (await collection.getAll()).slice();
      records.sort((a, b) => a._id.localeCompare(b._id));
      recordMap[collection.name()] = records;
  }

  return crypto.createHash('sha256')
      .update(jsonStableStringify(recordMap))
      .digest('hex');
}
