import { asArray, asBoolean, asObject, asOptional, asString } from 'cleaners'
import { randomUUID } from 'crypto'
import express, { NextFunction, Request, Response, Router } from 'express'

import { getApiKeyByKey } from '../../db/couchApiKeys'
import {
  fetchDevicesByIds,
  getDeviceById,
  getDevicesByLoginId,
  streamDeviceSummariesByApiKeyLocation
} from '../../db/couchDevices'
import { DbConnections } from '../../db/dbConnections'
import { asBase64 } from '../../types/pushCleaners'
import { ApiKey, Device } from '../../types/pushTypes'
import { makeHeartbeat } from '../../util/heartbeat'
import { makePushSender, SendableMessage } from '../../util/pushSender'
import {
  getDeviceSkipReason,
  LocationFilter,
  matchesLocationFilter,
  parseLocationList
} from './locationFilter'

const asTestMessageBody = asObject({
  deviceId: asOptional(asString),
  loginId: asOptional(asBase64),
  title: asOptional(asString, 'Test Message'),
  body: asString,
  url: asOptional(asString)
})

// Test pushes carry this fixed campaign id (rather than a generated one) so the
// app treats them as marketing notifications and navigates, while their opens
// stay distinguishable from real campaigns in analytics.
const TEST_CAMPAIGN_ID = 'test'

const asStringList = asOptional(asArray(asString), () => [])

const asQueryDevicesBody = asObject({
  country: asString,
  cityInclude: asStringList,
  cityExclude: asStringList,
  regionInclude: asStringList,
  regionExclude: asStringList
})

const asPushToDevicesBody = asObject({
  deviceIds: asArray(asString),
  title: asOptional(asString),
  body: asOptional(asString),
  url: asOptional(asString),
  confirmed: asOptional(asBoolean, false)
})

// A send carries one device id per targeted device, so its body dwarfs the 1mb
// the public endpoints allow. A whole-country audience currently runs to a few
// hundred thousand ids at ~26 characters each, so leave generous headroom:
const BODY_LIMIT = '64mb'

// A backstop against a runaway audience, not a product limit: this sits above
// the entire targetable population, so ordinary country-wide sends never meet
// it. Raise it before it starts rejecting real audiences.
const MAX_QUERY_DEVICES = 2_000_000

/**
 * Builds an Express router with the marketing tool API endpoints: `test` sends
 * a single test push, `query` lists the devices a send would reach, and `push`
 * sends to the device list a query returned. The web UI is hosted separately by
 * the internal tools project, which supplies the key.
 *
 * Every endpoint requires an `x-api-key` header naming a key with the
 * `marketer` (or `admin`) flag, and only reaches devices registered under the
 * keys in that key's `targetApiKeys` list. The apps' own keys deliberately
 * cannot call these endpoints: they ship inside the apps, so anyone holding
 * one could otherwise push to that app's whole audience.
 */
