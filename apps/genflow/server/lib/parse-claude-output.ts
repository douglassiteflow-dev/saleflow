/**
 * Parse Claude --output-format json output to extract edit count and summary.
 * Matches v4.10.2 behaviour.
 */
export interface ClaudeResult {
  editCount: number
  summary: string
}

export function parseClaudeOutput(stdout: string): ClaudeResult {
  let editCount = 0
  let summary = ''

  try {
    const messages = JSON.parse(stdout)
    if (!Array.isArray(messages)) return { editCount, summary }

    for (const msg of messages) {
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use' && ['Edit', 'Write'].includes(block.name)) {
            editCount++
          }
        }
      }
    }

    const result = messages.find((m: { type?: string; result?: string }) => m.type === 'result')
    if (result?.result) {
      summary = result.result
        .replace(/```[\s\S]*?```/g, '')
        .trim()
        .slice(0, 500)
    }
  } catch {
    // Not valid JSON — ignore
  }

  return { editCount, summary }
}
