const mongoose = require('mongoose');
const { MongoClient } = mongoose.mongo;
const fs = require('node:fs/promises');
const path = require('node:path');
const { defaultProducts } = require('../data/productStore');
const { Product } = require('../models');

let gridFSBucket;
const databaseName = process.env.MONGODB_DATABASE || 'anantaora';
const mirrorStatus = {
  enabled: false,
  state: 'disabled',
  databaseName: null,
  lastSyncedAt: null,
};
const MAX_PENDING_MIRROR_CHANGES = 10000;

function getDatabaseMirrorStatus() {
  return { ...mirrorStatus };
}

function updateMirrorStatus(state, databaseName = mirrorStatus.databaseName) {
  mirrorStatus.enabled = Boolean(process.env.LOCAL_MONGODB_URI);
  mirrorStatus.state = state;
  mirrorStatus.databaseName = databaseName || null;
  if (state === 'healthy') {
    mirrorStatus.lastSyncedAt = new Date();
  }
}

function logMirrorFailure(error) {
  updateMirrorStatus('degraded');
  let reason = error?.message || error?.code || error?.name || 'unknown error';
  for (const uri of [process.env.MONGODB_URI, process.env.LOCAL_MONGODB_URI]) {
    if (uri) reason = reason.replaceAll(uri, '[redacted MongoDB URI]');
  }
  reason = reason.replace(/mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi, '[redacted MongoDB URI]');
  console.error(`[Mongo mirror] ${reason}; Atlas remains primary. Restart the backend to resume mirroring.`);
}

function sameMongoTarget(primaryUri, mirrorUri, targetDatabaseName = databaseName) {
  try {
    const target = (uri) => {
      const parsed = new URL(uri);
      const port = parsed.port || '27017';
      return `${parsed.hostname.toLowerCase()}:${port}/${targetDatabaseName}`;
    };
    return target(primaryUri) === target(mirrorUri);
  } catch {
    return primaryUri === mirrorUri;
  }
}

async function closeMirrorResource(resource, label) {
  if (!resource) return;
  try {
    await resource.close();
  } catch (error) {
    const reason = error?.code || error?.name || 'unknown error';
    console.error(`[Mongo mirror] failed to close ${label} (${reason}).`);
  }
}

function getDocumentValue(document, path) {
  return path.split('.').reduce((value, part) => value?.[part], document);
}

async function replaceMirrorDocument(collection, document, indexCache) {
  let uniqueIndexes = indexCache.get(collection.collectionName);
  if (!uniqueIndexes) {
    uniqueIndexes = collection
      .listIndexes()
      .toArray()
      .then((indexes) =>
        indexes.filter((index) => index.unique && index.name !== '_id_')
      )
      .catch((error) => {
        if (error.code === 26) return [];
        throw error;
      });
    indexCache.set(collection.collectionName, uniqueIndexes);
  }

  for (const index of await uniqueIndexes) {
    const filter = {};
    for (const field of Object.keys(index.key)) {
      const value = getDocumentValue(document, field);
      if (value === undefined) break;
      filter[field] = value;
    }
    if (Object.keys(filter).length !== Object.keys(index.key).length) continue;

    const conflict = await collection.findOne(
      { ...filter, ...(index.partialFilterExpression || {}) },
      { projection: { _id: 1 } }
    );
    const sameId =
      conflict?._id === document._id ||
      (typeof conflict?._id?.equals === 'function' && conflict._id.equals(document._id));
    if (conflict && !sameId) {
      await collection.deleteOne({ _id: conflict._id });
    }
  }

  await collection.replaceOne(
    { _id: document._id },
    document,
    { upsert: true }
  );
}

async function copyCollection(sourceCollection, targetCollection, indexCache) {
  const batch = [];
  const cursor = sourceCollection.find({}).batchSize(500);
  for await (const document of cursor) {
    await replaceMirrorDocument(targetCollection, document, indexCache);
  }
}

async function applyMirrorChange(database, change, indexCache) {
  if (change.operationType === 'delete') {
    await database.collection(change.ns.coll).deleteOne({ _id: change.documentKey._id });
    return;
  }

  if (['insert', 'replace', 'update'].includes(change.operationType) && change.fullDocument) {
    await replaceMirrorDocument(database.collection(change.ns.coll), change.fullDocument, indexCache);
    return;
  }

  if (change.operationType === 'drop' || change.operationType === 'dropDatabase' || change.operationType === 'invalidate') {
    throw new Error('Unsupported database structure change');
  }
}

