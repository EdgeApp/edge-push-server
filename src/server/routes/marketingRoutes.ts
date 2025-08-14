import { asObject, asOptional, asString } from 'cleaners'
import { Serverlet } from 'serverlet'

import { asNumberString } from '../../cli/cliTools'
import { countDevicesByLocation } from '../../db/couchDevices'
import {
  asMarketingTaskStatus,
  createMarketingTask,
  getMarketingTask,
  listMarketingTasks
} from '../../db/couchMarketingTasks'
import { ApiRequest } from '../../types/requestTypes'
import { errorResponse, jsonResponse } from '../../types/responseTypes'
import { checkPayload } from '../../util/checkPayload'

/**
 * Query device counts by location
 *
 * GET /marketing/count
 * Query params: country, city, region (all optional)
 */
export const marketingCountRoute: Serverlet<ApiRequest> = async request => {
  const { connections, query, log } = request

  const checkedQuery = checkPayload(asMarketingCountQuery, query)
  if (checkedQuery.error != null) return checkedQuery.error
  const { country, city, region } = checkedQuery.clean

  // Validate location parameters
  if (country == null && (city != null || region != null)) {
    return errorResponse(
      'Missing country parameter when city or region is specified',
      { status: 400 }
    )
  }

  log(
    `Counting devices for location: ${JSON.stringify({
      country,
      city,
      region
    })}`
  )

  try {
    const countResults = await countDevicesByLocation(connections, {
      country,
      region,
      city
    })

    // Format the response
    const counts = countResults.map(row => {
      const [country, city, region] = row.key
      return {
        location: {
          country: country !== '' ? country : undefined,
          city: city !== '' ? city : undefined,
          region: region !== '' ? region : undefined
        },
        count: row.count
      }
    })

    const total = countResults.reduce((sum, row) => sum + row.count, 0)

    return jsonResponse({ counts, total })
  } catch (error) {
    log(`Error counting devices: ${String(error)}`)
    return errorResponse('Failed to count devices', { status: 500 })
  }
}

/**
 * Create a marketing send task
 *
 * POST /marketing/send
 * Request body: { country?, city?, region?, title, body }
 */
export const marketingSendRoute: Serverlet<ApiRequest> = async request => {
  const { connections, json, log } = request

  const checkedBody = checkPayload(asMarketingSendBody, json)
  if (checkedBody.error != null) return checkedBody.error
  const { country, city, region, title, body } = checkedBody.clean

  // Validate location parameters
  if (country == null && (city != null || region != null)) {
    return errorResponse(
      'Missing country parameter when city or region is specified',
      { status: 400 }
    )
  }

  log(
    `Creating marketing task for location: ${JSON.stringify({
      country,
      city,
      region
    })}`
  )

  try {
    const taskId = await createMarketingTask(connections, {
      location: { country, city, region },
      message: { title, body },
      status: 'pending'
    })

    log(`Created marketing task ${taskId}`)
    return jsonResponse({ taskId, status: 'pending' })
  } catch (error) {
    log(`Error creating marketing task: ${String(error)}`)
    return errorResponse('Failed to create marketing task', { status: 500 })
  }
}

/**
 * Get a specific marketing task by ID
 *
 * GET /marketing/send/:id
 */
export const marketingTaskRoute: Serverlet<ApiRequest> = async request => {
  const { connections, path, log } = request

  // Extract task ID from path
  const pathParts = path.split('/')
  const taskId =
    pathParts[pathParts.length - 1] !== ''
      ? pathParts[pathParts.length - 1]
      : pathParts[pathParts.length - 2]

  if (taskId === '' || taskId === 'send') {
    return errorResponse('Missing task ID', { status: 400 })
  }

  log(`Getting marketing task ${taskId}`)

  try {
    const task = await getMarketingTask(connections, taskId)

    if (task == null) {
      return errorResponse('Task not found', { status: 404 })
    }

    return jsonResponse(task)
  } catch (error) {
    log(`Error getting marketing task: ${String(error)}`)
    return errorResponse('Failed to get marketing task', { status: 500 })
  }
}

/**
 * List marketing tasks with optional filters
 *
 * GET /marketing/sends
 * Query params: status?, limit?, skip?
 */
export const marketingTasksListRoute: Serverlet<ApiRequest> = async request => {
  const { connections, query, log } = request

  const checkedQuery = checkPayload(asMarketingTasksQuery, query)
  if (checkedQuery.error != null) return checkedQuery.error
  const { status, limit, skip } = checkedQuery.clean

  log(
    `Listing marketing tasks with filters: ${JSON.stringify({
      status,
      limit,
      skip
    })}`
  )

  try {
    const tasks = await listMarketingTasks(connections, {
      status,
      limit: limit ?? 100,
      skip: skip ?? 0
    })

    return jsonResponse({ tasks })
  } catch (error) {
    log(`Error listing marketing tasks: ${String(error)}`)
    return errorResponse('Failed to list marketing tasks', { status: 500 })
  }
}

// Cleaners for request validation
const asMarketingCountQuery = asObject({
  country: asOptional(asString),
  city: asOptional(asString),
  region: asOptional(asString)
})

const asMarketingSendBody = asObject({
  country: asOptional(asString),
  city: asOptional(asString),
  region: asOptional(asString),
  title: asString,
  body: asString
})

const asMarketingTasksQuery = asObject({
  status: asOptional(asMarketingTaskStatus),
  limit: asOptional(asNumberString),
  skip: asOptional(asNumberString)
})
