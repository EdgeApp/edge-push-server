import * as Nano from 'nano'

export interface IModelData extends Nano.MaybeDocument {
  _id: string
  _rev: string
}

export class Base implements IModelData {
  public static table: Nano.DocumentScope<any>

  public _id: string
  public _rev: string

  constructor(data?: Nano.MaybeDocument, id?: string) {
    this.set(data)

    if (!this._id)
      this._id = id
  }

  public processAPIResponse(response: Nano.DocumentInsertResponse) {
    if (response.ok === true) {
      this._id = response.id
      this._rev = response.rev
    }
  }

  public static async fetch(id: string): Promise<Base> {
    let item = null

    try {
      const doc = await this.table.get(id, { latest: true })
      item = new this(doc)
    } catch (err) {
      if (err.statusCode === 404) {
        console.log(`Item with ID "${id}" does not exist`)
      } else {
        throw err
      }
    }

    return item
  }

  public static async all(): Promise<Array<Base>> {
    try {
      const response = await this.table.list({ include_docs: true })
      return response.rows.map((row) => new this(row.doc))
    } catch (err) {
      throw err
    }
  }

  public static async where(where?: Nano.MangoQuery): Promise<Array<Base>> {
    try {
      const response = await this.table.find(where)
      return response.docs.map((doc) => new this(doc))
    } catch (err) {
      throw err
    }
  }

  public set(key: Nano.MaybeDocument | string, value?: any): Base {
    if (typeof key === 'string') {
      this[key] = value
    } else {
      for (const prop in key) {
        if (key.hasOwnProperty(prop)) {
          this[prop] = key[prop]
        }
      }
    }

    return this
  }

  public async save(key?: Nano.MaybeDocument | string, value?: any): Promise<Base> {
    try {
      this.set(key, value)
      // @ts-ignore
      const response = await this.constructor.table.insert(this)
      this.processAPIResponse(response)
      return this
    } catch (err) {
      switch (err.statusCode) {
        case 404:
          throw new Error('Database does not exist')
        case 409:
          throw new Error('Document already exists. To update it add a revision (`_rev`) number.')
        default:
          throw err
      }
    }
  }
}