async function mirrorAtlasDatabase(localUri) {
  const localClient = new MongoClient(localUri, { serverSelectionTimeoutMS: 5000 });
  let changeStream;
  let isInitializing = true;
  let stopped = false;
  const pendingChanges = [];
  let mirrorWriteQueue = Promise.resolve();
  const indexCache = new Map();

  try {
    await localClient.connect();
    const localDatabase = localClient.db(databaseName);
    if (mongoose.connection.name !== localDatabase.databaseName) {
      throw new Error('Primary and local mirror database names must match');
    }
    updateMirrorStatus('syncing', localDatabase.databaseName);
    changeStream = mongoose.connection.watch([], { fullDocument: 'updateLookup' });

    const failMirror = async (error) => {
      if (stopped) return;
      stopped = true;
      logMirrorFailure(error);
      await closeMirrorResource(changeStream, 'Atlas change stream');
      await closeMirrorResource(localClient, 'local connection');
    };

    changeStream.on('change', (change) => {
      if (stopped) return;
      if (isInitializing) {
        pendingChanges.push(change);
        if (pendingChanges.length > MAX_PENDING_MIRROR_CHANGES) {
          failMirror(new Error('Mirror initialization change buffer limit exceeded'));
        }
        return;
      }

      mirrorWriteQueue = mirrorWriteQueue
        .then(() => applyMirrorChange(localDatabase, change, indexCache))
        .then(() => {
          mirrorStatus.lastSyncedAt = new Date();
        })
        .catch(failMirror);
    });
    changeStream.on('error', failMirror);

    const sourceDatabase = mongoose.connection.db;
    const collections = await sourceDatabase.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of collections) {
      if (!name.startsWith('system.')) {
        await copyCollection(sourceDatabase.collection(name), localDatabase.collection(name), indexCache);
      }
    }

    while (pendingChanges.length > 0) {
      await applyMirrorChange(localDatabase, pendingChanges.shift(), indexCache);
    }
    if (stopped) {
      throw new Error('Mirror change stream stopped during initialization');
    }
    isInitializing = false;
    updateMirrorStatus('healthy', localDatabase.databaseName);
    console.log(`[Mongo mirror] Initial Atlas snapshot copied to local database "${localDatabase.databaseName}".`);
  } catch (error) {
    await closeMirrorResource(changeStream, 'Atlas change stream');
    await closeMirrorResource(localClient, 'local connection');
    if (!stopped) {
      stopped = true;
      logMirrorFailure(error);
    }
  }
}

async function seedDefaultPlaybookPdf() {
  const defaultProduct = defaultProducts.find((product) => product.slug === '30-day-creator-playbook');
  if (!defaultProduct) {
    throw new Error('The default creator playbook product is not configured.');
  }

  const product = await Product.findOne({ productId: defaultProduct.id });
  if (!product || (product.gridFsFileId && await findGridFSFile(product.gridFsFileId))) return;

  const filePath = path.resolve(__dirname, '..', '..', defaultProduct.fileName);
  let pdf;
  try {
    pdf = await fs.readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[GridFS] bundled playbook PDF is missing at ${filePath}; checkout remains disabled.`);
      return;
    }
    throw error;
  }

  if (pdf.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error(`Bundled playbook file is not a valid PDF: ${filePath}`);
  }

  const bucket = getGridFSBucket();
  const uploadStream = bucket.openUploadStream(defaultProduct.fileName, {
    contentType: 'application/pdf',
    metadata: { productId: defaultProduct.id },
  });

  try {
    await new Promise((resolve, reject) => {
      uploadStream.once('error', reject);
      uploadStream.once('finish', resolve);
      uploadStream.end(pdf);
    });
    if (!(await findGridFSFile(uploadStream.id))) {
      throw new Error('GridFS upload completed without all expected chunks.');
    }
    product.gridFsFileId = uploadStream.id;
    product.fileName = defaultProduct.fileName;
    await product.save();
  } catch (error) {
    if (uploadStream.id) {
      await bucket.delete(uploadStream.id).catch((cleanupError) => {
        console.error('[GridFS] default PDF upload cleanup failed:', cleanupError.message);
      });
    }
    throw error;
  }

  console.log('[GridFS] bundled playbook PDF uploaded for product:', defaultProduct.id);
}

async function connectMongo() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required; payment orders and private PDFs must be stored in MongoDB.');
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: databaseName,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB connected successfully');
    gridFSBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'pdfs' });
    if (process.env.LOCAL_MONGODB_URI) {
      if (sameMongoTarget(process.env.MONGODB_URI, process.env.LOCAL_MONGODB_URI)) {
        logMirrorFailure(new Error('Primary and mirror connection strings must be different'));
      } else {
        updateMirrorStatus('syncing', databaseName);
        void mirrorAtlasDatabase(process.env.LOCAL_MONGODB_URI).catch(logMirrorFailure);
      }
    }
    await Promise.all(
      defaultProducts.map((product) =>
        Product.updateOne(
          { productId: product.id },
          {
            $set: {
              pricePaise: product.pricePaise,
              coverImage: product.coverImage,
            },
            $setOnInsert: {
              productId: product.id,
              slug: product.slug,
              title: product.title,
              description: product.description,
              creatorId: product.creatorId,
              creatorName: product.creatorName,
              publicationStatus: product.publicationStatus,
              isPublished: product.isPublished,
              fileName: product.fileName,
              gridFsFileId: product.gridFsFileId,
            },
          },
          { upsert: true }
        )
      )
    );
    console.log('Default product records are ready in MongoDB');
    await seedDefaultPlaybookPdf();
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    throw error;
  }
}

function getGridFSBucket() {
  if (!mongoose.connection.db) {
    throw new Error('MongoDB is not connected; GridFS is unavailable.');
  }
  if (!gridFSBucket) {
    gridFSBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'pdfs' });
  }
  return gridFSBucket;
}

async function findGridFSFile(fileId) {
  if (!mongoose.isValidObjectId(fileId)) {
    return null;
  }
  const objectId = new mongoose.Types.ObjectId(fileId);
  const file = await getGridFSBucket().find({ _id: objectId }).limit(1).next();
  if (!file || !Number.isSafeInteger(file.length) || file.length <= 0 || !Number.isSafeInteger(file.chunkSize) || file.chunkSize <= 0) {
    return null;
  }

  const expectedChunks = Math.ceil(file.length / file.chunkSize);
  const actualChunks = await mongoose.connection.db
    .collection('pdfs.chunks')
    .countDocuments({ files_id: objectId });
  return actualChunks === expectedChunks ? file : null;
}

module.exports = {
  connectMongo,
  getGridFSBucket,
  findGridFSFile,
  getDatabaseMirrorStatus,
  sameMongoTarget,
};
