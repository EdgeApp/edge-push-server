import { Builtins, Cli } from 'clipanion'

import packageJson from '../../package.json'
import { setupDatabases } from '../db/couchSetup'
import { closeConnections, makeConnections } from '../serverConfig'
import { ServerContext } from './cliTools'
import { GetDevice } from './commands/getDevice'
import { PushMarketing } from './commands/pushMarketing'
import { SendMessage } from './commands/sendMessage'

async function main(): Promise<void> {
  const connections = await makeConnections()
  await setupDatabases(connections, true)

  const context: ServerContext = {
    ...Cli.defaultContext,
    connections
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
  cli.register(SendMessage)
  cli.register(PushMarketing)

  const args = process.argv.slice(2)
  process.exitCode = await cli.run(args, context)
  await closeConnections(connections)
}

main().catch(error => console.error(error))
