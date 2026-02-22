import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { upsertKnowledgeEntries } from '../knowledge/repository.js'

const parseArgs = () => {
  const args = process.argv.slice(2)
  const res = { file: '', actor: 'cli-import' }
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--file') res.file = args[i + 1] || ''
    if (args[i] === '--actor') res.actor = args[i + 1] || 'cli-import'
  }
  return res
}

const main = () => {
  const { file, actor } = parseArgs()
  if (!file) {
    console.error('Usage: node server/scripts/importKnowledge.js --file <json-file> [--actor <name>]')
    process.exit(1)
  }

  const absolutePath = resolve(process.cwd(), file)
  const raw = readFileSync(absolutePath, 'utf-8')
  const payload = JSON.parse(raw)
  const entries = Array.isArray(payload) ? payload : payload.entries
  if (!Array.isArray(entries)) {
    console.error('Invalid payload: expected array or { entries: [] }')
    process.exit(1)
  }

  const result = upsertKnowledgeEntries({ entries, actor })
  console.log(JSON.stringify(result, null, 2))
}

main()
