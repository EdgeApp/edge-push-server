import { CouchDoc } from 'edge-server-tools'
import { DocumentScope } from 'nano'

export const saveToDB = async <T>(
  db: DocumentScope<unknown>,
  doc: CouchDoc<T>
): Promise<void> => {
  try {
    await db.insert({
      ...doc.doc,
      _id: doc.id,
      _rev: doc.rev ?? undefined
    })
  } catch (err: any) {
    switch (err.statusCode) {
      case 404:
        throw new Error('Database does not exist')
      default:
        throw err
    }
  }
}
