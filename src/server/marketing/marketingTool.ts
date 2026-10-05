import {
  asArray,
  asBoolean,
  asMaybe,
  asNumber,
  asObject,
  asOptional,
  asString
} from 'cleaners'
import { randomUUID } from 'crypto'
import express, { NextFunction, Request, Response, Router } from 'express'

import { getApiKeyByKey } from '../../db/couchApiKeys'
import {
  countDevicesByCountry,
  getDeviceById,
  getDevicesByLoginId,
  streamDeviceBatchesByIds,
  streamDeviceSummariesByApiKeyLocation
} from '../../db/couchDevices'
import { DbConnections } from '../../db/dbConnections'
import { asBase64 } from '../../types/pushCleaners'
import { ApiKey, Device } from '../../types/pushTypes'
import { logger } from '../../util/logger'
import { makePushSender, SendableMessage } from '../../util/pushSender'
import {
  DeviceSkipReason,
  findStoredNames,
  getDeviceSkipReason,
  getFilterProblem,
  LocationFilter,
  matchesLocationFilter,
  parseLocationList
} from './locationFilter'
import { makeMarketingData } from './marketingData'
import { makeProgressLog } from './progress'

const asStringList = asOptional(asArray(asString), () => [])

const asFilter = asObject({
  countryInclude: asStringList, // Empty means every country
  countryExclude: asStringList,
  cityInclude: asStringList,
  cityExclude: asStringList,
  regionInclude: asStringList,
  regionExclude: asStringList
})

export const asPushBody = asObject({
  // The message:
  title: asOptional(asString),
  body: asOptional(asString),
  url: asOptional(asString),

  // A name for the send, kept in the server log beside the campaign id so
  // the id can be found again later. Never sent to devices.
  label: asOptional(asString),

  // Who receives it, exactly one of:
  deviceId: asOptional(asString),
  loginId: asOptional(asBase64),
  deviceIds: asOptional(asArray(asString)),
  filter: asOptional(asFilter),

  // Required, with no default. A dry run resolves the audience and reports it
  // without sending anything, so a body that forgets the flag is refused
  // rather than sent.
  dryRun: asBoolean
})
export type PushBody = ReturnType<typeof asPushBody>

/** The four ways a body can name its audience. */
export type PushTarget = 'device' | 'login' | 'list' | 'filter'

/**
 * Which way this body names its audience. Exactly one is allowed, so a body
 * that names two, or none, gets undefined and is refused rather than guessed.
 */
export function getPushTarget(body: PushBody): PushTarget | undefined {
  const targets: PushTarget[] = []
  if (body.deviceId != null) targets.push('device')
  if (body.loginId != null) targets.push('login')
  if (body.deviceIds != null) targets.push('list')
  if (body.filter != null) targets.push('filter')
  return targets.length === 1 ? targets[0] : undefined
}

/** A device as a dry run reports it. */
interface AudienceDevice {
  deviceId: string
  country: string
  region: string
  city: string
  visited: Date
}

// Test pushes carry this fixed campaign id (rather than a generated one) so the
// app treats them as marketing notifications and navigates, while their opens
// stay distinguishable from real campaigns in analytics.
const TEST_CAMPAIGN_ID = 'test'

// A send carries one device id per targeted device, so its body dwarfs the 1mb
// the public endpoints allow. A whole-country audience currently runs to a few
// hundred thousand ids at ~26 characters each, so leave generous headroom:
const BODY_LIMIT = '64mb'

// A backstop against a runaway audience, not a product limit: this sits above
// the entire targetable population, so ordinary country-wide sends never meet
// it. Raise it before it starts rejecting real audiences.
const MAX_AUDIENCE_DEVICES = 2_000_000

// How often a long send reports how far along it is:
const PROGRESS_INTERVAL_MS = 30_000

// A publish that fails this many times in a row means the queue itself is
// unreachable, not that a device is bad, so the send stops rather than
// printing a failure line for every remaining device:
const MAX_CONSECUTIVE_FAILURES = 10

