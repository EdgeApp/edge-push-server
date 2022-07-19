/**
 * A push publisher subscribes to a view that contains all tasks whose
 * arrays of {@link ActionEffect}s are all marked as completed. The
 * publisher's job is to push notifications to devices based on the
 * completed tasks.
 */

import { viewToStream } from 'edge-server-tools'

import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tasksPublishing,
  updateInProgress
} from '../database/views/couch-tasks'
import {
  createNotificationManager,
  sendNotification
} from '../NotificationManager'
import { asPushActionData } from '../types/task/ActionData'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ActionEffect } from '../types/task/ActionEffect'
import { Task } from '../types/task/Task'
import {
  asTaskDoc,
  dbTasks,
  logger,
  TaskDoc,
  wrappedDeleteFromDb
} from '../utils/dbUtils'

/** Used in the retry mechnism for the publisher */
const RETRY_LIMIT = 5

/**
 * Begins listening to the 'tasks_publishing' view defined in
 * {@link tasksPublishing}. For every new task document received, the
 * publisher checks if the action is in progress. If it is, skip the
 * processing. If it is not, the publisher will pick up the task by
 * executing the push notification action.
 *
 * If the action is marked as repeatable, the publisher will then mark
 * all {@link ActionEffect}s as completed so that 'task_listening'
 * view can pick the task up again for processing.
 *
 * @returns {Promise<number>} 0 if the connection is closed.
 */
export const runPushPublisher = async (): Promise<number> => {
  for await (const doc of viewToStream(async params =>
    Promise.resolve(
      dbTasks.view('tasks_publishing', 'tasks_publishing', params)
    )
  )) {
    const clean: TaskDoc = asTaskDoc(doc)
    const currentTask = clean.doc
    if (!canExecute(currentTask)) continue

    // Set the action of the task as in progress
    // If this process fails, we stop processing the current task
    await signalActionStarted(currentTask)
    if (currentTask.action.inProgress === false) continue

    // Send notification to the devices
    await handlePushNotification(currentTask)

    // Perform chores after the notification has been sent
    await handleActionAfterPushingNotification(currentTask)

    // Set the action of the task as not in progress
    await finishCurrentTaskAction(currentTask)
  }
  return 0
}

// -----------------------------------------------------------------------------
// Helper functions
// -----------------------------------------------------------------------------

/**
 * Determines if the current task from the view is eliglbe for pushing
 * notfications to devices.
 * @returns Whether the task is eligible for pushing notifications.
 */
const canExecute = (task: Task): boolean => {
  return (
    task.action.inProgress != null &&
    task.action.type === 'push' &&
    task.action.repeat != null &&
    task.action.inProgress === false
  )
}

/**
 * By setting the action as in progress, and update that change in the
 * database, other publishers will not pick up the task.
 *
 * If the update fails, we stop processing the current task by setting
 * its inProgress flag to false. The {@link execute} function will
 * skip this task.
 */
const signalActionStarted = async (task: Task): Promise<void> => {
  task.action.inProgress = true
  await updateInProgress(task, `${task.userId}:${task.taskId}`).catch(_ => {
    task.action.inProgress = false
  })
}

/**
 *  Prepares and sends a push notification to the devices identified by tokenIds.
 */
const handlePushNotification = async (task: Task): Promise<void> => {
  const { apiKey, title, body, tokenIds } = asPushActionData(task.action.data)
  const notificationManager = await createNotificationManager(apiKey)
  await sendNotification(
    notificationManager,
    title,
    body,
    tokenIds,
    task.action.data.additionalData ?? {}
  )
}

/**
 * Some actions are repeatable. If the action is repeatable, we mark all
 * {@link ActionEffect}s as completed so that 'task_listening' view
 * can pick the task up again for processing.
 *
 * Otherwise, we delete the task from the database.
 */
const handleActionAfterPushingNotification = async (
  task: Task
): Promise<void> => {
  if (task.action.repeat === true) {
    // Reset all action effects as incomplete
    task.actionEffects.forEach(actionEffect => {
      actionEffect.completed = false
    })
  } else {
    await wrappedDeleteFromDb([task.taskId], task.userId)
  }
}

/**
 * Setting the action as not in progress, and update that change in the
 * database. A retry mechinism is used to minimize the chance for
 * leaving a task whose inProgress flag is always true, which prevents
 * it from being ever picked up by publishers.
 */
const finishCurrentTaskAction = async (task: Task): Promise<void> => {
  // If not a repeatable action, that means the task has been deleted
  // from the db. Do nothing.
  if (task.action.repeat === false) return

  var currentRetry = 0

  // Use a while loop to implement a retry mechanism
  while (true) {
    try {
      task.action.inProgress = false
      await updateInProgress(task, `${task.userId}:${task.taskId}`)
      break
    } catch (e) {
      if (currentRetry++ > RETRY_LIMIT) {
        logger(`Failed to update inProgress flag after ${RETRY_LIMIT} retries`)
        break
      }
      logger(e)
    }
  }
}
