import io from '@pm2/io'
import admin from 'firebase-admin'

import { ApiKey } from '../types/pushTypes'

const successCounter = io.counter({
  id: 'notifications:success:total',
  name: 'Total Successful Notifications'
})
const failureCounter = io.counter({
  id: 'notifications:failure:total',
  name: 'Total Failed Notifications'
})

export interface PushResult {
  successCount: number
  failureCount: number
}

export interface PushSender {
  send: (
    title: string,
    body: string,
    tokens: string[],
    data?: { [key: string]: string }
  ) => Promise<PushResult>
}

export async function makePushSender(apiKey: ApiKey): Promise<PushSender> {
  const name = `app:${apiKey.appId}`
  let app: admin.app.App
  try {
    admin.app(name)
  } catch (err) {
    app = admin.initializeApp(
      {
        // TODO: We have never passed the correct data type here,
        // so either update our database or write a translation layer:
        credential: admin.credential.cert(apiKey.adminsdk as any)
      },
      name
    )
  }

  return {
    async send(title, body, tokens, data = {}) {
      const response = await app
        .messaging()
        .sendMulticast({
          data,
          notification: { title, body },
          tokens
        })
        .catch(() => ({ successCount: 0, failureCount: tokens.length }))

      successCounter.inc(response.successCount)
      failureCounter.inc(response.failureCount)

      return response
    }
  }
}
