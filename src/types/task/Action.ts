// -------------------------------------------------------------------
// Type definitions
// -------------------------------------------------------------------

import { asBoolean, asObject, asOptional, asValue, Cleaner } from 'cleaners'

import { ActionData, asActionData } from './ActionData'

/**
 * Describes types of action to be done by some service. Some properties
 * are optional because certain types of actions do not require the
 * optional properties.
 */
export interface Action {
  /**
   * The type of the action.
   * - 'push': An action for pushing a notification to a device.
   * - 'broadcast-tx': An action for broadcasting transactions to a
   *   network provider such as Blockbook.
   * - 'client': // TODO: Add description
   */
  type: 'push' | 'broadcast-tx' | 'client'

  /**
   * If true, the task will be reused, otherwise, the task will be
   * deleted after the action is completed.
   */
  repeat?: boolean

  /**
   * Mutex implementation to prevent race conditions.
   */
  inProgress?: boolean

  /**
   * Additional payload for consumption. For 'push' action type, data
   * must contain apiKey, body, message, and tokenIds to send
   * notifications.
   * @see {@link ApiKey}
   * @see {@link NotificationManager.init}
   * @see {@link NotificationManager.send}
   */
  data: ActionData
}

// -------------------------------------------------------------------
// Cleaners definitions
// -------------------------------------------------------------------
export const asAction: Cleaner<Action> = asObject({
  type: asValue('push', 'broadcast-tx', 'client'),
  repeat: asOptional(asBoolean),
  inProgress: asOptional(asBoolean),
  data: asActionData
})
