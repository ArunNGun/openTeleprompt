// Converts Tiptap JSON doc → flat token array for word-by-word rendering
// Token: { type: 'word'|'marker'|'newline', text, bold, color, marker }

const MARKER_RE = /^\[(PAUSE|SLOW|BREATHE)\]$/i

export function tokenizeDoc(doc) {
  const tokens = []

  function walkNode(node) {
    if (!node) return

    if (node.type === 'text') {
      const text = node.text || ''
      const isBold = node.marks?.some(m => m.type === 'bold') ?? false
      const color = node.marks?.find(m => m.type === 'textStyle')?.attrs?.color ?? null

      // Split into words preserving markers
      const words = text.split(/(\s+)/)
      for (const word of words) {
        if (!word || /^\s+$/.test(word)) continue
        const markerMatch = word.match(MARKER_RE)
        if (markerMatch) {
          tokens.push({ type: 'marker', text: word, marker: markerMatch[1].toUpperCase() })
        } else {
          tokens.push({ type: 'word', text: word, bold: isBold, color })
        }
      }
      return
    }

    if (node.type === 'paragraph') {
      if (node.content) node.content.forEach(walkNode)
      tokens.push({ type: 'newline' })
      return
    }

    if (node.content) node.content.forEach(walkNode)
  }

  if (doc?.content) doc.content.forEach(walkNode)
  return tokens
}
