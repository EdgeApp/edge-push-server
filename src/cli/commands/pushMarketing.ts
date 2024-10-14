import { Command, Option } from 'clipanion'

import {
  countDevicesByLocation,
  streamDevicesByLocation
} from '../../db/couchDevices'
import { Device } from '../../types/pushTypes'
import { makeHeartbeat } from '../../util/heartbeat'
import { makePushSender } from '../../util/pushSender'
import { ServerContext } from '../cliTools'

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

    if (body == null || title == null) {
      stderr.write('Nothing sent. No title or body for message.\n')
      return 1
    }

    const sender = makePushSender(connection)
    const message = { title, body }
    const heatbeat = makeHeartbeat(stderr)

    stdout.write('Loading devices...\n')

    // Build a list of all devices we want to send to:
    const devices = new Map<string, Device>()
    for await (const deviceRow of streamDevicesByLocation(connection, {
      country,
      region,
      city
    })) {
      const { device } = deviceRow
      const { apiKey, deviceId, deviceToken, ignoreMarketing } = device

      // Skip document conditions:
      if (
        ignoreMarketing ||
        apiKey == null ||
        deviceToken == null ||
        deviceToken.trim() === ''
      ) {
        continue
      }

      if (!/^[a-zA-z0-9_\-:]+$/.test(deviceToken)) {
        // Log invalid tokens
        stdout.write(`Invalid token '${deviceToken}' for doc '${deviceId}'`)
        continue
      }

      devices.set(deviceId, device)
      heatbeat(`Reached ${deviceId}`)
    }

    stdout.write(`Sending to ${devices.size} devices...\n`)
    for (const device of devices.values()) {
      const { apiKey, deviceId, deviceToken } = device
      if (apiKey == null || deviceToken == null) continue
      await sender
        .sendRaw(apiKey, new Set([deviceToken]), message)
        .catch(error => {
          stdout.write(`Device ${deviceId} failed: ${String(error)}\n`)
        })
      heatbeat(`Reached ${deviceId}`)
    }

    return 0
  }
}
