import * as fs from 'fs'

import { app } from './server/app'

const CONFIG = require('../serverConfig.json')

// START THE SERVER
// =============================================================================
app.listen(CONFIG.httpPort, () => {
  console.log(
    'Express server listening on port:' +
    CONFIG.httpPort
  )
})
