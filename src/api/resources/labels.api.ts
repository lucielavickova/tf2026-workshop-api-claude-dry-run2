import { BaseApi } from './base.api'
import { labelSchema, type Label } from '../../schemas/label.schema'

export interface CreateLabelInput {
  name: string
  color?: string
  is_favorite?: boolean
}

export class LabelsApi extends BaseApi {
  async create(input: CreateLabelInput): Promise<Label> {
    const response = await this.client.send('POST', '/labels', { body: input })
    return this.parse(labelSchema, response.body, 'label')
  }

  async delete(id: string): Promise<void> {
    await this.client.send('DELETE', `/labels/${id}`)
  }

  /** Walks the whole pagination: a participant account may already hold many labels. */
  async list(): Promise<Label[]> {
    return this.collect('/labels', labelSchema, 'label')
  }
}
