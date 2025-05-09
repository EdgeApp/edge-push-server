import { AMQPClient } from '@cloudamqp/amqp-client'
import { makeConfig } from 'cleaner-config'
import { asNumber, asObject, asOptional, asString } from 'cleaners'
import nano from 'nano'

import { DbConnections } from './db/dbConnections'

/**
 * Configures the server process as a whole,
 * such as where to listen and how to talk to the database.
 */
const asServerConfig = asObject({
  // HTTP server options:
  listenHost: asOptional(asString, '127.0.0.1'),
  listenPort: asOptional(asNumber, 8008),

  // Databases:
  amqpUri: asOptional(asString, 'amqp://username:password@localhost:5672'),
  couchUri: asOptional(asString, 'http://username:password@localhost:5984'),
  currentCluster: asOptional(asString)
})

export const serverConfig = makeConfig(
  asServerConfig,
  './pushServerConfig.json'
)

/**
 * Connects to the databases, using the server config JSON.
 */
export async function makeConnections(): Promise<DbConnections> {
  const amqp = new AMQPClient(serverConfig.amqpUri)
  const connection = await amqp.connect()
  const channel = await connection.channel()

  // Limits the number of in-flight messages:
  await channel.prefetch(50)

  return {
    couch: nano(serverConfig.couchUri),
    amqpClient: amqp,
    queue: await channel.queue('messages')
  }
}

export async function closeConnections(
  connections: DbConnections
): Promise<void> {
  await connections.amqpClient.close()
}
