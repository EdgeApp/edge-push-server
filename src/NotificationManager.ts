import * as admin from 'firebase-admin'

import { ApiKey } from './models'

interface IMessage {
  data: object
  notification: {
    title: string
    body: string
  }
}

export class NotificationManager {
  private constructor(
    private readonly app: admin.app.App
  ) {
  }

  public static async init(apiKey: ApiKey | string): Promise<NotificationManager> {
    if (typeof apiKey === 'string')
      apiKey = await ApiKey.fetch(apiKey) as ApiKey

    const name = `app:${apiKey.appId}`
    let app: admin.app.App
    try {
      app = admin.app(name)
    } catch (err) {
      app = admin.initializeApp({
        credential: admin.credential.cert(apiKey.adminsdk)
      }, name)
    }

    return new NotificationManager(app)
  }

  public async sendNotifications(title: string, body: string, tokens: Array<string>, data = {}) {
    const message: admin.messaging.MulticastMessage = {
      notification: {
        title,
        body
      },
      data,
      tokens
    }

    return await this.app.messaging().sendMulticast(message)
  }
}
