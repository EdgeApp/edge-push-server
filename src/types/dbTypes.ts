import { Device, User } from './pushTypes'

export interface DeviceRow {
  device: Device
  save: () => Promise<void>
}

export interface UserRow {
  user: User
  save: () => Promise<void>
}
