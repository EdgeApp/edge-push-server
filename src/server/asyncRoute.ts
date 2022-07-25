import { Request, RequestHandler, Response } from 'express'

/**
 * Wraps an async Express route in a try/catch block.
 */
export function asyncRoute(
  route: (req: Request, res: Response) => Promise<unknown>
): RequestHandler {
  return (req, res) => {
    route(req, res).catch(error => {
      console.error(`Route threw: ${String(error)}`)
      res.status(500).json(error)
    })
  }
}
