import { pickMethod, pickPath, Serverlet } from 'serverlet'

import { withLegacyApiKey } from '../middleware/withLegacyApiKey'
import { deviceFetchRoute, deviceUpdateRoute } from '../routes/deviceRoutes'
import {
  attachUserV1Route,
  enableCurrencyV1Route,
  fetchCurrencyV1Route,
  fetchStateV1Route,
  registerCurrenciesV1Route,
  registerDeviceV1Route,
  toggleStateV1Route
} from '../routes/legacyRoutes'
import { loginFetchRoute, loginUpdateRoute } from '../routes/loginRoutes'
import { sendNotificationV1Route } from '../routes/notificationRoute'
import { DbRequest } from '../types/requestTypes'
import { errorResponse, jsonResponse } from '../types/responseTypes'

const missingRoute: Serverlet<DbRequest> = request =>
  errorResponse(`Unknown API endpoint ${request.path}`, { status: 404 })

const healthCheckRoute: Serverlet<DbRequest> = () => jsonResponse({})

const urls: { [path: string]: Serverlet<DbRequest> } = {
  '/': healthCheckRoute,

  '/v1/device/?': pickMethod({
    POST: withLegacyApiKey(registerDeviceV1Route)
  }),

  '/v1/notification/send/?': pickMethod({
    POST: withLegacyApiKey(sendNotificationV1Route)
  }),

  // The GUI accesses `/v1//user?userId=...` with an extra `/`:
  '/v1/+user/?': pickMethod({
    GET: withLegacyApiKey(fetchStateV1Route)
  }),
  '/v1/user/device/attach/?': pickMethod({
    POST: withLegacyApiKey(attachUserV1Route)
  }),
  '/v1/user/notifications/?': pickMethod({
    POST: withLegacyApiKey(registerCurrenciesV1Route)
  }),
  '/v1/user/notifications/toggle/?': pickMethod({
    POST: withLegacyApiKey(toggleStateV1Route)
  }),
  '/v1/user/notifications/[0-9A-Za-z]+/?': pickMethod({
    GET: withLegacyApiKey(fetchCurrencyV1Route),
    PUT: withLegacyApiKey(enableCurrencyV1Route)
  }),

  '/v2/device/?': pickMethod({
    POST: deviceFetchRoute
  }),
  '/v2/device/update/?': pickMethod({
    POST: deviceUpdateRoute
  }),
  '/v2/login/?': pickMethod({
    POST: loginFetchRoute
  }),
  '/v2/login/update/?': pickMethod({
    POST: loginUpdateRoute
  })
}
export const allRoutes: Serverlet<DbRequest> = pickPath(urls, missingRoute)
