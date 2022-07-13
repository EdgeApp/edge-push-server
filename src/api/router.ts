import { asArray, asObject, asString, asUnknown } from 'cleaners'
import {
  type HttpRequest,
  type HttpResponse,
  pickMethod,
  pickPath
} from 'serverlet'

import {
  jsonResponse,
  statusCodes,
  statusResponse
} from '../types/response-types'
import {
  DbDoc,
  logger,
  wrappedDeleteFromDb,
  wrappedGetFromDb,
  wrappedSaveToDb
} from '../utils/dbUtils'
import { convertStringToArray, getQueryParamObject } from '../utils/HTTPHelpers'

// Expect to get an array of taskIds. If the array is empty, it will get
// all tasks. Expect to get a query parameter called `taskIds`.
const getTaskRoute = async (request: HttpRequest): Promise<HttpResponse> => {
  try {
    const asQuery = asObject({
      taskIds: asArray(asString),
      userId: asString
    })

    const queryObject = getQueryParamObject(['taskIds'], request.path)
    const taskIdArray = convertStringToArray(queryObject.taskIds)
    // Invalid string representation of an array will return undefined.
    if (taskIdArray === undefined) return { status: 400 }

    const { taskIds, userId } = asQuery([
      ...taskIdArray,
      request.headers.userId // Assuming the header contains userId
    ])

    // Fetch all documents associated with the userId if no taskIds are
    // provided.
    const response = await wrappedGetFromDb(taskIds, userId)

    return jsonResponse(response)
  } catch (e) {
    logger(e)
    return statusResponse(statusCodes.INTERNAL_SERVER_ERROR, String(e))
  }
}

// Construct a body and returns it as an HttpResponse.
// The body should have triggers, action, and taskId.
const createTaskRoute = async (request: HttpRequest): Promise<HttpResponse> => {
  try {
    const asBody = asObject({
      taskId: asString,
      triggers: asArray(asUnknown),
      action: asUnknown
    })

    const queryObject = getQueryParamObject(
      ['taskId', 'triggers', 'action'],
      request.path
    )
    const triggersAsString = queryObject.triggers
    const triggersAsArray = convertStringToArray(triggersAsString)
    queryObject.triggers = triggersAsArray ?? []
    const { taskId, triggers, action } = asBody(queryObject)

    const doc: DbDoc = {
      taskId,
      userId: request.headers.userId,
      triggers,
      action,
      _id: `${request.headers.userId}:${taskId}` // To help with partitioning
    }

    await wrappedSaveToDb([doc])
    return statusResponse(statusCodes.SUCCESS, 'Successfully created the task')
  } catch (e) {
    logger(e)
    return statusResponse(statusCodes.INTERNAL_SERVER_ERROR, String(e))
  }
}

const deleteTaskRoute = async (request: HttpRequest): Promise<HttpResponse> => {
  try {
    const asQuery = asObject({
      taskIds: asArray(asString),
      userId: asString
    })

    const queryObject = getQueryParamObject(['taskIds'], request.path)
    const taskIdArray = convertStringToArray(queryObject.taskIds)
    // Invalid string representation of an array will return undefined.
    if (taskIdArray === undefined) return { status: 400 }

    const { taskIds, userId } = asQuery([
      ...taskIdArray,
      request.headers.userId // Assuming the header contains userId
    ])
    await wrappedDeleteFromDb(taskIds, userId)
    return statusResponse(statusCodes.SUCCESS, 'Successfully deleted tasks')
  } catch (e) {
    logger(e)
    return statusResponse(statusCodes.INTERNAL_SERVER_ERROR, String(e))
  }
}

export const pushNotificationRouterV2 = pickPath({
  '/v2/': pickMethod({
    GET: getTaskRoute,
    POST: createTaskRoute,
    DELETE: deleteTaskRoute
  })
})
