import { Builtins, Cli } from 'clipanion'
import nano from 'nano'

import packageJson from '../../package.json'
import { setupDatabases } from '../db/couchSetup'
import { serverConfig } from '../serverConfig'
import { ServerContext } from './cliTools'
import { GetDevice } from './commands/getDevice'
import { MigrateDevices } from './commands/migrateDevices'
import { PushMarketing } from './commands/pushMarketing'
import { SendMessage } from './commands/sendMessage'

async function main(): Promise<void> {
  const connection = nano(serverConfig.couchUri)
  await setupDatabases(connection, true)

  const context: ServerContext = {
    ...Cli.defaultContext,
    connection
  }

  const cli = new Cli({
    binaryLabel: 'push-server',
    binaryName: 'yarn cli',
    binaryVersion: packageJson.version
  })

  cli.register(Builtins.HelpCommand)
  cli.register(Builtins.VersionCommand)

  // Our commands:
  cli.register(GetDevice)
  cli.register(MigrateDevices)
  cli.register(SendMessage)
  cli.register(PushMarketing)

  const args = process.argv.slice(2)
  await cli.runExit(args, context)
}

main().catch(error => console.error(error))
