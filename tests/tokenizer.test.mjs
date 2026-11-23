import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenizeDoc } from '../src/lib/tokenizer.js'

test('emits image tokens for read mode', () => {
  const tokens = tokenizeDoc({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
      { type: 'image', attrs: { src: 'data:image/png;base64,x', alt: 'cue.png' } },
    ],
  })

  assert.deepEqual(tokens, [
    { type: 'word', text: 'before', bold: false, color: null },
    { type: 'newline' },
    { type: 'image', src: 'data:image/png;base64,x', alt: 'cue.png' },
  ])
})
