import { runPromptAutoPromote } from '../ai/autonomousCourseEngine.js'

const main = async () => {
  const result = await runPromptAutoPromote()
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'auto promote failed',
      },
      null,
      2,
    ),
  )
  process.exit(1)
})
