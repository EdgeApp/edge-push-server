import { asArray, asObject, asString, Cleaner } from 'cleaners'

import { Action, asAction } from './Action'
import { ActionEffect, asActionEffect } from './ActionEffect'

// -------------------------------------------------------------------
// Type definitions
// -------------------------------------------------------------------

/**
 * Describes a task that can be stored in the `db_tasks` database.
 *
 * `taskId` and `userId` are required to construct the `_id` of the
 * couchDB document. The `_id` is used to partition the documents by
 * user for performance and security reasons.
 */
export interface Task {
  taskId: string
  userId: string
  actionEffects: ActionEffect[]
  action: Action
}

// -------------------------------------------------------------------
// Cleaners definitions
// -------------------------------------------------------------------

export const asTask: Cleaner<Task> = asObject({
  taskId: asString,
  userId: asString,
  actionEffects: asArray(asActionEffect),
  action: asAction
})
