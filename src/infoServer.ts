import axios from 'axios'

class InfoServer {
  public readonly uri: string
  public readonly version: number

  constructor (version: number) {
    this.uri = 'https://info1.edgesecure.co:8444'
    this.version = version
  }

  async get (path: string) {
    const { data } = await axios(`${this.uri}/v${this.version}/${path}`)
    return data
  }

  async post (path: string, body?: object) {
    const { data } = await axios.post(`${this.uri}/v${this.version}/${path}`, body)
    return data
  }

  async put (path: string, body?: object) {
    const { data } = await axios.put(`${this.uri}/v${this.version}/${path}`, body)
    return data
  }
}

export default new InfoServer(1)
