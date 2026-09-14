# Correção — retorno OAuth Mercado Pago exibindo HTML bruto

Data: 14/09/2026

## Sintoma

Após autorizar a conta Mercado Pago, a janela de retorno da Edge Function `mercado-pago-oauth-callback` exibiu o HTML como texto bruto em vez de renderizar a página de confirmação.

## Diagnóstico

A autorização OAuth foi concluída corretamente e a conexão foi salva no backend. O problema estava apenas na apresentação/retorno da janela de callback em determinados navegadores/iframes.

## Solução definitiva

O callback deixou de depender de uma página HTML renderizada diretamente pela Edge Function.

Agora o fluxo é:

1. Mercado Pago redireciona para `mercado-pago-oauth-callback`.
2. A Edge Function valida `state`, PKCE e troca o `code` pelo token.
3. As credenciais ficam salvas exclusivamente no backend.
4. A Edge Function responde com redirecionamento HTTP 303 para o domínio do Minhas Finanças RENOVA.
5. O retorno carrega `mp_oauth=success` ou `mp_oauth=error`.
6. `mercado-pago-oauth-return-fix.js` atualiza a janela principal e fecha o popup quando possível.

## Segurança

- Nenhum Access Token é enviado pela URL.
- Nenhum Client Secret vai para o navegador.
- A mensagem de retorno é limitada e não contém credenciais.
- O destino do redirect continua restrito a domínios permitidos do RENOVA.
- O `state` e o `code_verifier` continuam armazenados no backend.

## Arquivos

- `supabase/functions/mercado-pago-oauth-callback/index.ts`
- `js/mercado-pago-oauth-return-fix.js`
- `js/config.js`

## Edge Function

`mercado-pago-oauth-callback` publicada na versão 4.
