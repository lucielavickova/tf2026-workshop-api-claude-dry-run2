import { BaseApi } from './base.api'
import { commentSchema, type Comment } from '../../schemas/comment.schema'

export interface CreateCommentInput {
  content: string
  task_id: string
}

export class CommentsApi extends BaseApi {
  async create(input: CreateCommentInput): Promise<Comment> {
    const response = await this.client.send('POST', '/comments', { body: input })
    return this.parse(commentSchema, response.body, 'comment')
  }

  async delete(id: string): Promise<void> {
    await this.client.send('DELETE', `/comments/${id}`)
  }

  async listByTask(taskId: string): Promise<Comment[]> {
    return this.collect('/comments', commentSchema, 'comment', { query: { task_id: taskId } })
  }
}
