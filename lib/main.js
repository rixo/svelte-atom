const cp = require('child_process')

const config = require('./config.js')
const { activateGrammar } = require('./grammar.js')

const { CompositeDisposable } = require('atom')
const { AutoLanguageClient, Convert } = require('atom-languageclient')

const languageServerPath = require.resolve('svelte-language-server/bin/server.js')

const suppressSvelteConfigDiagnostics = connection => {
  const { onPublishDiagnostics } = connection

  const isNotSvelteConfigDiag = ({ source, message }) =>
    source !== 'svelte' || !message.startsWith('Error in svelte.config.js')

  connection.onPublishDiagnostics = function(callback) {
    return onPublishDiagnostics.call(this, diag => {
      if (diag.diagnostics) {
        diag.diagnostics = diag.diagnostics.filter(isNotSvelteConfigDiag)
      }
      return callback(diag)
    })
  }
}

// NOTE Language server uses workspaceFolders as project root(s) if present,
// but Atom's implementation provides (or may provide?) an empty value. In this
// case, language server won't find tsconfig.json, and we won't have propper TS
// support (aliases...). On the other hand, if workspaceFolders is not present,
// language server fallbacks on rootUri that is correctly populated by our class.
//
// NOTE Apparently this is fixed in newest versions of atom-languageclient \o/
//
const ensureNonEmptyWorkspaceFolders = params => {
  if (params.workspaceFolders && params.workspaceFolders.length < 1) {
    delete params.workspaceFolders
  }
  return params
}

class SvelteLanguageClient extends AutoLanguageClient {
  config = config
  _suppressSvelteConfigDiagnostic = false

  getGrammarScopes() {
    return ['source.svelte']
  }
  getLanguageName() {
    return 'Svelte'
  }
  getServerName() {
    return 'Svelte Language Server'
  }
  getConnectionType() {
    return 'ipc'
  }

  // NOTE spawning real Node process to work around dynamic import / ESM
  // issues with Electron's Node
  _startServerWithNode(nodePath) {
    const args = ['--inspect', languageServerPath]
    // const args = [languageServerPath]
    this.logger.debug(`starting Node process "${args.join(' ')}"`)
    return cp.spawn(nodePath, args, {
      env: Object.create(process.env), // hopefully node in in PATH
      stdio: [null, null, null, 'ipc'],
    })
  }

  startServerProcess() {
    if (atom.config.get('ide-svelte.useNode')) {
      try {
        const nodePath = atom.config.get('ide-svelte.nodePath')
        if (nodePath) {
          return this._startServerWithNode(nodePath)
        }
      } catch (err) {
        console.error('Failed to start Svelte Language Server on external Node process', err)
        atom.notifications.addError(
          'Failed to start Svelte Language Server on external Node process' +
            ' (trying Electron embeded Node, but losing support of svelte.config.js)',
        )
        this._suppressSvelteConfigDiagnostic = true
      }
    }
    return this.spawnChildNode([languageServerPath], {
      stdio: [null, null, null, 'ipc'],
    })
  }

  getInitializeParams(...args) {
    const params = super.getInitializeParams(...args)
    ensureNonEmptyWorkspaceFolders(params)
    return params
  }

  preInitialization(connection) {
    super.preInitialization(connection)
    if (this._suppressSvelteConfigDiagnostic) {
      suppressSvelteConfigDiagnostics(connection)
    }
  }

  // shouldStartForEditor(editor) {
  //   // console.log(
  //   //   editor.getFileName(),
  //   //   editor.getGrammar().scopeName,
  //   //   this.getGrammarScopes().includes(editor.getGrammar().scopeName),
  //   //   this.getWatchedGrammarScopes().includes(editor.getGrammar().scopeName),
  //   // )
  //   return this.getWatchedGrammarScopes().includes(editor.getGrammar().scopeName)
  // }

