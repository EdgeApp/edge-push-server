import {
  asDate,
  asNumber,
  asObject,
  asOptional,
  asString,
  asValue,
  Cleaner
} from 'cleaners'
import {
  asCouchDoc,
  asMaybeConflictError,
  CouchDoc,
  DatabaseSetup,
  makeJsDesign
} from 'edge-server-tools'

import { MarketingTask, MarketingTaskStatus } from '../types/pushTypes'
import { DbConnections } from './dbConnections'

interface CouchMarketingTask extends Omit<MarketingTask, 'taskId'> {}

export const asMarketingTaskStatus: Cleaner<MarketingTaskStatus> = asValue(
  'pending',
  'processing',
  'completed',
  'failed'
)

/**
 * A marketing task, as stored in Couch.
 * The document ID is the task ID.
 */
export const asCouchMarketingTask = asCouchDoc(
  asObject<CouchMarketingTask>({
    createdTime: asDate,
    location: asObject({
      country: asOptional(asString),
      city: asOptional(asString),
      region: asOptional(asString)
    }),
    message: asObject({
      title: asString,
      body: asString
    }),
    status: asMarketingTaskStatus,
    started: asOptional(asDate),
    completed: asOptional(asDate),
    error: asOptional(asString),
    progress: asObject({
      total: asNumber,
      queried: asNumber,
      sent: asNumber,
      failed: asNumber,
      filtered: asNumber
    })
  })
)

/**
 * The marketing tasks database setup.
 */
export const couchMarketingTasksSetup: DatabaseSetup = {
  name: 'db_marketing_tasks',
  documents: {
    '_design/status': makeJsDesign('status', ({ emit }) => ({
      map: function (doc: any) {
        emit([doc.status, doc.createdTime], null)
      }
    }))
  }
}

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 9)
  return `${timestamp}-${random}`
}

/**
 * Creates a new marketing task.
 */
export async function createMarketingTask(
  connections: DbConnections,
  task: Omit<MarketingTask, 'taskId' | 'createdTime' | 'progress'>
): Promise<string> {
  const db = connections.couch.db.use(couchMarketingTasksSetup.name)

  const now = new Date()
  const taskId = generateTaskId()
  const docId = `${now.toISOString()}_${taskId}`

  const doc = {
    _id: docId,
    ...task,
    createdTime: now,
    progress: {
      total: 0,
      queried: 0,
      sent: 0,
      failed: 0,
      filtered: 0
    }
  }

  await db.insert(doc)
  return taskId
}

/**
 * Gets a marketing task by ID.
 */
export async function getMarketingTask(
  connections: DbConnections,
  taskId: string
): Promise<MarketingTask | undefined> {
  const db = connections.couch.db.use(couchMarketingTasksSetup.name)

  // Query using the status view to find all tasks
  const result = await db.view('status', 'status', {
    startkey: ['pending', ''],
    endkey: ['failed', '\ufff0'],
    include_docs: true
  })

  for (const row of result.rows) {
    if (row.id !== '' && row.id?.includes(taskId) && row.doc != null) {
      const doc = asCouchMarketingTask({
        ...row.doc,
        _id: row.id,
        _rev: row.doc._rev
      })
      return unpackMarketingTask(doc)
    }
  }

  return undefined
}

/**
 * Updates a marketing task.
 */
export async function updateMarketingTask(
  connections: DbConnections,
  taskId: string,
  updates: Partial<
    Omit<MarketingTask, 'taskId' | 'createdTime' | 'location' | 'message'>
  >
): Promise<void> {
  const db = connections.couch.db.use(couchMarketingTasksSetup.name)

  // Find the document
  const result = await db.view('status', 'status', {
    startkey: ['pending', ''],
    endkey: ['failed', '\ufff0'],
    include_docs: true
  })

  for (const row of result.rows) {
    if (row.id !== '' && row.id?.includes(taskId) && row.doc != null) {
      const existingDoc = row.doc as any

      const updated = {
        ...existingDoc,
        ...updates,
        progress:
          updates.progress != null
            ? { ...existingDoc.progress, ...updates.progress }
            : existingDoc.progress,
        _id: row.id,
        _rev: existingDoc._rev
      }

      await db.insert(updated).catch(async error => {
        if (asMaybeConflictError(error) != null) {
          // Retry once on conflict
          return await updateMarketingTask(connections, taskId, updates)
        }
        throw error
      })

      return
    }
  }

  throw new Error(`Marketing task ${taskId} not found`)
}

/**
 * Lists marketing tasks with optional filters.
 */
export async function listMarketingTasks(
  connections: DbConnections,
  options: {
    status?: MarketingTaskStatus
    limit?: number
    skip?: number
  } = {}
): Promise<MarketingTask[]> {
  const db = connections.couch.db.use<any>(couchMarketingTasksSetup.name)
  const { status, limit = 100, skip = 0 } = options

  if (status != null) {
    // Query by status
    const result = await db.view('status', 'status', {
      startkey: [status, '\ufff0'],
      endkey: [status, ''],
      include_docs: true,
      limit,
      skip,
      descending: true
    })

    return result.rows.map((row: any) => {
      if (row.doc == null || row.id == null) throw new Error('Invalid row data')
      const doc = asCouchMarketingTask({
        ...row.doc,
        _id: row.id,
        _rev: row.doc._rev
      })
      return unpackMarketingTask(doc)
    })
  } else {
    // Get all tasks
    const result = await db.view('status', 'status', {
      startkey: ['\ufff0', '\ufff0'],
      endkey: ['', ''],
      include_docs: true,
      limit,
      skip,
      descending: true
    })

    return result.rows.map((row: any) => {
      if (row.doc == null || row.id == null) throw new Error('Invalid row data')
      const doc = asCouchMarketingTask({
        ...row.doc,
        _id: row.id,
        _rev: row.doc._rev
      })
      return unpackMarketingTask(doc)
    })
  }
}

/**
 * Gets pending marketing tasks for processing.
 */
export async function getPendingMarketingTasks(
  connections: DbConnections,
  limit: number = 10
): Promise<MarketingTask[]> {
  return await listMarketingTasks(connections, { status: 'pending', limit })
}

function unpackMarketingTask(doc: CouchDoc<CouchMarketingTask>): MarketingTask {
  const [, taskId] = doc.id.split('_')
  return {
    ...doc.doc,
    taskId
  }
}
