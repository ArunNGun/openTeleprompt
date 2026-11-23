import { Fragment } from '@tiptap/pm/model'

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve({ src: reader.result, alt: file.name })
      } else {
        reject(new Error(`Unable to read ${file.name} as a data URL`))
      }
    }
    reader.onerror = () => reject(reader.error || new Error(`Unable to read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

export function readImageFiles(fileList) {
  const files = Array.from(fileList).filter(file => file.type.startsWith('image/'))
  return Promise.all(files.map(readImageFile))
}

export function insertImageNodes(view, images, pos) {
  if (!view || view.isDestroyed || !images.length) return false

  const imageType = view.state.schema.nodes.image
  if (!imageType) return false

  const content = Fragment.fromArray(images.map(({ src, alt }) => (
    imageType.create({ src, alt: alt || null })
  )))
  const transaction = view.state.tr

  if (pos == null) {
    const { from, to } = view.state.selection
    transaction.replaceWith(from, to, content)
  } else {
    transaction.insert(pos, content)
  }

  view.dispatch(transaction)
  return true
}
