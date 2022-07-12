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

export class NotificationManager {
  private constructor(private readonly app: admin.app.App) {}

  public static async init(
    apiKey: ApiKey | string
  ): Promise<NotificationManager> {
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

    return new NotificationManager(app)
  }

  public async send(
    title: string,
    body: string,
    tokens: string[],
    data = {}
  ): Promise<BatchResponse> {
    const message: admin.messaging.MulticastMessage = {
      notification: {
        title,
        body
      },
      data,
      tokens
    }

    try {
      const response = await this.app.messaging().sendMulticast(message)

      successCounter.inc(response.successCount)
      failureCounter.inc(response.failureCount)

      return response
    } catch (err) {
      console.error(JSON.stringify(err, null, 2))
      throw err
    }
  }
}
