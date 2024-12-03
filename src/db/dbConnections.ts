import { ServerScope } from 'nano'

export interface DbConnections {
  readonly couch: ServerScope
}
