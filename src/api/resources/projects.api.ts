import { BaseApi } from './base.api'
import { projectSchema, type Project } from '../../schemas/project.schema'
import type { RawResponse } from '../client'

export interface CreateProjectInput {
  name: string
  color?: string
  is_favorite?: boolean
  parent_id?: string
}

export interface UpdateProjectInput {
  name?: string
  color?: string
  is_favorite?: boolean
}

export class ProjectsApi extends BaseApi {
  async create(input: CreateProjectInput): Promise<Project> {
    const response = await this.client.send('POST', '/projects', { body: input })
    return this.parse(projectSchema, response.body, 'project')
  }

  async get(id: string): Promise<Project> {
    const response = await this.client.send('GET', `/projects/${id}`)
    return this.parse(projectSchema, response.body, 'project')
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const response = await this.client.send('POST', `/projects/${id}`, { body: input })
    return this.parse(projectSchema, response.body, 'project')
  }

  async delete(id: string): Promise<void> {
    await this.client.send('DELETE', `/projects/${id}`)
  }

  /** Walks the whole pagination. Never assume the account holds a short list. */
  async list(): Promise<Project[]> {
    return this.collect('/projects', projectSchema, 'project')
  }

  async createRaw(input: unknown): Promise<RawResponse> {
    return this.client.raw('POST', '/projects', { body: input })
  }

  async getRaw(id: string): Promise<RawResponse> {
    return this.client.raw('GET', `/projects/${id}`)
  }

  async deleteRaw(id: string): Promise<RawResponse> {
    return this.client.raw('DELETE', `/projects/${id}`)
  }
}
