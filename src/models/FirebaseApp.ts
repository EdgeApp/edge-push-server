import * as Nano from 'nano'

import { Base } from '.'
const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbDevices = nanoDb.db.use('db_firebase_apps')

interface IFirebaseApp {
  adminsdk: object
}

export class FirebaseApp extends Base implements IFirebaseApp {
  public static table = dbDevices

  public adminsdk: object
}
