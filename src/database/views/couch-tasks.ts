/**
 * Configures couchDB views that are used to model message queues.
 * Associated helper functions are also provided.
 *
 * Publishers listen to these views to perform actions on update. One
 * way of doing this is to use the {@link viewToStream} function from
 * `edge-server-tools`.
 *
 * A key advantage of using views is that documents are programmatically
 * indexed and serverd to views based on certain conditions, thereby
 * elimitating the need to build seqarate listeners that subscribe to db
 * documents and perform actions on update.
 *
 * Views can be named as a string, just like a normal database. They can
 * be called by using `db.view(name, params)` method. The response will
 * be of type `nano.DocumentViewResponse<T>` where `T` is the shape of the
 * documents defined elsewhere. This type has a `rows` property that is
 * consistent with many other getter methods in nano.
 */

// Certain import lines have lintings disabled because they are
// referenced only by documentation comments.
import {
  JsDesignDocument,
  makeJsDesign,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  viewToStream
} from 'edge-server-tools'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ActionEffect } from '../../types/task/ActionEffect'
import { Task } from '../../types/task/Task'
import { dbTasks, logger, packChange, TaskDoc } from '../../utils/dbUtils'

/**
 * A view that indexes to all tasks that contain at least one incomplete
 * {@link ActionEffect}.
 *
 * @remarks
 * This view is not intended to be subscribed by any publishers. Think
 * of this as a staging area for ongoing tasks.
 */
export const tasksListening: JsDesignDocument = makeJsDesign(
  'tasks_listening',
  () => ({
    filter: function (taskDoc: TaskDoc) {
      return taskDoc.doc.actionEffects.some(e => e.completed === false)
    }
  })
)

/**
 * A view that indexes to all tasks with all {@link ActionEffect}
 * completed.
 */
export const tasksPublishing: JsDesignDocument = makeJsDesign(
  'tasks_publishing',
  () => ({
    filter: function (taskDoc: TaskDoc) {
      return taskDoc.doc.actionEffects.every(Boolean)
    }
  })
)

/**
 * Updates the a task document in the `db_tasks` database. The function
 * receives a {@link Task} object and updates the relavent document based on
 * the content of this task.
 * @param {Task} updatedTask - The task that has its `action.inProgress`
 *                             flag updated.
 */
export const updateInProgress = async (
  updatedTask: Task,
  id: string
): Promise<void> => {
  try {
    await dbTasks.insert(packChange(updatedTask, id))
  } catch (e) {
    logger(`Failed to make ${updatedTask.taskId}'s action as inprogress: `, e)
  }
}
