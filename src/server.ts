import * as fs from 'fs'
import * as http from 'http'
import * as https from 'https'

import { app } from './server/app'

const CONFIG = require('../serverConfig.json')

const credentials = {
  key: fs.readFileSync(CONFIG.sslPrivateKeyPath, 'utf8'),
  cert: fs.readFileSync(CONFIG.sslCertPath, 'utf8'),
  ca: fs.readFileSync(CONFIG.sslCaCertPath, 'utf8')
}

// START THE SERVER
// =============================================================================
const httpServer = http.createServer(app)
const httpsServer = https.createServer(credentials, app)

httpServer.listen(CONFIG.httpPort)
httpsServer.listen(CONFIG.httpsPort)

console.log(
  'Express server listening on port:' +
  CONFIG.httpPort +
  ' ssl:' +
  CONFIG.httpsPort
)
