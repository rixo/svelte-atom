const activateGrammar = () => {
  // const defaultHighlightSyntax = atom.config.get('ide-svelte.defaultHighlightScript')
  const defaultHighlightSyntax = 'typescript'

  const langMap = {
    typescript: 'typescript',
    ts: 'typescript',
    javascript: 'javascript',
    js: 'javascript',
  }

  const resolveScriptNodeLang = node => {
    const lang = node
      .child(0)
      .descendantsOfType('attribute')
      .filter(attr => attr.descendantsOfType('attribute_name').pop()?.text === 'lang')
      .flatMap(attr => attr.descendantsOfType('attribute_value').map(av => av.text))
      .pop()
    return langMap[lang]
  }

  const findAllScriptNodesFromAny = node => {
    const doc = node.closest('document')
    if (!doc || !doc.children) return []
    return doc.children.filter(child => child.type === 'script_element') || []
  }

  const resolveLangForAnyNode = node => {
    for (const script of findAllScriptNodesFromAny(node)) {
      const lang = resolveScriptNodeLang(script)
      if (lang) return lang
    }
    return defaultHighlightSyntax
  }

  atom.grammars.addInjectionPoint('source.svelte', {
    type: 'script_element',
    language(node) {
      return resolveScriptNodeLang(node) || defaultHighlightSyntax
    },
    content(node) {
      return node.child(1)
    },
  })

  atom.grammars.addInjectionPoint('source.svelte', {
    type: 'style_element',
    language(node) {
      return 'css'
    },
    content(node) {
      return node.child(1)
    },
  })

  atom.grammars.addInjectionPoint('source.svelte', {
    type: 'raw_text_expr',
    language(node) {
      return resolveLangForAnyNode(node) || defaultHighlightSyntax
    },
    content(node) {
      return node
    },
  })

  atom.grammars.addInjectionPoint('source.svelte', {
    type: 'quoted_attribute_value',
    language(node) {
      if (
        node.parent &&
        node.parent.children.some(sibling => sibling.type === 'attribute_name' && sibling.text === 'style')
      ) {
        return 'css'
      }
    },
    content(node) {
      return node.descendantsOfType('attribute_value')[0]
    },
  })
}

module.exports = { activateGrammar }