export function makeMarketingToolRouter(connections: DbConnections): Router {
  const router = Router()

  // The API key travels in a header, so check it before parsing any body.
  // Otherwise anonymous callers could make the server chew through
  // BODY_LIMIT-sized bodies just to be told 401:
  router.use((req: Request, res: Response, next: NextFunction): void => {
    authenticate(connections, req, res)
      .then(apiKeyRow => {
        if (apiKeyRow == null) return // authenticate already responded
        res.locals.apiKeyRow = apiKeyRow
        next()
      })
      .catch((error: unknown) => {
        if (!res.headersSent) {
          res.status(500).json({
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })
  })

  // This router parses its own bodies, since a device-id list is far larger
  // than anything the public endpoints accept:
  router.use(express.json({ limit: BODY_LIMIT }))

  // Wraps the `send-message` command for sending a single test push.
  router.post(
    '/test',
    asyncRoute(async (req: Request, res: Response): Promise<void> => {
      const apiKeyRow: ApiKey = res.locals.apiKeyRow
      const targets = getTargets(apiKeyRow, res)
      if (targets == null) return

      let parsed
      try {
        parsed = asTestMessageBody(req.body)
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : String(error)
        })
        return
      }
      const { deviceId, loginId, title, body, url } = parsed

      try {
        if (body.trim() === '') {
          res.status(400).json({ error: 'Message body is required.' })
          return
        }

        const sender = makePushSender(connections)
        const data: { [key: string]: string } = {
          type: 'marketing',
          campaignId: TEST_CAMPAIGN_ID
        }
        if (url != null) data.url = url
        const message: SendableMessage = {
          title,
          body,
          data,
          isMarketing: false, // This tool is used for testing
          isPriceChange: false
        }

        if (loginId != null) {
          // A login can span apps, so resolve its devices here and keep the
          // targeted ones, rather than letting the publish daemon fan out to
          // every app the login has touched:
          const deviceRows = await getDevicesByLoginId(connections, loginId)
          const devices = deviceRows
            .map(row => row.device)
            .filter(
              device => device.apiKey != null && targets.has(device.apiKey)
            )
          if (devices.length === 0) {
            res.status(400).json({
              error: 'Login has no devices under a targeted api key.'
            })
            return
          }
          for (const device of devices) {
            await sender.sendToDevice(device, message)
          }
        } else if (deviceId != null) {
          const deviceRow = await getDeviceById(
            connections,
            deviceId,
            new Date()
          )
          const deviceApiKey = deviceRow.device.apiKey
          if (deviceApiKey == null || !targets.has(deviceApiKey)) {
            res.status(400).json({
              error: 'Device is not registered under a targeted api key.'
            })
            return
          }
          await sender.sendToDevice(deviceRow.device, message)
        } else {
          res.status(400).json({ error: 'No deviceId or loginId' })
          return
        }

        res.status(200).json({ success: true })
      } catch (error: unknown) {
        res.status(500).json({
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })
  )

  // Lists the devices a marketing send would reach, so the caller can review
  // the audience before committing to it. Read-only.
  router.post(
    '/query',
    asyncRoute(async (req: Request, res: Response): Promise<void> => {
      const apiKeyRow: ApiKey = res.locals.apiKeyRow
      const targets = getTargets(apiKeyRow, res)
      if (targets == null) return

      let parsed
      try {
        parsed = asQueryDevicesBody(req.body)
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : String(error)
        })
        return
      }
      const { country } = parsed
      const filter: LocationFilter = {
        cityInclude: parseLocationList(parsed.cityInclude),
        cityExclude: parseLocationList(parsed.cityExclude),
        regionInclude: parseLocationList(parsed.regionInclude),
        regionExclude: parseLocationList(parsed.regionExclude)
      }

      const devices = []
      for (const target of targets) {
        for await (const summary of streamDeviceSummariesByApiKeyLocation(
          connections,
          target,
          { country }
        )) {
          if (getDeviceSkipReason(summary, targets) != null) continue
          const { region, city } = summary
          if (!matchesLocationFilter({ country, region, city }, filter))
            continue

          if (devices.length >= MAX_QUERY_DEVICES) {
            res.status(413).json({
              error:
                `More than ${MAX_QUERY_DEVICES} devices match. ` +
                'Narrow the audience and query again.'
            })
            return
          }
          devices.push({
            deviceId: summary.deviceId,
            region,
            city,
            visited: summary.visited
          })
        }
      }

      res.status(200).json({ total: devices.length, devices })
    })
  )

  // Sends to an explicit list of devices, as returned by `query`. The send
  // deliberately takes device ids rather than a location: the caller reviews
  // exactly this list first, and a server that predates a body field would
  // silently drop it, whereas an unknown route fails loudly.
  router.post(
    '/push',
    asyncRoute(async (req: Request, res: Response): Promise<void> => {
      const apiKeyRow: ApiKey = res.locals.apiKeyRow
      const targets = getTargets(apiKeyRow, res)
      if (targets == null) return

      let parsed
      try {
        parsed = asPushToDevicesBody(req.body)
      } catch (error: unknown) {
        res.status(400).json({
          error: error instanceof Error ? error.message : String(error)
        })
        return
      }
      const { deviceIds, title, body, url, confirmed } = parsed

      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.flushHeaders()
      const write = (chunk: string): void => {
        res.write(chunk)
      }

      try {
        if (!confirmed) {
          write('[ERROR] Confirmation required before sending.\n')
          return
        }
        if (body == null || title == null) {
          write('Nothing sent. No title or body for message.\n')
          write('[ERROR] Missing title or body.\n')
          return
        }
        if (deviceIds.length === 0) {
          write('Nothing sent. The device list is empty.\n')
          write('[ERROR] No devices selected.\n')
          return
        }

        // A unique id for this campaign, echoed in each notification so the app
        // can report opens back to our analytics:
        const campaignId = randomUUID()
        write(`[campaign] ${campaignId}\n`)

        const sender = makePushSender(connections)
        const data: { [key: string]: string } = {
          type: 'marketing',
          campaignId
        }
        if (url != null) data.url = url
        const message: SendableMessage = {
          title,
          body,
          data,
          isMarketing: true,
          isPriceChange: false
        }
        const heartbeat = makeHeartbeat({ write }, { logSeconds: 2 })

        write(`Loading ${deviceIds.length} devices...\n`)

        // Re-read the documents, since a device may have opted out or been
        // deleted since the caller queried it. The publish daemon repeats these
        // checks when it drains the queue, so this is about reporting an honest
        // count rather than about enforcement.
        const devices = new Map<string, Device>()
        let skipped = 0
        for (const deviceRow of await fetchDevicesByIds(
          connections,
          deviceIds
        )) {
          const { device } = deviceRow
          const reason = getDeviceSkipReason(device, targets)
          if (reason != null) {
            if (reason === 'invalid-token') {
              write(
                `Invalid token '${String(device.deviceToken)}' for doc '${
                  device.deviceId
                }'\n`
              )
            }
            ++skipped
            continue
          }
          devices.set(device.deviceId, device)
          heartbeat(`Reached ${device.deviceId}`)
        }

        const missing = deviceIds.length - devices.size - skipped
        write(
          `Sending to ${devices.size} devices` +
            ` (${skipped} skipped, ${missing} no longer found)...\n`
        )
        for (const device of devices.values()) {
          const { deviceId } = device
          await sender.sendToDevice(device, message).catch((error: unknown) => {
            write(`Device ${deviceId} failed: ${String(error)}\n`)
          })
          heartbeat(`Reached ${deviceId}`)
        }

        write('\n[DONE] Marketing send complete.\n')
      } catch (error: unknown) {
        write(
          `\n[ERROR] ${
            error instanceof Error ? error.message : String(error)
          }\n`
        )
      } finally {
        res.end()
      }
    })
  )

  return router
}

/**
 * Validates the `x-api-key` header against the API-key database, and requires
 * the `marketer` (or `admin`) flag. On failure it responds with a 401 or 403
 * and returns undefined, so callers should bail out.
 */
async function authenticate(
  connections: DbConnections,
  req: Request,
  res: Response
): Promise<ApiKey | undefined> {
  const key = req.header('x-api-key')
  const apiKeyRow =
    key == null ? undefined : await getApiKeyByKey(connections, key)
  if (apiKeyRow == null) {
    res.status(401).json({ error: 'Invalid or missing API key.' })
    return undefined
  }
  if (!apiKeyRow.marketer && !apiKeyRow.admin) {
    res.status(403).json({ error: 'API key is not allowed to send marketing.' })
    return undefined
  }
  return apiKeyRow
}

/**
 * Reads the app keys a marketing key may send to. A key with none configured
 * cannot target anything, which fails closed: responds with a 400 and returns
 * undefined, so callers should bail out.
 */
function getTargets(apiKeyRow: ApiKey, res: Response): Set<string> | undefined {
  const targets = new Set(apiKeyRow.targetApiKeys)
  if (targets.size === 0) {
    res.status(400).json({
      error: 'API key has no targetApiKeys configured.'
    })
    return undefined
  }
  return targets
}

/**
 * Wraps an async Express handler so the router receives a synchronous
 * void-returning function (satisfying the handler type) while still reporting
 * any unexpected rejection back to the client.
 */
function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req, res) => {
    handler(req, res).catch((error: unknown) => {
      if (!res.headersSent) {
        res.status(500).json({
          error: error instanceof Error ? error.message : String(error)
        })
      } else {
        res.end()
      }
    })
  }
}
