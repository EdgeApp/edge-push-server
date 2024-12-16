import { asObject, asOptional, asString } from 'cleaners'
import { base64 } from 'rfc4648'
import { Serverlet } from 'serverlet'

import { asBase58 } from '../../types/pushCleaners'
import { ApiRequest } from '../../types/requestTypes'
import { errorResponse, jsonResponse } from '../../types/responseTypes'
import { checkPayload } from '../../util/checkPayload'
import { makePushSender } from '../../util/pushSender'

/**
 * The login server names this `sendNotification`,
 * and calls it when there is a new device login.
 *
 * POST /v1/notification/send
 * Request body: asSendNotificationBody
 * Response body: unused
 */
export const sendNotificationV1Route: Serverlet<ApiRequest> = async request => {
  const { apiKey, connections, json, log } = request

  const checkedBody = checkPayload(asSendNotificationBody, json)
  if (checkedBody.error != null) return checkedBody.error
  const { title, body, data, userId: loginId } = checkedBody.clean

  if (!apiKey.admin) return errorResponse('Not an admin', { status: 401 })
  const sender = makePushSender(connections)

  // Perform the send:
  const response = await sender.sendToLogin(
    loginId,
    {
      title,
      body,
      data,
      isPriceChange: false,
      isMarketing: false // Security messages from login server
    },
    5 // High priority
  )

  log(`Sent notifications to loginId ${base64.stringify(loginId)}`)
  return jsonResponse(response)
}

const asSendNotificationBody = asObject({
  title: asString,
  body: asString,
  data: asOptional(asObject(asString)),
  userId: asBase58 // Should be named `loginId`
})
