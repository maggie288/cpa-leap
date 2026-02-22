import { replayPromptEvaluation } from '../ai/autonomousCourseEngine.js'

const readArg = (name, fallback) => {
  const pair = process.argv.find((item) => item.startsWith(`--${name}=`))
  if (!pair) return fallback
  return pair.slice(name.length + 3)
}

const main = async () => {
  const promptVersion = readArg('prompt', 'prompt-v1')
  const limit = Number(readArg('limit', '20'))
  const result = await replayPromptEvaluation({
    promptVersion,
    limit: Number.isFinite(limit) ? limit : 20,
  })
  console.log(
    JSON.stringify(
      {
        ok: true,
        ...result,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'replay failed',
      },
      null,
      2,
    ),
  )
  process.exit(1)
})
