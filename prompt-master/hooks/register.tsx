import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const isAuto = atom({ plugin: 'prompt-master', key: 'isAuto' } as const, false)
const isBusy = atom({ plugin: 'prompt-master', key: 'isBusy' } as const, false)
const note = atom({ plugin: 'prompt-master', key: 'note' } as const, null)
const pending = atom({ plugin: 'prompt-master', key: 'pending' } as const, null)

const SYSTEM = `Você reescreve prompts que uma pessoa vai mandar para um agente de código (Claude Code).
Devolva SÓ o prompt reescrito, pronto para enviar, sem comentário, sem aspas, sem cercas de código em volta.

Regras:
- Mantenha o idioma do original (normalmente português do Brasil) e a voz da pessoa, em primeira pessoa.
- Preserve todo fato, nome, caminho, link, número, trecho de código e restrição do original. Não invente requisitos, arquivos ou dados que não estejam lá.
- Deixe claro: o objetivo (o que fazer e por quê, se o original disser), o contexto relevante, as restrições e o critério de "pronto" (como saber que terminou e como verificar).
- Onde faltar algo que só a pessoa sabe, não invente: escreva uma instrução curta como "se faltar X, me pergunte antes" ou "explore o projeto para descobrir X".
- Seja direto. Use tópicos curtos quando ajudar; um prompt simples continua curto.
- Se o texto for uma conversa casual, uma resposta curta (sim, não, ok, pode) ou já estiver claro e completo, devolva-o igual.`

const MIN_LEN = 12

// Last text this mod put in the box: an Enter on it goes through untouched.
let lastRewrite: string | null = null


async function rewrite($: EngineInterface, text: string) {
  const r = await $.model.complete({
    model: 'sonnet',
    system: SYSTEM,
    prompt: `Prompt original:\n\n${text}`,
    maxTokens: 4096,
    effort: 'medium',
    timeoutMs: 90000,
  })
  if (!r.isAnswered) {
    return { error: r.reason === 'api-error' ? `erro da API (${r.status ?? '?'})` : r.reason }
  }
  const out = r.text.trim()
  return out ? { text: out } : { error: 'resposta vazia' }
}

// Puts `text` in the box and reads it back: the desktop app can clear the
// box after a fill (as it does after a dropped submit), so a fill that
// reports success is not trusted until the box really holds the text.
// What does not land stays in the band above the box, never lost.
async function placeInBox($: EngineInterface, text: string): Promise<boolean> {
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  const box = filled.isFilled ? await $.prompt.read() : null
  if (box && box.text.trim() === text.trim()) {
    await update($, pending, () => null)
    await say($, 'Prompt reescrito na caixa. Revise e envie.')
    return true
  }
  await update($, pending, () => text)
  await say($, 'A versão nova está aqui embaixo.')
  return false
}

// Rewrites `text`; returns the new text, or null after telling the person why not.
async function getRewrite($: EngineInterface, text: string): Promise<string | null> {
  if (text.trim().length < MIN_LEN) {
    await say($, 'Digite um prompt na caixa primeiro.')
    return null
  }
  if (await read($, isBusy)) {
    await say($, 'Já estou reescrevendo, um momento.')
    return null
  }
  await update($, isBusy, () => true)
  await say($, 'Reescrevendo o prompt...')
  try {
    const r = await rewrite($, text)
    if ('error' in r) {
      await say($, `Não consegui reescrever: ${r.error}. Seu texto ficou como estava.`)
      return null
    }
    lastRewrite = r.text
    return r.text
  } finally {
    await update($, isBusy, () => false)
  }
}

async function improve($: EngineInterface, text: string): Promise<string> {
  const out = await getRewrite($, text)
  if (out === null) return (await read($, note)) ?? ''
  await placeInBox($, out)
  return (await read($, note)) ?? ''
}

async function say($: EngineInterface, msg: string) {
  await update($, note, () => msg)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('isAuto')
    await update($, isAuto, () => saved === true)
    await $.command.register({
      name: 'pm',
      description: 'Prompt Master: reescreve o texto depois de /pm num prompt melhor e põe na caixa',
    })
    return next(e)
  })

  on('command.run', { command: 'pm' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'auto') {
      const v = !(await read($, isAuto))
      await update($, isAuto, () => v)
      await $.store.set('isAuto', v)
      return { text: `Prompt Master automático ${v ? 'ligado' : 'desligado'}.` }
    }
    if (!args) {
      return { text: 'Uso: /pm <seu prompt>  (ou /pm auto para ligar/desligar a reescrita antes de enviar)' }
    }
    const msg = await improve($, args)
    await say($, msg)
    return { text: msg }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!(await read($, isAuto))) return next(e)
    if (e.command || e.isMeta || e.turnId || e.attachments?.length) return next(e)
    if (e.origin && e.origin.kind !== 'composer') return next(e)
    const text = e.text
    if (text.trim().length < MIN_LEN || text.trim().startsWith('/')) return next(e)
    if (lastRewrite !== null && text.trim() === lastRewrite.trim()) {
      lastRewrite = null
      return next(e)
    }
    const out = await getRewrite($, text)
    if (out === null) return next(e)
    // Keep the new version in the band first, so it survives whatever the
    // app does to the box; then fill the box once the app has cleared it.
    await update($, pending, () => out)
    await say($, 'A versão nova está aqui embaixo; colocando na caixa...')
    $.clock.after(800, () => {
      void placeInBox($, out)
    })
    return { drop: 'Prompt Master: versão melhorada pronta. Revise na caixa e aperte Enter para enviar.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const auto = await read($, isAuto)
    const busy = await read($, isBusy)
    const msg = await read($, note)
    const alt = await read($, pending)

    return (
      <Box flexDirection="column">
        <Box>
          <Button
            key="pm-go"
            label={busy ? '⏳ Reescrevendo...' : '✨ Prompt Master'}
            variant="primary"
            onPress={async () => {
              const box = await $.prompt.read()
              await say($, await improve($, box.text))
            }}
          />
          <Text> </Text>
          <Button
            key="pm-auto"
            label={auto ? 'Auto antes de enviar: ligado' : 'Auto antes de enviar: desligado'}
            dimColor={!auto}
            onPress={async () => {
              const v = !auto
              await update($, isAuto, () => v)
              await $.store.set('isAuto', v)
            }}
          />
          {msg ? <Text dimColor> {msg}</Text> : null}
        </Box>
        {alt ? (
          <Box flexDirection="column">
            <Text>{alt}</Text>
            <Box>
              <Button
                key="pm-send"
                label="Enviar esta versão"
                onPress={async () => {
                  await update($, pending, () => null)
                  void $.prompt.submit({ text: alt })
                }}
              />
              <Text> </Text>
              <Button key="pm-fill" label="Colocar na caixa" onPress={() => placeInBox($, alt)} />
              <Text> </Text>
              <Button key="pm-discard" label="Descartar" dimColor onPress={() => update($, pending, () => null)} />
            </Box>
          </Box>
        ) : null}
      </Box>
    )
  })
}