/**
 * Builds an Express router with the marketing push endpoint, consumed by the
 * web UI in the internal tools project, which supplies the API key.
 *
 * `POST /push` sends one message to an audience named in one of four ways:
 * a single `deviceId` or `loginId` (a test), an explicit `deviceIds` list, or
 * a `filter` of include/exclude lists of countries, cities and regions, where
 * an empty country include means every country. With `dryRun: true` it
 * resolves that audience and answers with the list
 * instead of sending, so the usual flow is: test to your own device, dry-run
 * the filter to review the audience, then send exactly the ids the dry run
 * returned. Tests and dry runs answer JSON; a send to a list or filter streams
 * a text progress log, since a large audience takes minutes to queue.
 *
 * `GET /countries` lists the countries devices are located in under the
 * caller's targeted keys, with counts, so a caller can offer exactly the
 * names an audience filter will match.
 *
 * Every call requires an `x-api-key` header naming a key with the `marketer`
 * (or `admin`) flag, and only reaches devices registered under the keys in
 * that key's `targetApiKeys` list. The apps' own keys deliberately cannot
 * call this: they ship inside the apps, so anyone holding one could otherwise
 * push to that app's whole audience.
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
          res.status(500).json({ error: errorText(error) })
        }
      })
  })

  // This router parses its own bodies, since a device-id list is far larger
  // than anything the public endpoints accept:
  router.use(express.json({ limit: BODY_LIMIT }))

  router.get(
    '/countries',
    asyncRoute(async (req: Request, res: Response): Promise<void> => {
      const apiKeyRow: ApiKey = res.locals.apiKeyRow
      const targets = getTargets(apiKeyRow, res)
      if (targets == null) return

      const totals = new Map<string, number>()
      for (const target of targets) {
        for (const { country, count } of await countDevicesByCountry(
          connections,
          target
        )) {
          if (country === '') continue
          totals.set(country, (totals.get(country) ?? 0) + count)
        }
      }
      const countries = [...totals]
        .map(([name, devices]) => ({ name, devices }))
        .sort((a, b) => a.name.localeCompare(b.name))
      res.status(200).json({ countries })
    })
  )

  router.post(
    '/push',
    asyncRoute(async (req: Request, res: Response): Promise<void> => {
      const apiKeyRow: ApiKey = res.locals.apiKeyRow
      const targets = getTargets(apiKeyRow, res)
      if (targets == null) return

      let parsed: PushBody
      try {
        parsed = asPushBody(req.body)
      } catch (error: unknown) {
        res.status(400).json({ error: errorText(error) })
        return
      }
      const target = getPushTarget(parsed)
      if (target == null) {
        res.status(400).json({
          error:
            'Name the audience with exactly one of deviceId, loginId, ' +
            'deviceIds, or filter.'
        })
        return
      }
      const { dryRun } = parsed
      const isTest = target === 'device' || target === 'login'

      // The message is only needed when something actually sends:
      const campaignId = isTest ? TEST_CAMPAIGN_ID : randomUUID()
      let message: SendableMessage | undefined
      if (!dryRun) {
        const title = parsed.title ?? (isTest ? 'Test Message' : undefined)
        const { body, url } = parsed
        if (
          title == null ||
          title.trim() === '' ||
          body == null ||
          body.trim() === ''
        ) {
          res.status(400).json({ error: 'A title and body are required.' })
          return
        }
        message = {
          title,
          body,
          data: makeMarketingData(campaignId, url),
          // Tests obey the opt-out like any other send, so the daemon may
          // apply its own check to every message from here:
          isMarketing: true,
          isPriceChange: false
        }
      }

      // A test goes to one device, or to every targeted device of one login:
      if (isTest) {
        const devices = await resolveTestDevices(
          connections,
          targets,
          parsed,
          res
        )
        if (devices == null) return
        if (dryRun || message == null) {
          res.status(200).json({
            dryRun: true,
            total: devices.length,
            devices: devices.map(summarizeDevice)
          })
          return
        }
        const sender = makePushSender(connections)
        for (const device of devices) {
          await sender.sendToDevice(device, message)
        }
        res.status(200).json({ success: true, sent: devices.length })
        return
      }

      // A filter resolves to a list from the location view:
      let deviceIds = parsed.deviceIds ?? []
      if (target === 'filter' && parsed.filter != null) {
        const audience = await resolveFilter(
          connections,
          targets,
          parsed.filter,
          res
        )
        if (audience == null) return
        if (dryRun) {
          res
            .status(200)
            .json({ dryRun: true, total: audience.length, devices: audience })
          return
        }
        deviceIds = audience.map(device => device.deviceId)
      }

      // A dry run over an explicit list re-reads the documents and reports
      // which of them can still be sent to:
      if (dryRun || message == null) {
        const devices: AudienceDevice[] = []
        for await (const batch of streamDeviceBatchesByIds(
          connections,
          deviceIds
        )) {
          for (const { device } of batch.deviceRows) {
            if (getDeviceSkipReason(device, targets) != null) continue
            devices.push(summarizeDevice(device))
          }
        }
        res.status(200).json({ dryRun: true, total: devices.length, devices })
        return
      }

      if (deviceIds.length === 0) {
        res.status(400).json({ error: 'The audience is empty.' })
        return
      }
      await streamSend(connections, res, targets, deviceIds, message, {
        campaignId,
        label: parsed.label
      })
    })
  )

  // The body parser rejects malformed JSON and oversized bodies by throwing
  // an error with a `status` (400 or 413), which Express would otherwise
  // answer with its HTML error page, stack trace included outside production.
  // Keep the JSON shape every other failure here uses:
  router.use(handleRouterError)

  return router
}

/**
 * The router's error handler: answers with the `{ error }` shape and the
 * error's own HTTP status, or 500 when it carries none. Express recognizes it
 * by its four parameters.
 */
