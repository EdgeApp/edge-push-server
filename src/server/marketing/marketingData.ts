/**
 * Builds the data payload attached to every marketing push.
 *
 * This is the contract the app parses (`parsePushMessage` in edge-react-gui):
 * `type` selects the marketing branch, `campaignId` ties opens back to a
 * campaign, and the optional `url` is an Edge deep link the app follows once
 * the user is logged in. FCM only carries string values in `data`, so the
 * `url` key is left out entirely rather than set to `undefined`.
 */
export function makeMarketingData(
  campaignId: string,
  url?: string
): { [key: string]: string } {
  const data: { [key: string]: string } = { type: 'marketing', campaignId }
  if (url != null) data.url = url
  return data
}
