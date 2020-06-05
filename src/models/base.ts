import * as Nano from 'nano'
import { asObject, Cleaner } from 'cleaners'

const IModelData = asObject<Nano.MaybeDocument>({
})

export abstract class Base implements ReturnType<typeof IModelData> {
  public static table: Nano.DocumentScope<any>
  public static asType: Cleaner<any> = IModelData

  public _id?: string
  public _rev?: string
  public readonly dataValues: object

  constructor(data: Nano.MaybeDocument = {}, id?: string) {
    this.dataValues = {}

    // NOTE: Must use set/get functions in Base constructor since the Proxy isn't setup yet. Subclasses can access
    // and set properties directly
    this.set(data)
    if (!this.get('_id'))
      this.set('_id', id)

    return new Proxy(this, {
      set(target: Base, key: PropertyKey, value: any): any {
        return key in target ? target[key] = value : target.set(key, value)
      },
      get(target: Base, key: PropertyKey): any {
        return key in target ? target[key] : target.get(key)
      }
    })
  }

  public validate() {
    (this.constructor as typeof Base).asType(this.dataValues)
  }

  public processAPIResponse(response: Nano.DocumentInsertResponse) {
    if (response.ok === true) {
      this._id = response.id
      this._rev = response.rev
    }
  }

  public static async fetch(id: string): Promise<Base> {
    let item: Base = null

    try {
      const doc = await this.table.get(id, { latest: true })
      // @ts-ignore
      item = new this(doc)
      item.validate()
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
      return response.rows.map((row) => {
        // @ts-ignore
        const item = new this(row.doc)
        item.validate()
        return item
      })
    } catch (err) {
      throw err
    }
  }

  public static async where(where?: Nano.MangoQuery): Promise<Array<Base>> {
    try {
      const response = await this.table.find(where)
      return response.docs.map((doc) => {
        // @ts-ignore
        const item = new this(doc)
        item.validate()
        return item
      })
    } catch (err) {
      throw err
    }
  }

  public get(key: PropertyKey): any {
    return this.dataValues[key]
  }

  public set(key: Nano.MaybeDocument | PropertyKey , value?: any): Base {
    if (typeof key === 'object') {
      for (const prop in key) {
        if (key.hasOwnProperty(prop)) {
          this.dataValues[prop] = key[prop]
        }
      }
    } else {
      this.dataValues[key] = value
    }

    return this
  }

  public async save(key?: Nano.MaybeDocument | string, value?: any): Promise<Base> {
    try {
      this.set(key, value)

      this.validate()

      const response = await (this.constructor as typeof Base).table.insert(this)
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

  public toJSON(): object {
    return this.dataValues
  }
}
