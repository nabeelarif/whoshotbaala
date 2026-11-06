type VerdictStoryCardOptions = {
  verdict: string
  agreementPercent: number | null
  totalVotes: number
  calledIt: boolean
  shareUrl: string
}

export async function createVerdictStoryCard({
  verdict,
  agreementPercent,
  totalVotes,
  calledIt,
  shareUrl,
}: VerdictStoryCardOptions): Promise<File> {
  await document.fonts.ready

  const canvas = document.createElement('canvas')
  canvas.width = 810
  canvas.height = 1440

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Your browser could not create the share card.')
  }

  context.fillStyle = '#17110D'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = '#3A2D22'
  context.lineWidth = 3
  context.strokeRect(28, 28, canvas.width - 56, canvas.height - 56)

  context.fillStyle = '#F3E9DC'
  context.font = '700 32px Inter, Arial, sans-serif'
  context.fillText('WHO SHOT BAALA?', 64, 108)
  context.fillStyle = '#E8A930'
  context.beginPath()
  context.arc(730, 92, 24, 0, Math.PI * 2)
  context.arc(730, 92, 10, 0, Math.PI * 2)
  context.fill('evenodd')

  context.fillStyle = '#2A2014'
  context.fillRect(64, 220, calledIt ? 230 : 190, 48)
  context.fillStyle = '#E8A930'
  context.font = '700 22px Inter, Arial, sans-serif'
  context.fillText(calledIt ? 'CALLED IT' : 'MY VERDICT', 82, 252)

  context.fillStyle = '#D9CBB9'
  context.font = '48px Anton, Impact, sans-serif'
  context.fillText('I THINK', 64, 392)
  context.fillStyle = '#E8A930'
  context.font = '112px Anton, Impact, sans-serif'
  context.fillText(verdict.toUpperCase(), 64, 535, 680)
  context.fillStyle = '#D9CBB9'
  context.font = '48px Anton, Impact, sans-serif'
  context.fillText('SHOT BAALA.', 64, 620)

  context.fillStyle = '#F3E9DC'
  context.font = '30px Arial, sans-serif'
  context.textAlign = 'right'
  context.fillText('بالے نوں گولی کِنّے ماری؟', 746, 710)
  context.textAlign = 'left'

  context.fillStyle = '#221A14'
  context.fillRect(64, 830, 682, 170)
  context.strokeStyle = '#3A2D22'
  context.strokeRect(64, 830, 682, 170)
  context.fillStyle = '#F3E9DC'
  context.font = '700 28px Inter, Arial, sans-serif'
  context.fillText(
    agreementPercent === null ? 'LIVE FAN RESULTS' : `${agreementPercent}% OF FANS AGREE`,
    92,
    890,
  )
  context.fillStyle = '#BFAE9B'
  context.font = '24px Inter, Arial, sans-serif'
  context.fillText(
    agreementPercent === null ? 'Vote and see the live verdict' : `${totalVotes.toLocaleString()} total votes`,
    92,
    936,
  )
  context.fillStyle = '#3A2D22'
  context.fillRect(92, 960, 626, 12)
  if (agreementPercent !== null) {
    context.fillStyle = '#E8A930'
    context.fillRect(92, 960, 626 * (agreementPercent / 100), 12)
  }

  context.fillStyle = '#F3E9DC'
  context.font = '600 27px Inter, Arial, sans-serif'
  context.fillText(calledIt ? 'The reveal proved my theory.' : 'Cast your vote before the reveal.', 64, 1130)
  context.fillStyle = '#E8A930'
  context.font = '700 23px Inter, Arial, sans-serif'
  context.fillText(shareUrl.replace(/^https?:\/\//, ''), 64, 1190, 682)
  context.fillStyle = '#BFAE9B'
  context.font = '18px Inter, Arial, sans-serif'
  context.fillText('Fan poll · not affiliated with Green Entertainment', 64, 1320, 682)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })

  if (!blob) {
    throw new Error('Your browser could not export the share card.')
  }

  return new File([blob], 'who-shot-baala-verdict.png', { type: 'image/png' })
}
