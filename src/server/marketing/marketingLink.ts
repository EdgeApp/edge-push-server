/**
 * The deep links a marketing push may carry.
 *
 * The app follows any link it can parse: edge-react-gui's PushMessageParser
 * hands the payload `url` to parseDeepLink and launches whatever comes back,
 * and the apps already in the field have no allow-list of their own. So the
 * server keeps one. A push may open the scenes that lead to a buy, sell, swap
 * or promotion, and nothing that can spend, sign, log in, recover a password,
 * or hand an address to a third party. The grammar below mirrors the app's
 * parser, so a link that would not parse there is refused here instead of
 * being sent as a dud.
 */

// The two spellings the app treats as equivalent. The https form may also
// carry `?af=<installerId>`, which the app turns into a promotion activation
// wrapped around the link. The `edge://` form silently drops `af`, so a link
// that relies on it there is refused rather than sent.
const EDGE_PREFIX = 'edge://'
const HTTPS_PREFIX = 'https://deep.edge.app/'

// FCM caps the whole data payload at 4 KB, and no real link comes near this:
const MAX_LINK_LENGTH = 1024

const EXCHANGE_DIRECTIONS = new Set(['buy', 'sell', 'swap'])
const EXCHANGE_QUERY_KEYS = new Set(['buyAsset', 'sellAsset', 'promoId'])

// Path segments are plugin, provider and payment-type ids, installer ids,
// scene names. Query values add asset specs (`ethereum_0xa0b8...`), which
// carry the same characters:
const SEGMENT = /^[A-Za-z0-9_.-]+$/
const DOTS = /^\.+$/
const QUERY_KEY = /^[A-Za-z]+$/
const QUERY_VALUE = /^[A-Za-z0-9_.-]+$/

/** The link kinds a push may carry, for the refusal message and the docs. */
export const ALLOWED_LINK_KINDS =
  'buy, sell, swap, exchange, plugin, promotion, modal/fundAccount, ' +
  'scene/earnScene'

/**
 * Why a link cannot go out in a marketing push, or undefined if it can. The
 * message is meant for the operator building the send.
 */
export function getLinkProblem(url: string): string | undefined {
  if (url.length > MAX_LINK_LENGTH) {
    return `The url is longer than ${MAX_LINK_LENGTH} characters.`
  }

  let rest: string
  let isHttps: boolean
  if (url.startsWith(EDGE_PREFIX)) {
    rest = url.slice(EDGE_PREFIX.length)
    isHttps = false
  } else if (url.startsWith(HTTPS_PREFIX)) {
    rest = url.slice(HTTPS_PREFIX.length)
    isHttps = true
  } else {
    return `The url must start with ${EDGE_PREFIX} or ${HTTPS_PREFIX}.`
  }
  if (rest.includes('#')) return 'The url cannot have a fragment.'

  const [path, ...queryParts] = rest.split('?')
  if (queryParts.length > 1) return 'The url has more than one "?".'
  const query = new Map<string, string>()
  if (queryParts.length === 1) {
    const problem = parseQueryInto(query, queryParts[0])
    if (problem != null) return problem
  }

  const [kind, ...segments] = path.split('/')
  for (const segment of segments) {
    if (segment === '') return 'The url has an empty path segment.'
    if (!SEGMENT.test(segment))
      return `"${segment}" is not a valid path segment.`
    // The app's own URL parser keeps dot segments as typed, but any
    // WHATWG-style parser upstream would collapse `buy/../pay` into `pay`,
    // so they are refused rather than relied on:
    if (DOTS.test(segment))
      return 'The url cannot contain "." or ".." segments.'
  }

  // The promotion wrapper is allowed around any allowed link:
  if (query.has('af')) {
    if (!isHttps) {
      return (
        'A promotion id (af) only works on the https://deep.edge.app/ form; ' +
        'the edge:// form drops it.'
      )
    }
    query.delete('af')
  }

  switch (kind) {
    case 'buy':
    case 'sell':
      // edge://buy[/<providerId>[/<paymentType>]]
      if (segments.length > 2) {
        return `${kind} links take at most a provider id and a payment type.`
      }
      return refuseQuery(kind, query)

    case 'swap':
      // edge://swap
      if (segments.length > 0) return 'swap links take no path.'
      return refuseQuery(kind, query)

    case 'exchange': {
      // edge://exchange/<buy|sell|swap>?buyAsset=&sellAsset=&promoId=
      const [direction] = segments
      if (segments.length !== 1 || !EXCHANGE_DIRECTIONS.has(direction)) {
        return 'exchange links are exchange/buy, exchange/sell or exchange/swap.'
      }
      for (const key of query.keys()) {
        if (!EXCHANGE_QUERY_KEYS.has(key)) {
          return `exchange links do not take a "${key}" parameter.`
        }
      }
      return undefined
    }

    case 'promotion':
      // edge://promotion/<installerId>
      if (segments.length !== 1) {
        return 'promotion links name exactly one installer id.'
      }
      return refuseQuery(kind, query)

    case 'plugin': {
      // edge://plugin/<pluginId>[/<up to three path segments>], never a query.
      // Any plugin id may be opened: the fiat plugins read the path as
      // direction/provider/payment type, and a webview plugin appends it to
      // its partner URL. A query is another matter. The app merges a link's
      // query over the plugin's own parameters (makePluginUri in
      // edge-react-gui: `{ ...baseQuery, ...deepQuery }`), api keys and
      // referral codes included, and hands it to the partner page as well, so
      // a link could point a partner widget at someone else's account or
      // refund address. Nothing a campaign needs rides in a plugin query.
      if (segments.length === 0 || segments.length > 4) {
        return 'plugin links are plugin/<id> with up to three path segments.'
      }
      return refuseQuery(kind, query)
    }

    case 'modal':
      if (segments.length !== 1 || segments[0] !== 'fundAccount') {
        return 'The only modal a marketing push may open is modal/fundAccount.'
      }
      return refuseQuery(kind, query)

    case 'scene':
      if (segments.length !== 1 || segments[0] !== 'earnScene') {
        return 'The only scene a marketing push may open is scene/earnScene.'
      }
      return refuseQuery(kind, query)

    default:
      return (
        `"${kind}" links are not allowed in marketing pushes. ` +
        `Allowed: ${ALLOWED_LINK_KINDS}.`
      )
  }
}

/** Reads `a=b&c=d` into the map, refusing anything irregular. */
function parseQueryInto(
  query: Map<string, string>,
  raw: string
): string | undefined {
  if (raw === '') return 'The url has an empty query.'
  for (const pair of raw.split('&')) {
    const index = pair.indexOf('=')
    const key = index < 0 ? pair : pair.slice(0, index)
    const value = index < 0 ? '' : pair.slice(index + 1)
    if (!QUERY_KEY.test(key)) return `"${key}" is not a valid parameter name.`
    if (!QUERY_VALUE.test(value)) {
      return `Parameter "${key}" needs a plain value.`
    }
    if (query.has(key)) return `Parameter "${key}" is repeated.`
    query.set(key, value)
  }
  return undefined
}

function refuseQuery(
  kind: string,
  query: Map<string, string>
): string | undefined {
  const [key] = query.keys()
  return key == null
    ? undefined
    : `${kind} links do not take a "${key}" parameter.`
}
