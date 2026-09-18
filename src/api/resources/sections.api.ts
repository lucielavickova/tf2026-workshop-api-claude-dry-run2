import { BaseApi } from './base.api'
import { sectionSchema, type Section } from '../../schemas/section.schema'

export interface CreateSectionInput {
  name: string
  project_id: string
}

export class SectionsApi extends BaseApi {
  async create(input: CreateSectionInput): Promise<Section> {
    const response = await this.client.send('POST', '/sections', { body: input })
    return this.parse(sectionSchema, response.body, 'section')
  }

  async delete(id: string): Promise<void> {
    await this.client.send('DELETE', `/sections/${id}`)
  }

  async listByProject(projectId: string): Promise<Section[]> {
    return this.collect('/sections', sectionSchema, 'section', {
      query: { project_id: projectId },
    })
  }
}
