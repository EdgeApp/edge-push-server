import { app } from './app'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CONFIG = require('../../serverConfig.json')

// START THE SERVER
// =============================================================================
app.listen(CONFIG.httpPort, () => {
  console.log(`Express server listening on port: ${CONFIG.httpPort}`)
})
