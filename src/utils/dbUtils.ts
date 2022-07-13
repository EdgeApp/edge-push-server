import { asArray, asMaybe, asObject, asString, asUnknown } from 'cleaners'
import nano from 'nano'

import { config } from './../config'

export interface DbDoc
  extends nano.IdentifiedDocument,
    nano.MaybeRevisionedDocument {
  taskId: string
  userId: string
  triggers: any[]
  action: any
}

export const asDbDoc = (raw: any): DbDoc => {
  return {
    ...asObject({
      taskId: asString,
      userId: asString,
      triggers: asArray(asUnknown),
      action: asUnknown,
      _id: asString
    })(raw),
    ...asObject(asMaybe(asString))(raw)
  }
}

const { couchUri } = config

const nanoDb = nano(couchUri)
const dbTasks: nano.DocumentScope<DbDoc> = nanoDb.db.use('db_tasks')

// ------------------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------------------

export const wrappedSaveToDb = (docs: DbDoc[]): void => saveToDb(dbTasks, docs)
export const wrappedGetFromDb = async (
  keys: string[],
  userId: string
): Promise<DbDoc[]> => getFromDb(dbTasks, keys, userId)
export const wrappedDeleteFromDb = async (
  keys: string[],
  userId: string
): Promise<void> => deleteFromDb(dbTasks, keys, userId)

// ------------------------------------------------------------------------------
// Public Helpers
// ------------------------------------------------------------------------------
export const saveToDb = (
  db: nano.DocumentScope<DbDoc>,
  docs: DbDoc[]
): void => {
  if (docs.length === 0) return
  db.bulk({ docs })
    .then(response => {
      dbResponseLogger(response)
    })
    .catch(logger)
}

export const deleteFromDb = async (
  db: nano.DocumentScope<DbDoc>,
  keys: string[],
  userId: string
): Promise<void> => {
  const docs = await getFromDb(db, keys, userId)
  const docsToDelete: any[] = []

  docs.forEach(element => {
    docsToDelete.push({ _id: element._id, _deleted: true, _rev: element._rev })
  })

  db.bulk({ docs: docsToDelete })
    .then(response => {
      dbResponseLogger(response)
    })
    .catch(logger)
}

export const getFromDb = async (
  db: nano.DocumentScope<DbDoc>,
  keys: string[],
  userId: string
): Promise<DbDoc[]> => {
  // Grab existing db data for requested dates
  const response = await db.partitionedList(userId).catch(logger)
  if (response == null) return []
  return response.rows
    .filter(element => !('error' in element) && element.doc != null)
    .filter(
      element => keys.length === 0 || keys.includes(element.id.split(':')[1])
    )
    .map(({ doc }) => doc)
    .map(asDbDoc)
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