  // see: https://github.com/sveltejs/language-tools/blob/4dfb988a3f7223f9d1dfe2bd5a9ff9edb6520a89/packages/svelte-vscode/src/extension.ts#L328
  postInitialization(connection) {
    super.postInitialization(connection)

    const grammarScopes = ["source.ts", "source.js"]
    const editors = new Set()
    const disposable = connection.disposable

    function textEditToContentChange(change) {
      return {
        range: Convert.atomRangeToLSRange(change.oldRange),
        // rangeLength: change.oldText.length,
        text: change.newText,
      }
    }

    disposable.add(
      atom.textEditors.observe(editor => {
        if (editors.has(editor)) return
        if (!grammarScopes.includes(editor.getGrammar().scopeName)) return

        editors.add(editor)

        const disposable = new CompositeDisposable()
        connection.disposable.add(disposable)

        disposable.add(
          editor.onDidDestroy(() => {
            editors.delete(editor)
            disposable.dispose()
          })
        )

        const getEditorUri = () => Convert.pathToUri(editor.getPath() || "")

        function isPrimaryAdapter() {
          const lowestIdForBuffer = Math.min(
            ...atom.workspace
                .getTextEditors()
              .filter((t) => t.getBuffer() === editor.getBuffer())
              .map((t) => t.id)
          )
          return lowestIdForBuffer === editor.id
        }

        function sendIncrementalChanges(event) {
          if (event.changes.length > 0) {
            // Multiple editors, we are not first
            if (!isPrimaryAdapter()) return
            connection.connection._rpc.sendNotification('$/onDidChangeTsOrJsFile', {
              uri: getEditorUri(),
              changes: event.changes.map(textEditToContentChange),
            })
          }
        }

        editor.getBuffer().onDidChangeText(sendIncrementalChanges)
      })
    )
  }

  activate() {
    super.activate()
    activateGrammar()
    //
    // // const defaultHighlightSyntax = atom.config.get('ide-svelte.defaultHighlighting')
    // const defaultHighlightSyntax = 'javascript'
    //
    // const langMap = {
    //   typescript: 'typescript',
    //   ts: 'typescript',
    // }
    //
    // const resolveScriptNodeLang = node => {
    //   const lang = node
    //     .child(0)
    //     .descendantsOfType('attribute')
    //     .flatMap(attr => attr.descendantsOfType('attribute_value').map(av => av.text))
    //     .pop()
    //   return langMap[lang] || 'javascript'
    // }
    //
    // const findScriptNodeFromAny = node => {
    //   const doc = node.closest('document')
    //   if (!doc || !doc.children) return null
    //   return doc.children.find(child => child.type === 'script_element') || null
    // }
    //
    // atom.grammars.addInjectionPoint('source.svelte', {
    //   type: 'script_element',
    //   language: resolveScriptNodeLang,
    //   // language(node) {
    //   //   return 'javascript'
    //   // },
    //   content(node) {
    //     return node.child(1)
    //   },
    // })
    //
    // atom.grammars.addInjectionPoint('source.svelte', {
    //   type: 'style_element',
    //   language(node) {
    //     return 'css'
    //   },
    //   content(node) {
    //     return node.child(1)
    //   },
    // })
    //
    // atom.grammars.addInjectionPoint('source.svelte', {
    //   type: 'raw_text_expr',
    //   language(node) {
    //     const scriptNode = findScriptNodeFromAny(node)
    //     return scriptNode ? resolveScriptNodeLang(scriptNode) : defaultHighlightSyntax
    //   },
    //   content(node) {
    //     return node
    //   },
    // })
    //
    // atom.grammars.addInjectionPoint('source.svelte', {
    //   type: 'quoted_attribute_value',
    //   language(node) {
    //     if (
    //       node.parent &&
    //       node.parent.children.some(sibling => sibling.type === 'attribute_name' && sibling.text === 'style')
    //     ) {
    //       return 'css'
    //     }
    //   },
    //   content(node) {
    //     return node.descendantsOfType('attribute_value')[0]
    //   },
    // })
  }
}

module.exports = new SvelteLanguageClient()
