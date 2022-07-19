import io from '@pm2/io'
import admin from 'firebase-admin'

import { ApiKey } from './models'

import BatchResponse = admin.messaging.BatchResponse

const successCounter = io.counter({
  id: 'notifications:success:total',
  name: 'Total Successful Notifications'
})
const failureCounter = io.counter({
  id: 'notifications:failure:total',
  name: 'Total Failed Notifications'
})

export const createNotificationManager = async (
  apiKey: ApiKey | string
): Promise<admin.app.App> => {
  if (typeof apiKey === 'string') apiKey = await ApiKey.fetch(apiKey)

  const name = `app:${apiKey.appId}`
  let app: admin.app.App
  try {
    app = admin.app(name)
  } catch (err) {
    app = admin.initializeApp(
      {
        credential: admin.credential.cert(apiKey.adminsdk)
      },
      name
    )
  }
  return app
}

export const sendNotification = async (
  app: admin.app.App,
  title: string,
  body: string,
  tokens: string[],
  data = {}
): Promise<BatchResponse> => {
  const message: admin.messaging.MulticastMessage = {
    notification: {
      title,
      body
    },
    data,
    tokens
  }

  try {
    const response = await app.messaging().sendMulticast(message)

    successCounter.inc(response.successCount)
    failureCounter.inc(response.failureCount)

    return response
  } catch (err) {
    console.error(JSON.stringify(err, null, 2))
    throw err
  }
}
