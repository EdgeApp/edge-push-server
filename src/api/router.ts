import { asArray, asObject, asString } from 'cleaners'
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
} from '../types/http/response-types'
import { asAction } from '../types/task/Action'
import { asActionEffect } from '../types/task/ActionEffect'
import {
  asTaskDoc,
  logger,
  TaskDoc,
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
// The body should have actionEffects, action, userId, _id and taskId.
const createTaskRoute = async (request: HttpRequest): Promise<HttpResponse> => {
  try {
    const asBody = asObject({
      taskId: asString,
      actionEffects: asArray(asActionEffect),
      action: asAction
    })

    const queryObject = getQueryParamObject(
      ['taskId', 'actionEffects', 'action'],
      request.path
    )
    const actionEffectsAsString = queryObject.actionEffects
    const actionEffectsAsArray = convertStringToArray(actionEffectsAsString)
    queryObject.actionEffects = actionEffectsAsArray ?? []
    const { taskId, actionEffects, action } = asBody(queryObject)
    const cleanedAction = asAction(action)

    const doc: TaskDoc = asTaskDoc({
      taskId: taskId,
      userId: request.headers.userId,
      actionEffects: actionEffects.map(actionEffect =>
        asActionEffect(actionEffect)
      ),
      cleanedAction,
      _id: `${request.headers.userId}:${taskId}` // To help with partitioning
    })

    await wrappedSaveToDb([doc])
    return statusResponse(statusCodes.SUCCESS, 'Successfully created the task')
  } catch (e) {
    logger(e)
    return statusResponse(statusCodes.INTERNAL_SERVER_ERROR, String(e))
  }
}

// Remove tasks from the database. If the taskIds array is empty, it
// will delete all tasks under the userId.
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
