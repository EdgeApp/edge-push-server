import io from '@pm2/io'
import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'

import { ApiKey } from '../models'
import { registerDeviceV1Route } from './controllers/DeviceController'
import { sendNotificationV1Route } from './controllers/NotificationController'
import {
  attachUserV1Route,
  enableCurrencyV1Route,
  fetchCurrencyV1Route,
  fetchStateV1Route,
  registerCurrenciesV1Route,
  toggleStateV1Route
} from './controllers/UserController'

export const app = express()

const requestMeter = io.meter({
  id: 'request:meter',
  name: 'Total Request Frequency'
})

app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))
app.use(cors())

// ROUTES FOR OUR API
// =============================================================================
const router = express.Router()

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/v1', router)

// Define our custom fields that we add to the Express Request object
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey: ApiKey
    }
  }
}

// middleware to use for all requests
router.use(async (req, res, next) => {
  requestMeter.mark()
  console.log(` => ${req.method} ${req.url}`)

  const apiKey = req.header('X-Api-Key')
  if (!apiKey) return res.sendStatus(401)

  const key = await ApiKey.fetch(apiKey)
  if (!key) return res.sendStatus(401)

  req.apiKey = key

  next()
})

router.post('/device', registerDeviceV1Route)
router.post('/notification/send', sendNotificationV1Route)
router.get('/user', fetchStateV1Route)
router.post('/user/device/attach', attachUserV1Route)
router.post('/user/notifications', registerCurrenciesV1Route)
router.get('/user/notifications/:currencyCode', fetchCurrencyV1Route)
router.put('/user/notifications/:currencyCode', enableCurrencyV1Route)
router.post('/user/notifications/toggle', toggleStateV1Route)
