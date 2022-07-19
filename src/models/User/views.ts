declare function emit(...args: any[]): void

export const views = {
  filter: {
    // @ts-expect-error
    byCurrency(doc) {
      const notifs = doc.notifications
      if (notifs?.enabled && notifs.currencyCodes) {
        const codes = notifs.currencyCodes
        for (const currencyCode in codes) {
          for (const hours in codes[currencyCode]) {
            const enabled = codes[currencyCode][hours]
            if (enabled) {
              emit([currencyCode, hours], doc.devices)
            }
          }
        }
      }
    }
  }
}
