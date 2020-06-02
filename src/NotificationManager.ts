import * as FCM from 'fcm-notification'

import { FirebaseApp } from './models'

interface IMessage {
  data: object
  notification: {
    title: string
    body: string
  }
}

export class NotificationManager {
  private constructor(
    private readonly fcm: FCM
  ) {
  }

  public static async init(appId: string): Promise<NotificationManager> {
    const app = await FirebaseApp.fetch(appId) as FirebaseApp
    const fcm = new FCM(app.adminsdk)
    return new NotificationManager(fcm)
  }

  public async sendNotifications(message: IMessage, tokens: Array<string>) {
    return new Promise((resolve, reject) => {
      this.fcm.sendToMultipleToken(message, tokens, function (err, response) {
        if (err) {
          reject(err)
          console.log('error found', err)
        } else {
          resolve(response)
          console.log('response here', response)
        }
      })
    })
  }
}
