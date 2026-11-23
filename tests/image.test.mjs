import test from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { insertImageNodes } from '../src/lib/image.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    image: {
      group: 'block',
      attrs: { src: { default: null }, alt: { default: null } },
    },
  },
})

const plain = value => JSON.parse(JSON.stringify(value))

function createView(text, selectionFrom, selectionTo) {
  const doc = schema.nodeFromJSON({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })
  const selection = selectionFrom == null
    ? undefined
    : TextSelection.create(doc, selectionFrom, selectionTo)
  let state = EditorState.create({ schema, doc, selection })
  return {
    get state() { return state },
    isDestroyed: false,
    dispatch(transaction) { state = state.apply(transaction) },
  }
}

test('inserts multiple dropped images in input order', () => {
  const view = createView('hello')

  assert.equal(insertImageNodes(view, [
    { src: 'first', alt: 'first.png' },
    { src: 'second', alt: 'second.png' },
  ], 3), true)

  assert.deepEqual(plain(view.state.doc.toJSON().content.slice(1, 3)), [
    { type: 'image', attrs: { src: 'first', alt: 'first.png' } },
    { type: 'image', attrs: { src: 'second', alt: 'second.png' } },
  ])
})

test('replaces selected text when inserting pasted images', () => {
  const view = createView('hello', 2, 5)

  assert.equal(insertImageNodes(view, [{ src: 'image', alt: 'image.png' }]), true)

  assert.deepEqual(plain(view.state.doc.toJSON().content), [
    { type: 'paragraph', content: [{ type: 'text', text: 'h' }] },
    { type: 'image', attrs: { src: 'image', alt: 'image.png' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'o' }] },
  ])
})

test('does not dispatch into a destroyed editor view', () => {
  const view = createView('hello')
  view.isDestroyed = true

  assert.equal(insertImageNodes(view, [{ src: 'image' }]), false)
  assert.equal(view.state.doc.textContent, 'hello')
})
