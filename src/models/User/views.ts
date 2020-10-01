declare function emit(...args: any[])

export const views = {
  filter: {
    byCurrency(doc) {
      var notifs = doc.notifications
      if (notifs && notifs.enabled && notifs.currencyCodes) {
        var codes = notifs.currencyCodes
        for (var currencyCode in codes) {
          for (var hours in codes[currencyCode]) {
            var enabled = codes[currencyCode][hours]
            if (enabled) {
              emit([ currencyCode, hours ], doc.devices)
            }
          }
        }
      }
    }
  }
}
