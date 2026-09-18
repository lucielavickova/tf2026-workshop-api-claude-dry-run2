import type { ProjectsApi } from '../api/resources/projects.api'

export type ResourceKind = 'project' | 'task' | 'section' | 'label' | 'comment'

interface TrackedResource {
  kind: ResourceKind
  id: string
}

export interface TrackerDeps {
  projects: ProjectsApi
  /** Filled in as the remaining resource objects arrive in later waves. */
  deleters?: Partial<Record<ResourceKind, (id: string) => Promise<unknown>>>
}

export interface CleanupWarning {
  kind: ResourceKind
  id: string
  reason: string
}

/**
 * Per-test bookkeeping of everything created, so teardown can undo it in reverse
 * order - a project goes after its contents.
 *
 * A cleanup failure never fails the test. A test that failed on an assertion must
 * not be repainted as "cleanup failed", or the real cause disappears.
 */
export class ResourceTracker {
  readonly warnings: CleanupWarning[] = []
  #resources: TrackedResource[] = []

  constructor(private readonly deps: TrackerDeps) {}

  track(kind: ResourceKind, id: string): void {
    this.#resources.push({ kind, id })
  }

  forget(kind: ResourceKind, id: string): void {
    this.#resources = this.#resources.filter(
      (resource) => !(resource.kind === kind && resource.id === id)
    )
  }

  get size(): number {
    return this.#resources.length
  }

  async cleanup(): Promise<CleanupWarning[]> {
    for (const resource of [...this.#resources].reverse()) {
      try {
        await this.#delete(resource)
      } catch (error) {
        // Deleting something already gone is a success, not a problem. Todoist uses
        // soft delete on tasks, so a repeated DELETE most likely answers 2xx rather
        // than 404 - both outcomes count as "it is not there any more".
        if (!isAlreadyGone(error)) {
          this.warnings.push({
            kind: resource.kind,
            id: resource.id,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    this.#resources = []
    return this.warnings
  }

  async #delete(resource: TrackedResource): Promise<void> {
    const custom = this.deps.deleters?.[resource.kind]
    if (custom !== undefined) {
      await custom(resource.id)
      return
    }

    if (resource.kind === 'project') {
      await this.deps.projects.delete(resource.id)
      return
    }

    throw new Error(
      `No deleter is registered for "${resource.kind}". Register one in the fixture that ` +
        'creates this kind of resource.'
    )
  }
}

function isAlreadyGone(error: unknown): boolean {
  const status = (error as { status?: number }).status
  return status === 404 || status === 204
}
