import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;

export default async function setup() {
  // Single-node replica set: required for prisma.$transaction (register route)
  replSet = await MongoMemoryReplSet.create();
  process.env.DATABASE_URL = replSet.getUri('expense-tracker-test');
}

export async function teardown() {
  await replSet?.stop();
}
