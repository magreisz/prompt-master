# Prompt Master

Mod do Claude Code que reescreve o prompt digitado numa versão mais clara e específica, com objetivo, contexto, restrições e critério de "pronto", e coloca o resultado de volta na caixa de mensagem para você revisar antes de enviar.

- Botão **✨ Prompt Master** na faixa logo acima da caixa de mensagem: reescreve o que está digitado.
- Botão **Auto antes de enviar**: quando ligado, todo prompt enviado com Enter é reescrito primeiro e devolvido à caixa; um segundo Enter envia a versão revisada.
- `/pm <texto>`: reescreve o texto e põe na caixa. `/pm auto` liga ou desliga o modo automático.

A reescrita usa o próprio modelo da sessão (Sonnet), sem chave de API extra.

## Instalação

No prompt de uma sessão do Claude Code no terminal:

```
/plugin install prompt-master --marketplace magreisz/prompt-master
```

Num shell:

```
claude plugin install prompt-master --marketplace magreisz/prompt-master
```

No app desktop, onde `/plugin` não roda: clique no + ao lado da caixa de mensagem, depois Plugins, Add marketplace com `magreisz/prompt-master`, e então Add plugin.
