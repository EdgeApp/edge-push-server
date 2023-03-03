import { Command, Option } from 'clipanion'

import {
  countDevicesByLocation,
  streamDevicesByLocation
} from '../../db/couchDevices'
import { makePushSender } from '../../util/pushSender'
import { makeStatusLogger, ServerContext } from '../cliTools'

// Firebase only allows a certain number of tokens per invocation of the API
const MAX_FIREBASE_BATCH_TOKEN_COUNT = 500

export class PushMarketing extends Command<ServerContext> {
  static paths = [['push-marketing']]
  static usage = Command.Usage({
    description: `Send a message to each device targeted by location (city/country).`,
    examples: [
      [
        `Sending a message:`,
        `$0 push-marketing --country "United States" --title "Gm!" --body "Hope y'all have a wonderful day!"`
      ],
      [
        `Querying for device count:`,
        `$0 push-marketing --country "United States" --city "San Diego" --region "CA"`
      ]
    ]
  })

  country = Option.String('--country', {
    description: `The device's country to target.`,
    required: false,
    tolerateBoolean: false
  })

  city = Option.String('--city', {
    description: `The device's city to target.`,
    required: false,
    tolerateBoolean: false
  })

  region = Option.String('--region', {
    description: `The device's region (state) to target.`,
    required: false,
    tolerateBoolean: false
  })

  title = Option.String('--title', {
    description: `The push notification's title.`,
    required: false,
    tolerateBoolean: false
  })

  body = Option.String('--body', {
    description: `The push notification's message body.`,
    required: false,
    tolerateBoolean: false
  })

  async execute(): Promise<number> {
    const { connection, stderr, stdout } = this.context
    const country = this.country
    const city = this.city
    const region = this.region
    const title = this.title
    const body = this.body

    if (country == null && (city != null || region != null)) {
      stderr.write('Missing --country location parameter.\n')
      return 1
    }

    const countResults = await countDevicesByLocation(connection, {
      country,
      region,
      city
    })

    // Print the counts for each group matched in the count query:
    // This is handy to know if you're query may be targeting more than one key
    // group.
    for (const row of countResults) {
      const key = row.key
      // Only use the key for location fields if the query had groups
      const [country, city, region] = key
      const count = row.count

      stdout.write(
        `${count} devices in ${country ?? 'all countries'}${
          city == null ? '' : `, ${city}`
        }${region == null ? '' : ` ${region}`}\n`
      )
    }

    if (body != null && title == null) {
      stderr.write('Nothing sent. No title for message.\n')
      return 1
    }
    if (title != null && body == null) {
      stderr.write('Nothing sent. No body for message.\n')
      return 1
    }
    if (body != null && title != null) {
      const sender = makePushSender(connection)
      const message = { title, body }

      stdout.write(`Sending push messages...\n`)

      const status = {
        failureCount: 0,
        skipCount: 0,
        successCount: 0
      }
      const logger = makeStatusLogger(stdout)
      const updateStatusLine = (): void => {
        logger.status(
          `Succeeded ${status.successCount} | Failed ${status.failureCount} | Skipped ${status.skipCount}`
        )
      }

      const payloadMap = new Map<string, Array<Set<string>>>()
      for await (const couchDevice of streamDevicesByLocation(connection, {
        country,
        region,
        city
      })) {
        const { apiKey, deviceToken, ignoreMarketing } = couchDevice.doc

        // Skip document conditions:
        if (
          ignoreMarketing ||
          apiKey == null ||
          deviceToken == null ||
          deviceToken.trim() === ''
        ) {
          status.skipCount++
          updateStatusLine()
          continue
        }
        if (!/^[a-zA-z0-9_\-:]+$/.test(deviceToken)) {
          // Log invalid tokens
          logger.write(
            `Invalid token '${deviceToken}' for doc '${couchDevice.id}'`
          )
          continue
        }

        const payloads = payloadMap.get(apiKey) ?? []
        const tokens = payloads[payloads.length - 1]

        if (tokens != null && tokens.size < MAX_FIREBASE_BATCH_TOKEN_COUNT) {
          tokens.add(deviceToken)
        } else {
          payloads.push(new Set([deviceToken]))
        }

        payloadMap.set(apiKey, payloads)
      }

      for (const [apiKey, payloads] of payloadMap) {
        for (const tokens of payloads) {
          try {
            const result = await sender.sendRaw(apiKey, tokens, message)
            status.successCount += result.successCount
            status.failureCount += result.failureCount
          } catch (error) {
            status.failureCount++
          }
          updateStatusLine()
        }
      }
    }

    return 0
  }
}
