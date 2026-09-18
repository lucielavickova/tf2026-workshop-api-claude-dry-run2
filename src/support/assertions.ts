import { expect } from '@playwright/test'

/**
 * Domain assertions live here so that a change in Todoist semantics is one edit,
 * not a search across every spec.
 */

interface SoftDeletable {
  id: string
  is_deleted: boolean
}

/**
 * DELETE on a task is a soft delete: a follow-up GET answers 200 with
 * is_deleted: true, not 404. Asserting 404 here would be asserting the
 * documentation instead of the product.
 */
export function expectSoftDeleted(resource: SoftDeletable): void {
  expect(resource.is_deleted, `resource ${resource.id} should be marked deleted`).toBe(true)
}

export function expectNotInList(list: { id: string }[], id: string): void {
  expect(list.map((item) => item.id)).not.toContain(id)
}

export function expectInList(list: { id: string }[], id: string): void {
  expect(list.map((item) => item.id)).toContain(id)
}