export function handleRouterError(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(error)
    return
  }
  const status = asMaybe(asObject({ status: asNumber }))(error)?.status ?? 500
  res.status(status).json({ error: errorText(error) })
}

/**
 * The devices a test push reaches. A login can span apps, so its devices are
 * resolved here and narrowed to the targeted ones, rather than letting the
 * publish daemon fan out to every app the login has touched.
 *
 * A test obeys the same rules as a campaign, the marketing opt-out included.
 * The opt-out is a promise to the user, and a test path that ignored it would
 * let any marketer key reach an opted-out device, one request at a time.
 * Responds with a 400 and returns undefined when there is nothing to send to.
 */
async function resolveTestDevices(
  connections: DbConnections,
  targets: ReadonlySet<string>,
  body: PushBody,
  res: Response
): Promise<Device[] | undefined> {
  const candidates: Device[] =
    body.loginId != null
      ? (await getDevicesByLoginId(connections, body.loginId)).map(
          row => row.device
        )
      : [
          (await getDeviceById(connections, body.deviceId ?? '', new Date()))
            .device
        ]

  const devices: Device[] = []
  const reasons = new Set<DeviceSkipReason>()
  for (const device of candidates) {
    const reason = getDeviceSkipReason(device, targets)
    if (reason == null) devices.push(device)
    else reasons.add(reason)
  }
  if (devices.length === 0) {
    res.status(400).json({ error: explainEmptyTest(body, reasons) })
    return undefined
  }
  return devices
}

/** Why a test has nobody to send to, in the caller's terms. */
function explainEmptyTest(
  body: PushBody,
  reasons: ReadonlySet<DeviceSkipReason>
): string {
  if (body.loginId != null) {
    return (
      'Login has no devices that can receive a marketing push ' +
      'under a targeted api key.'
    )
  }
  if (reasons.has('ignore-marketing')) {
    return 'Device has opted out of marketing pushes.'
  }
  if (reasons.has('invalid-token')) {
    return 'Device has an unusable push token.'
  }
  return (
    'Device is not registered under a targeted api key, ' +
    'or has no push token.'
  )
}

/**
 * The devices a location filter reaches, read from the view alone. Responds
 * with a 413 and returns undefined past the audience backstop.
 */
async function resolveFilter(
  connections: DbConnections,
  targets: ReadonlySet<string>,
  raw: ReturnType<typeof asFilter>,
  res: Response
): Promise<AudienceDevice[] | undefined> {
  const filter: LocationFilter = {
    countryInclude: parseLocationList(raw.countryInclude),
    countryExclude: parseLocationList(raw.countryExclude),
    cityInclude: parseLocationList(raw.cityInclude),
    cityExclude: parseLocationList(raw.cityExclude),
    regionInclude: parseLocationList(raw.regionInclude),
    regionExclude: parseLocationList(raw.regionExclude)
  }
  const problem = getFilterProblem(filter)
  if (problem != null) {
    res.status(400).json({ error: problem })
    return undefined
  }

  // A single included country narrows the scan to that country's slice of
  // the index, found under the spelling the index stores. Anything else
  // walks every country the key has and lets the filter decide:
  const devices: AudienceDevice[] = []
  for (const target of targets) {
    for (const prefix of await getScanPrefixes(connections, target, filter)) {
      for await (const summary of streamDeviceSummariesByApiKeyLocation(
        connections,
        target,
        prefix
      )) {
        if (getDeviceSkipReason(summary, targets) != null) continue
        const { country, region, city } = summary
        if (!matchesLocationFilter({ country, region, city }, filter)) continue

        if (devices.length >= MAX_AUDIENCE_DEVICES) {
          res.status(413).json({
            error:
              `More than ${MAX_AUDIENCE_DEVICES} devices match. ` +
              'Narrow the audience and try again.'
          })
          return undefined
        }
        devices.push({
          deviceId: summary.deviceId,
          country,
          region,
          city,
          visited: summary.visited
        })
      }
    }
  }
  return devices
}

/**
 * The slices of an api key's index that a filter has to scan. A single
 * included country narrows the scan to that country, but the filter matches
 * names case-insensitively while Couch keys do not, so the slice is found
 * under the name as ip-api stored it, read from the view's reduce in
 * milliseconds. A spelling no device carries scans nothing, which is what the
 * filter would have matched. Any other country rule walks the whole key.
 */
