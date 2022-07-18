import { pickMethod, pickPath, Serverlet } from 'serverlet'

import { withApiKey } from '../middleware/withApiKey'
import { DbRequest } from '../types/requestTypes'
import { errorResponse, jsonResponse } from '../types/responseTypes'
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

const missingRoute: Serverlet<DbRequest> = request =>
  errorResponse(`Unknown API endpoint ${request.path}`, { status: 404 })

const healthCheckRoute: Serverlet<DbRequest> = () => jsonResponse({})

const urls: { [path: string]: Serverlet<DbRequest> } = {
  '/': healthCheckRoute,

  '/v1/device/?': pickMethod({
    POST: withApiKey(registerDeviceV1Route)
  }),

  '/v1/notification/send/?': pickMethod({
    POST: withApiKey(sendNotificationV1Route)
  }),

  // The GUI accesses `/v1//user?userId=...` with an extra `/`:
  '/v1/+user/?': pickMethod({
    GET: withApiKey(fetchStateV1Route)
  }),
  '/v1/user/device/attach/?': pickMethod({
    POST: withApiKey(attachUserV1Route)
  }),
  '/v1/user/notifications/?': pickMethod({
    POST: withApiKey(registerCurrenciesV1Route)
  }),
  '/v1/user/notifications/toggle/?': pickMethod({
    POST: withApiKey(toggleStateV1Route)
  }),
  '/v1/user/notifications/[0-9A-Za-z]+/?': pickMethod({
    GET: withApiKey(fetchCurrencyV1Route),
    PUT: withApiKey(enableCurrencyV1Route)
  })
}
export const allRoutes: Serverlet<DbRequest> = pickPath(urls, missingRoute)
