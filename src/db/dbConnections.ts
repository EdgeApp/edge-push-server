import { AMQPQueue } from '@cloudamqp/amqp-client'
import { ServerScope } from 'nano'

export interface DbConnections {
  readonly couch: ServerScope
  readonly queue: AMQPQueue
}
