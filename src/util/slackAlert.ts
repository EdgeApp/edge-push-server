import fetch from 'node-fetch'

import { syncedServices } from '../db/couchSettings'
import { logger } from './logger'

export function slackAlert(text: string): void {
  const { slackUri } = syncedServices.doc

  if (slackUri == null) return

  fetch(slackUri, {
    body: JSON.stringify({ text }),
    headers: { 'content-type': 'application/json' },
    method: 'POST'
  }).catch(err => logger.warn({ msg: 'Could not log to Slack', err }))
}
