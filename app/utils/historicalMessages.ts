function isLocationPayload(value: unknown): boolean {
  return typeof value === 'string' && value.trimStart().startsWith('::location:')
}

export function redactHistoricalLocations<T extends { content?: unknown }>(messages: readonly T[]) {
  return messages.map(message => {
    const content = message.content
    const legacy = content && typeof content === 'object' ? content as { text?: unknown; content?: unknown } : undefined
    if (isLocationPayload(content) || isLocationPayload(legacy?.text) || isLocationPayload(legacy?.content)) {
      return { ...message, content: '[历史位置已隐藏]' }
    }
    return message
  })
}
