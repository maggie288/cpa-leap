import { readFileSync } from 'node:fs'

const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || ''
const OCR_SPACE_ENDPOINT = process.env.OCR_SPACE_ENDPOINT || 'https://api.ocr.space/parse/image'
const OCR_SPACE_LANGUAGE = process.env.OCR_SPACE_LANGUAGE || 'chs'

export const canUseOcr = () => Boolean(OCR_SPACE_API_KEY)

export const runPdfOcr = async ({ absolutePath }) => {
  if (!OCR_SPACE_API_KEY) {
    throw new Error('未配置 OCR_SPACE_API_KEY，无法处理扫描版PDF')
  }

  const fileBuffer = readFileSync(absolutePath)
  const form = new FormData()
  form.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), 'scan.pdf')
  form.append('language', OCR_SPACE_LANGUAGE)
  form.append('isOverlayRequired', 'false')
  form.append('OCREngine', '2')
  form.append('scale', 'true')
  form.append('isSearchablePdfHideTextLayer', 'true')

  const response = await fetch(OCR_SPACE_ENDPOINT, {
    method: 'POST',
    headers: {
      apikey: OCR_SPACE_API_KEY,
    },
    body: form,
  })

  if (!response.ok) {
    throw new Error(`OCR请求失败: ${response.status}`)
  }

  const json = await response.json()
  if (json?.IsErroredOnProcessing) {
    throw new Error(json?.ErrorMessage?.join?.('; ') || 'OCR处理失败')
  }

  const pages = (json?.ParsedResults || [])
    .map((item) => String(item?.ParsedText || '').trim())
    .filter(Boolean)

  return {
    pages,
    raw: json,
  }
}
