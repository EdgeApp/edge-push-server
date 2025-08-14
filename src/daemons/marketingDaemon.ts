import {
  countDevicesByLocation,
  streamDevicesByLocation
} from '../db/couchDevices'
import {
  getPendingMarketingTasks,
  updateMarketingTask
} from '../db/couchMarketingTasks'
import { DbConnections } from '../db/dbConnections'
import { MarketingTask } from '../types/pushTypes'
import { logger } from '../util/logger'
import { PushSender, SendableMessage } from '../util/pushSender'
import { runDaemon } from './runDaemon'

/**
 * Marketing daemon - processes pending marketing tasks from the queue
 */
runDaemon(async tools => {
  const { connections, heartbeat, sender } = tools

  try {
    // Get pending tasks
    const pendingTasks = await getPendingMarketingTasks(connections, 5)

    if (pendingTasks.length === 0) {
      heartbeat('No pending marketing tasks')
      return
    }

    logger.info(`Processing ${pendingTasks.length} marketing tasks`)
    heartbeat(`Processing ${pendingTasks.length} tasks`)

    // Process tasks sequentially to avoid overwhelming the system
    for (const task of pendingTasks) {
      await processMarketingTask(connections, sender, task, heartbeat).catch(
        error => {
          logger.error(`Error processing marketing task ${task.taskId}:`, error)
        }
      )
    }
  } catch (error) {
    logger.error('Marketing daemon error:', error)
    throw error
  }
})

/**
 * Process a single marketing task
 */
async function processMarketingTask(
  connections: DbConnections,
  sender: PushSender,
  task: MarketingTask,
  heartbeat: (item?: string) => void
): Promise<void> {
  logger.info(`Processing marketing task ${task.taskId}`)
  heartbeat(`Task ${task.taskId}`)

  // Update status to processing
  await updateMarketingTask(connections, task.taskId, {
    status: 'processing',
    started: new Date()
  })

  try {
    // Count devices first
    const countResults = await countDevicesByLocation(
      connections,
      task.location
    )
    const total = countResults.reduce((sum, row) => sum + row.count, 0)

    logger.info(
      `Task ${task.taskId}: Found ${total} devices for location`,
      task.location
    )
    heartbeat(`Task ${task.taskId}: ${total} devices`)

    // Initialize progress tracking
    let sent = 0
    let failed = 0
    let filtered = 0
    let queried = 0

    // Create message
    const message: SendableMessage = {
      ...task.message,
      isMarketing: true,
      isPriceChange: false
    }

    // Stream and send to devices
    for await (const deviceRow of streamDevicesByLocation(
      connections,
      task.location
    )) {
      const { device } = deviceRow
      const { apiKey, deviceId, deviceToken, ignoreMarketing } = device
      queried++

      // Skip document conditions
      if (
        ignoreMarketing ||
        apiKey == null ||
        deviceToken == null ||
        deviceToken.trim() === ''
      ) {
        filtered++
        continue
      }

      // Validate token format
      if (!/^[a-zA-z0-9_\-:]+$/.test(deviceToken)) {
        logger.warn(`Invalid token '${deviceToken}' for device '${deviceId}'`)
        filtered++
        continue
      }

      // Send message
      try {
        await sender.sendToDevice(device, message)
        sent++
      } catch (error) {
        logger.warn(`Failed to send to device ${deviceId}:`, error)
        failed++
      }

      // Update progress periodically (every 100 devices)
      if (queried % 100 === 0) {
        await updateMarketingTask(connections, task.taskId, {
          progress: { total, queried, sent, failed, filtered }
        })
        heartbeat(`Task ${task.taskId}: ${queried}/${total}`)
        logger.info(
          `Task ${task.taskId} progress: ${queried}/${total} queried, ${sent} sent`
        )
      }
    }

    // Final progress update
    await updateMarketingTask(connections, task.taskId, {
      status: 'completed',
      completed: new Date(),
      progress: { total, queried, sent, failed, filtered }
    })

    logger.info(
      `Task ${task.taskId} completed: ${sent} sent, ${failed} failed, ${filtered} filtered out of ${total} total`
    )
    heartbeat(`Task ${task.taskId}: completed`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Task ${task.taskId} failed:`, error)

    await updateMarketingTask(connections, task.taskId, {
      status: 'failed',
      error: errorMessage,
      completed: new Date()
    })
    heartbeat(`Task ${task.taskId}: failed`)
  }
}
