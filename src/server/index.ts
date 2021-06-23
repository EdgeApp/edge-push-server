import * as fs from 'fs'

import { app } from './app'

const CONFIG = require('../../config.json')

// START THE SERVER
// =============================================================================
app.listen(CONFIG.httpPort, () => {
  console.log(
    'Express server listening on port:' +
    CONFIG.httpPort
  )
})
