const unwrap = parts =>
  parts
    .join('')
    .split(/\n{2,}/)
    .map(s => s.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''))
    .join('\n\n')

module.exports = {
  useNode: {
    order: 1,
    type: "boolean",
    default: true,
    title: "Use system Node.js"
  },

  nodePath: {
    order: 2,
    type: 'string',
    default: 'node',
    title: 'Node executable',
    description: unwrap`
      Path to the Node executable used to start the language server.


      This is needed because Electron's native Node currently doesn't have
      enough support for dynamic imports to support loading svelte.config.js in
      Svelte Language Server.

      The default will work if node is in your PATH (and Atom can see this
      PATH).

      You can specify the full path to a Node executable if the default strategy
      doesn't work.

      If no usable external Node is found, then an Electron child Node will be
      spawned, but that means that your svelte.config.js won't be visible to the
      language server.

      _Atom restart is required to apply this setting._
    `,
  },

  defaultHighlightScript: {
    order: 3,
    type: 'string',
    enum: ['javascript', 'typescript'],
    default: 'javascript',
    title: 'Default script syntax highlighting',
    description: unwrap`
      Syntax highlighting of script code is determined by the presence of the
      <code>lang</code> attribute on the <code>&lt;script&gt;</code> tag.

      However, in components where there's no <code>&lt;script&gt;</code> tag
      the Svelte grammar can't guess which language (between JS or TS) to use
      in template expressions (<code>{...}</code>). This is when this setting
      is used.

      This setting can also be useful if you have set a default language for
      your components in preprocessing settings, because this won't be detected
      by the Svelte grammar either (grammars are "context free" in Atom, and
      config is context in this case).

      Finally, due to Atom's tree-sitter incremental parsing, template expressions
      highlighting is not recomputed when the <code>lang</code> attribute is
      added / changed in a file that is already opened. So this default value
      will be used in this case too. (Or you can close/reopen the file to detect
      the correct language.)
    `,
  },
}
