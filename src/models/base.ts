import { asObject, Cleaner } from 'cleaners'
import * as Nano from 'nano'

const IModelData = asObject<Nano.MaybeDocument>({})

type InstanceClass<T extends new (...args: any) => any> = (new (
  ...args: any
) => InstanceType<T>) &
  T

export class Base implements ReturnType<typeof IModelData> {
  public static table: Nano.DocumentScope<any>
  public static asType: Cleaner<any> = IModelData

  public _id!: string
  public _rev!: string
  public readonly dataValues: object

  constructor(data: Nano.MaybeDocument = {}, id?: string) {
    this.dataValues = {}

    // NOTE: Must use set/get functions in Base constructor since the Proxy isn't setup yet. Subclasses can access
    // and set properties directly
    this.set(data)
    if (!this.get('_id')) this.set('_id', id)

    return new Proxy(this, {
      set(target: Base, key: PropertyKey, value: any): any {
        // @ts-expect-error
        return key in target ? (target[key] = value) : target.set(key, value)
      },
      get(target: Base, key: PropertyKey): any {
        // @ts-expect-error
        return key in target ? target[key] : target.get(key)
      }
    })
  }

  public validate() {
    ;(this.constructor as typeof Base).asType(this.dataValues)
  }

  public processAPIResponse(response: Nano.DocumentInsertResponse) {
    if (response.ok === true) {
      this._id = response.id
      this._rev = response.rev
    }
  }

  public static async create<T extends typeof Base>(
    this: InstanceClass<T>,
    data: Nano.MaybeDocument = {},
    id?: string
  ): Promise<InstanceType<T>> {
    const item = new this(data, id)
    await item.save()
    return item
  }

  public static async fetch<T extends typeof Base>(
    this: InstanceClass<T>,
    id: string
  ): Promise<InstanceType<T>> {
    // @ts-expect-error
    let item: InstanceType<T> = null

    try {
      const doc = await this.table.get(id, { latest: true })
      item = new this(doc)
      item.validate()
      return item
    } catch (err) {
      if (err.statusCode === 404) {
        console.log(`Item with ID "${id}" does not exist`)
      } else {
        throw err
      }
    }

    return item
  }

  public static async all<T extends typeof Base>(
    this: InstanceClass<T>
  ): Promise<Array<InstanceType<T>>> {
    try {
      const response = await this.table.list({ include_docs: true })
      return response.rows.map(row => {
        // @ts-ignore
        const item: InstanceType<T> = new this(row.doc)
        item.validate()
        return item
      })
    } catch (err) {
      throw err
    }
  }

  public static async where<T extends typeof Base>(
    this: InstanceClass<T>,
    where: Nano.MangoQuery
  ): Promise<Array<InstanceType<T>>> {
    try {
      const response = await this.table.find(where)
      return response.docs.map(doc => {
        // @ts-ignore
        const item: InstanceType<T> = new this(doc)
        item.validate()
        return item
      })
    } catch (err) {
      throw err
    }
  }

  public get(key: PropertyKey): any {
    // @ts-expect-error
    return this.dataValues[key]
  }

  public set(key: Nano.MaybeDocument | PropertyKey, value?: any): this {
    if (typeof key === 'object') {
      for (const prop in key) {
        if (key.hasOwnProperty(prop)) {
          // @ts-expect-error
          this.dataValues[prop] = key[prop]
        }
      }
    } else {
      // @ts-expect-error
      this.dataValues[key] = value
    }

    return this
  }

  public async save(
    key?: Nano.MaybeDocument | string,
    value?: any
  ): Promise<this> {
    const ItemClass = this.constructor as typeof Base
    try {
      // @ts-expect-error
      this.set(key, value)

      this.validate()

      const response = await ItemClass.table.insert(this)
      this.processAPIResponse(response)
      return this
    } catch (err) {
      switch (err.statusCode) {
        case 404:
          throw new Error('Database does not exist')

        case 409:
          console.log(
            'Document already exists. Fetching current `_rev` and resaving.'
          )
          const { _rev } = await ItemClass.fetch(this._id)
          return await this.save('_rev', _rev)

        default:
          throw err
      }
    }
  }

  public toJSON(): object {
    return this.dataValues
  }
}
