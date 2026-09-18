import { BaseApi } from './base.api'
import { taskSchema, type Task } from '../../schemas/task.schema'
import type { RawResponse } from '../client'

export interface CreateTaskInput {
  content: string
  project_id?: string
  section_id?: string
  parent_id?: string
  description?: string
  priority?: number
  due_string?: string
  due_date?: string
  labels?: string[]
}

export interface ListTasksQuery {
  projectId?: string
}

export class TasksApi extends BaseApi {
  async create(input: CreateTaskInput): Promise<Task> {
    const response = await this.client.send('POST', '/tasks', { body: input })
    return this.parse(taskSchema, response.body, 'task')
  }

  async get(id: string): Promise<Task> {
    const response = await this.client.send('GET', `/tasks/${id}`)
    return this.parse(taskSchema, response.body, 'task')
  }

  /**
   * Completing a task answers 204 with no body, so there is nothing to validate here.
   * The task stays readable afterwards with `checked: true`; it is the project task
   * list it disappears from. Read it back rather than trusting this call.
   */
  async complete(id: string): Promise<void> {
    await this.client.send('POST', `/tasks/${id}/close`)
  }

  /**
   * Soft delete: the task answers 204 here and 200 with is_deleted: true on a later
   * GET. Use expectSoftDeleted() rather than expecting a 404.
   */
  async delete(id: string): Promise<void> {
    await this.client.send('DELETE', `/tasks/${id}`)
  }

  /** Walks the whole pagination. Never assume the account holds a short list. */
  async list(query: ListTasksQuery = {}): Promise<Task[]> {
    return this.collect('/tasks', taskSchema, 'task', {
      query: { project_id: query.projectId },
    })
  }

  async getRaw(id: string): Promise<RawResponse> {
    return this.client.raw('GET', `/tasks/${id}`)
  }
}