async function getScanPrefixes(
  connections: DbConnections,
  apiKey: string,
  filter: LocationFilter
): Promise<Array<{ country?: string }>> {
  if (filter.countryInclude.length !== 1) return [{}]
  const stored = await countDevicesByCountry(connections, apiKey)
  const names = findStoredNames(
    stored.map(row => row.country),
    filter.countryInclude[0]
  )
  return names.map(country => ({ country }))
}

/**
 * Sends to a list of devices, streaming a text progress log back to the
 * caller, since a large audience takes minutes to queue. Failures after the
 * first byte cannot change the status code, so they are reported as `[ERROR]`
 * lines, and a finished send ends with a `[DONE]` line that says how many
 * devices were actually handed to the queue. A run of consecutive publish
 * failures means the queue itself is gone, so the send stops with `[ERROR]`
 * instead of walking the rest of the audience.
 */
async function streamSend(
  connections: DbConnections,
  res: Response,
  targets: ReadonlySet<string>,
  deviceIds: string[],
  message: SendableMessage,
  campaign: { campaignId: string; label: string | undefined }
): Promise<void> {
  const { campaignId, label } = campaign
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.flushHeaders()
  const write = (chunk: string): void => {
    res.write(chunk)
  }

  try {
    // Echoed in each notification so the app can report opens back to our
    // analytics. The stream is the only place the caller sees it, so it goes
    // in the server log too, where it can be found after the fact:
    write(`[campaign] ${campaignId}\n`)
    // The by-id lookup de-duplicates, so count unique ids from the start, or
    // a repeated id would be reported as a device "no longer found":
    const uniqueIds = [...new Set(deviceIds)]
    logger.info(
      { campaignId, label, devices: uniqueIds.length, title: message.title },
      'Marketing send started'
    )
    write(`Loading ${uniqueIds.length} devices...\n`)

    // Re-read the documents, since a device may have opted out or been
    // deleted since the caller resolved the list. The publish daemon repeats
    // these checks when it drains the queue, so this is about reporting an
    // honest count rather than about enforcement.
    const loading = makeProgressLog(write, 'Loaded', uniqueIds.length, {
      intervalMs: PROGRESS_INTERVAL_MS
    })
    const devices = new Map<string, Device>()
    let skipped = 0
    let invalidTokens = 0
    for await (const batch of streamDeviceBatchesByIds(
      connections,
      uniqueIds
    )) {
      for (const { device } of batch.deviceRows) {
        const reason = getDeviceSkipReason(device, targets)
        if (reason != null) {
          // One line per bad token would bury the progress log, so count
          // them and report the total instead:
          if (reason === 'invalid-token') ++invalidTokens
          ++skipped
          continue
        }
        devices.set(device.deviceId, device)
      }
      loading.update(batch.idsRead)
    }
    loading.finish(uniqueIds.length)
    if (invalidTokens > 0) {
      write(`  ${invalidTokens} devices had an unusable token\n`)
    }

    const missing = uniqueIds.length - devices.size - skipped
    write(
      `Queueing ${devices.size} devices` +
        ` (${skipped} skipped, ${missing} no longer found)...\n`
    )
    const sender = makePushSender(connections)
    const queueing = makeProgressLog(write, 'Queued', devices.size, {
      intervalMs: PROGRESS_INTERVAL_MS
    })
    let queued = 0
    let failed = 0
    let consecutiveFailures = 0
    for (const device of devices.values()) {
      const { deviceId } = device
      try {
        await sender.sendToDevice(device, message)
        ++queued
        consecutiveFailures = 0
      } catch (error: unknown) {
        ++failed
        write(`Device ${deviceId} failed: ${String(error)}\n`)
        if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          throw new Error(
            `${MAX_CONSECUTIVE_FAILURES} publishes failed in a row, so the ` +
              `queue is unreachable; ${queued} of ${devices.size} devices ` +
              'were queued before it stopped'
          )
        }
      }
      queueing.update(queued + failed)
    }
    queueing.finish(queued + failed)

    // Deliberately not "sent": this hands the messages to the queue, and
    // the publish daemon delivers them afterwards, which for a large
    // audience runs long after this response ends.
    const failures = failed > 0 ? ` (${failed} failed)` : ''
    write(`\n[DONE] ${queued} devices queued for delivery${failures}.\n`)
    logger.info(
      { campaignId, label, queued, failed, skipped, missing },
      'Marketing send queued'
    )
  } catch (error: unknown) {
    write(`\n[ERROR] ${errorText(error)}\n`)
    logger.error(
      { campaignId, label, error: errorText(error) },
      'Marketing send stopped'
    )
  } finally {
    res.end()
  }
}

function summarizeDevice(device: Device): AudienceDevice {
  return {
    deviceId: device.deviceId,
    country: device.location?.country ?? '',
    region: device.location?.region ?? '',
    city: device.location?.city ?? '',
    visited: device.visited
  }
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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
        res.status(500).json({ error: errorText(error) })
      } else {
        res.end()
      }
    })
  }
}
