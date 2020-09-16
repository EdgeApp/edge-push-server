import axios from 'axios'

class RatesServer {
  public readonly uri: string
  public readonly version: number

  constructor (version: number) {
    this.uri = 'https://rates1.edge.app'
    this.version = version
  }

  async get (path: string) {
    const { data } = await axios(`${this.uri}/v${this.version}/${path}`, { timeout: 10000 })
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

export default new RatesServer(1)
