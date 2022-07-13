import { makeExpressRoute } from 'serverlet/express'

import { config } from '../config'
import { pushNotificationRouterV2 } from './router'
import { createServer } from './server'
// Create server
const server = createServer(makeExpressRoute(pushNotificationRouterV2), config)

// Start Server
server.listen(server.get('httpPort'), server.get('httpHost'), () => {
  console.log(
    `Express server listening on port ${JSON.stringify(server.get('httpPort'))}`
  )
})
