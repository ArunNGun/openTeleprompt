import { useEffect, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { useAppStore } from '../store'
import { API } from '../lib/api'

const COLORS = [
  { label: 'White',  value: '#ffffff' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Green',  value: '#4ade80' },
  { label: 'Blue',   value: '#60a5fa' },
  { label: 'Red',    value: '#f87171' },
]
const MARKERS = ['[PAUSE]', '[SLOW]', '[BREATHE]']

function computeStats(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  if (!words) return ''
  const secs = Math.round((words / 130) * 60)
  const timeStr = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${words} words · ~${timeStr} at 130 WPM`
}

export default function EditView() {
  const {
    setView, scripts, setScripts,
    currentScriptIndex, setCurrentScriptIndex,
    setScriptText, setScriptDoc, config,
  } = useAppStore()

  const isClassic = config?.mode === 'classic'
  const [stats, setStats] = useState('')

  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color],
    content: '<p></p>',
    editorProps: {
      attributes: { class: 'tiptap-editor', spellcheck: 'true' },
    },
    onUpdate({ editor }) {
      setStats(computeStats(editor.getText()))
    },
  })

  // Load script when editor is ready
  useEffect(() => {
    if (!editor) return
    const script = scripts[currentScriptIndex]
    if (!script) return
    try {
      editor.commands.setContent(JSON.parse(script.content))
    } catch {
      editor.commands.setContent(`<p>${script.text || ''}</p>`)
    }
    setStats(computeStats(script.text || ''))
  }, [editor])

  const saveCurrentScript = useCallback(() => {
    if (!editor) return
    const text = editor.getText().trim()
    if (!text) return
    const name = text.split('\n')[0].substring(0, 40) || 'Untitled'
    const content = JSON.stringify(editor.getJSON())
    const updated = [...scripts]
    if (currentScriptIndex >= 0) {
      updated[currentScriptIndex] = { ...updated[currentScriptIndex], name, text, content }
    } else {
      updated.unshift({ name, text, content })
      setCurrentScriptIndex(0)
    }
    setScripts(updated)
    API.saveScripts(updated)
  }, [editor, scripts, currentScriptIndex])

  function handleStart() {
    if (!editor) return
    const text = editor.getText().trim()
    if (!text) return
    saveCurrentScript()
    setScriptText(text)
    setScriptDoc(editor.getJSON())
    setView('read')
  }

  function handleCollapse() {
    API.setIgnoreMouse(false)
    setView('idle')
  }

  function handleNew() {
    setCurrentScriptIndex(-1)
    editor?.commands.setContent('<p></p>')
    editor?.commands.focus()
    setStats('')
  }

  function loadScript(i) {
    setCurrentScriptIndex(i)
    if (!editor) return
    const script = scripts[i]
    if (!script) return
    try {
      editor.commands.setContent(JSON.parse(script.content))
    } catch {
      editor.commands.setContent(`<p>${script.text || ''}</p>`)
    }
    setStats(computeStats(script.text || ''))
    editor.commands.focus()
  }

  function deleteScript(e, i) {
    e.stopPropagation()
    const updated = scripts.filter((_, idx) => idx !== i)
    setScripts(updated)
    API.saveScripts(updated)
    if (currentScriptIndex >= i) setCurrentScriptIndex(Math.max(-1, currentScriptIndex - 1))
  }

  function insertMarker(marker) {
    editor?.chain().focus().insertContent(` ${marker} `).run()
  }

  function setColor(color) {
    editor?.chain().focus().setColor(color).run()
  }

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="edit-header">
        <button className="pill-btn ghost" onClick={handleCollapse}>✕</button>
        <span className="view-title">Script</span>
        <button className="pill-btn ghost" onClick={handleNew}>+ New</button>
        <button className="pill-btn ghost" onClick={saveCurrentScript}>Save</button>
        <button className="pill-btn accent" onClick={handleStart}>Go →</button>
      </div>

      {/* Script list */}
      {scripts.length > 0 && (
        <div id="script-list">
          {scripts.map((s, i) => (
            <div key={i} className={`script-item${i === currentScriptIndex ? ' active' : ''}`}>
              <span className="script-name" onClick={() => loadScript(i)}>{s.name}</span>
              <button className="script-del" onClick={(e) => deleteScript(e, i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="tiptap-toolbar">
        <button
          className={`tb-btn${editor?.isActive('bold') ? ' active' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run() }}
          title="Bold"
        ><strong>B</strong></button>

        <div className="tb-divider" />

        {COLORS.map((c) => (
          <button
            key={c.value}
            className="tb-color"
            style={{ background: c.value }}
            onMouseDown={(e) => { e.preventDefault(); setColor(c.value) }}
            title={c.label}
          />
        ))}
        <button
          className="tb-btn"
          onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().unsetColor().run() }}
          title="Clear color"
        >✕</button>

        <div className="tb-divider" />

        {MARKERS.map((m) => (
          <button
            key={m}
            className="tb-marker"
            onMouseDown={(e) => { e.preventDefault(); insertMarker(m) }}
            title={`Insert ${m}`}
          >{m}</button>
        ))}
      </div>

      {/* Editor */}
      <div className="tiptap-wrap">
        <EditorContent editor={editor} />
      </div>

      {/* Stats */}
      <div id="script-stats">{stats}</div>
    </div>
  )
}
