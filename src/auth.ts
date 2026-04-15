export function canTriggerReadCommand(options: {
  actor: string
  association?: string
  allowUsers: string[]
  allowAssociations: string[]
}): boolean {
  if (options.allowUsers.includes(options.actor)) return true
  return Boolean(options.association && options.allowAssociations.includes(options.association))
}

export function canApprove(options: {
  actor: string
  association?: string
  allowUsers: string[]
  allowAssociations: string[]
  isPrAuthorOnSameRepoItem: boolean
}): boolean {
  if (options.allowUsers.includes(options.actor)) return true
  if (options.association && options.allowAssociations.includes(options.association)) return true
  return options.isPrAuthorOnSameRepoItem
}
