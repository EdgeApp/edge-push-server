import { Cleaner } from 'cleaners'
import { asCouchDoc, CouchDoc } from 'edge-server-tools'
import nano from 'nano'

import { asTask, Task } from '../types/task/Task'
import { serverConfig } from './../serverConfig'

const { couchUri } = serverConfig
const nanoDb = nano(couchUri)

// ------------------------------------------------------------------------------
// Public APIs for the 'db_tasks' database
// ------------------------------------------------------------------------------
export type TaskDoc = CouchDoc<Task>
export const asTaskDoc: Cleaner<CouchDoc<Task>> = asCouchDoc(asTask)
export const dbTasks: nano.DocumentScope<TaskDoc> = nanoDb.db.use('db_tasks')

export const wrappedSaveToDb = (docs: TaskDoc[]): void =>
  saveToDb(dbTasks, docs)
export const wrappedGetFromDb = async (
  keys: string[],
  userId: string
): Promise<TaskDoc[]> => getFromDb(dbTasks, keys, userId, asTaskDoc)
export const wrappedDeleteFromDb = async (
  keys: string[],
  userId: string
): Promise<void> => deleteFromDb(dbTasks, keys, userId)

// ------------------------------------------------------------------------------
// Public Helpers - Agnostic of the database
// ------------------------------------------------------------------------------
export const saveToDb = <T>(
  db: nano.DocumentScope<CouchDoc<T>>,
  docs: Array<CouchDoc<T>>
): void => {
  if (docs.length === 0) return
  db.bulk({ docs })
    .then(response => {
      dbResponseLogger(response)
    })
    .catch(logger)
}

export const deleteFromDb = async <T>(
  db: nano.DocumentScope<CouchDoc<T>>,
  keys: string[],
  userId: string
): Promise<void> => {
  // TODO: NOT SURE HOW TO HANDLE THE TYPE ERROR. SOMEONE HELP.
  // @ts-ignore
  const docs = await getFromDb(db, keys, userId, asTaskDoc)
  const docsToDelete: any[] = []

  docs.forEach(element => {
    docsToDelete.push({ _id: element.id, _deleted: true, _rev: element.rev })
  })

  db.bulk({ docs: docsToDelete })
    .then(response => {
      dbResponseLogger(response)
    })
    .catch(logger)
}

export const getFromDb = async <T>(
  db: nano.DocumentScope<CouchDoc<T>>,
  keys: string[],
  userId: string,
  cleaner: Cleaner<CouchDoc<T>>
): Promise<Array<CouchDoc<T>>> => {
  // Grab existing db data for requested dates
  const response = await db.partitionedList(userId).catch(logger)
  if (response == null || !(response instanceof Object)) return []
  return response.rows
    .filter(element => !('error' in element) && element.doc != null)
    .filter(
      element => keys.length === 0 || keys.includes(element.id.split(':')[1])
    )
    .map(({ doc }) => doc)
    .map(cleaner)
}

export const logger = (...args: any): void => {
  const isoDate = new Date().toISOString()
  let result = `${isoDate} - `
  for (const arg of args) {
    if (typeof arg === 'string') result += `${arg}, `
    else if (arg instanceof Error) result += arg.message
    else result += `\n${JSON.stringify(arg)}`
  }
  console.log(result)
}

/**
 * Convert a {@link Task} object into a {@link TaskDoc} object that
 * implements {@link CouchDoc}.
 * @param doc - A {@link Task} object.
 * @returns {TaskDoc} - A {@link TaskDoc} object wrapping `doc`.
 */
export const packChange = <T>(doc: T, id: string): CouchDoc<T> => {
  return {
    id: id,
    doc: doc
  }
}

// ------------------------------------------------------------------------------
// Private Helpers
// ------------------------------------------------------------------------------

const dbResponseLogger = (response: nano.DocumentBulkResponse[]): void => {
  const successArray = response
    .filter(doc => doc.error == null)
    .map(doc => doc.id)
  if (successArray.length > 0)
    logger(`Saved document IDs: ${successArray.join(', ')} to db_tasks`)

  const failureArray = response
    // Conflicts are expected and OK so no need to print. They'll be combined and retried until successfully saved.
    // Future TODO: will be to save to the db on a loop from redis store.
    .filter(doc => doc.error != null && doc.error !== 'conflict')
    .map(doc => `${doc.id}: ${doc.error}`)
  if (failureArray.length > 0)
    logger(`Error saving document IDs: ${failureArray.join(', ')} to db_tasks`)
}
