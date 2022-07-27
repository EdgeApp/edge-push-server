import fetch from 'node-fetch'

import { syncedSettings } from '../db/couchSettings'

export function slackAlert(text: string): void {
  const { slackUri } = syncedSettings.doc

  fetch(slackUri, {
    body: JSON.stringify({ text }),
    headers: { 'content-type': 'application/json' },
    method: 'POST'
  }).catch(error => console.log('Could not log to Slack', error))
}
