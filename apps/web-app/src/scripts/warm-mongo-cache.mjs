import { MongoMemoryServer } from 'mongodb-memory-server';

MongoMemoryServer.create()
  .then((m) => m.stop())
  .then(() => console.log('mongod binary OK'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });