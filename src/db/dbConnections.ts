import { AMQPClient, AMQPQueue } from '@cloudamqp/amqp-client'
import { ServerScope } from 'nano'

export interface DbConnections {
  readonly couch: ServerScope
  readonly amqpClient: AMQPClient
  readonly queue: AMQPQueue
}
