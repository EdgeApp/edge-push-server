import { Device } from '../models/Device'
import { DeviceState, PushEvent, PushEventState } from './pushTypes'

export interface DeviceRow {
  device: Device

  updateEvents: (events: PushEvent[]) => Promise<void>
  updateState: (state: DeviceState) => Promise<void>
}

export interface PushEventRow {
  event: PushEvent

  updateState: (state: PushEventState) => Promise<void>
}

export interface DbConnection {
  // Background event watchers:
  streamAddressBalanceEvents: () => Promise<AsyncIterableIterator<PushEventRow>>
  streamPriceEvents: () => Promise<AsyncIterableIterator<PushEventRow>>
  streamTxConfirmEvents: () => Promise<AsyncIterableIterator<PushEventRow>>

  // Queries:
  getDeviceById: (deviceId: string) => Promise<DeviceRow>
  getEventsByDeviceId: (deviceId: string) => Promise<PushEventRow[]>
  getEventsByLoginId: (loginId: Uint8Array) => Promise<PushEventRow[]>
}
