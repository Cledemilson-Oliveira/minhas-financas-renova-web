# Mercado Pago Point — OAuth Multiusuário

**Projeto:** Minhas Finanças RENOVA Web  
**Data:** 14/09/2026  
**Objetivo:** permitir que cada usuário conecte sua própria conta Mercado Pago e sua própria Point sem compartilhar Access Token, Client Secret ou senha com o RENOVA.

## Arquitetura

```text
Usuário RENOVA
  -> Conectar Mercado Pago
  -> autorização oficial Mercado Pago (OAuth + PKCE + state)
  -> callback Supabase
  -> credencial OAuth server-only por user_id
  -> API Point usando o token daquele vendedor
  -> Point Pro/Smart do vendedor
  -> Order / webhook
  -> payment_orders
  -> conciliação automática em transactions
```

## O que o cliente faz

1. Entra no Minhas Finanças RENOVA.
2. Abre `Recebimentos`.
3. Toca em `Conectar Mercado Pago`.
4. Faz login diretamente no Mercado Pago e autoriza o RENOVA.
5. Volta ao RENOVA.
6. Toca em `Buscar minhas Points`.
7. Escolhe a maquininha.
8. Usa `Vincular e ativar PDV`.

O cliente **não** cria aplicação no Mercado Pago Developers e **não** copia credenciais privadas.

## Segurança

- PKCE S256 habilitado no início do OAuth.
- `state` aleatório por tentativa, expira em 10 minutos e é usado uma única vez.
- `payment_oauth_credentials` e `payment_oauth_states` são server-only.
- `anon` e `authenticated` não têm permissão de leitura nessas tabelas.
- Somente `service_role` pode acessar tokens.
- Access Token e refresh token nunca são enviados ao navegador.
- A renovação usa `/oauth/token` com `grant_type=refresh_token`.
- O novo refresh token retornado pelo Mercado Pago substitui o anterior.

## Edge Functions

### `mercado-pago-oauth`

JWT obrigatório.

Ações:

- `status`: informa se o usuário possui uma conta Mercado Pago OAuth conectada, sem retornar tokens.
- `start`: cria `state`, PKCE e devolve a URL oficial de autorização.
- `disconnect`: apaga as credenciais OAuth locais e desativa os terminais vinculados.

### `mercado-pago-oauth-callback`

Callback público necessário para o redirect do Mercado Pago.

URL:

```text
https://ysxttnnkuyhzvkjheqfy.supabase.co/functions/v1/mercado-pago-oauth-callback
```

Responsabilidades:

- validar `state`;
- conferir expiração/uso único;
- trocar `code` por `access_token` e `refresh_token`;
- salvar os tokens somente no backend;
- criar/atualizar `payment_provider_connections` com `connection_type=oauth`;
- retornar mensagem de sucesso ao RENOVA.

### `mercado-pago-point`

Versão multiusuário:

- se existir OAuth do usuário, usa o token daquele vendedor;
- se for Conta Dono e não existir OAuth, mantém fallback seguro para `MP_POINT_ACCESS_TOKEN`;
- renova automaticamente o token OAuth quando estiver próximo da expiração;
- permite listar terminals, ativar PDV, criar/cancelar/consultar orders;
- aceita Crédito, Débito e PIX (`default_type=qr`).

### `mercado-pago-point-webhook`

O webhook localiza a `payment_order` primeiro, identifica o `user_id` e então consulta a order no Mercado Pago com a credencial correspondente àquele vendedor. Assim, uma única URL de webhook pode conciliar vários usuários sem misturar contas.

## Secrets necessários no Supabase

Já existentes para a Conta Dono/Point:

- `MP_POINT_ACCESS_TOKEN`
- `MP_POINT_WEBHOOK_SECRET`

Necessário para ativar o OAuth de clientes:

- `MP_POINT_CLIENT_SECRET` — Client Secret da aplicação `Minhasfinancasrenovapoint`.

Recomendado também cadastrar:

- `MP_POINT_CLIENT_ID=4583403024825492`

O código possui fallback para o Client ID atual, mas o secret deixa a configuração independente do código.

## Configuração obrigatória no Mercado Pago Developers

Na aplicação `Minhasfinancasrenovapoint`:

1. Abra as configurações avançadas da aplicação.
2. Adicione esta URL em **URLs de redirecionamento**:

```text
https://ysxttnnkuyhzvkjheqfy.supabase.co/functions/v1/mercado-pago-oauth-callback
```

3. Habilite o fluxo Authorization Code com **PKCE**, se a opção estiver disponível.
4. Mantenha permissões de leitura, escrita e acesso offline necessárias à integração.
5. O webhook de produção continua:

```text
https://ysxttnnkuyhzvkjheqfy.supabase.co/functions/v1/mercado-pago-point-webhook
```

Evento: `Order (Mercado Pago)`.

## Banco de dados

### `payment_oauth_credentials`

Server-only. Armazena por usuário:

- `provider_user_id`
- `access_token`
- `refresh_token`
- `scope`
- `public_key`
- `live_mode`
- `expires_at`

### `payment_oauth_states`

Server-only e temporária. Armazena:

- `state`
- `user_id`
- `code_verifier`
- `return_url`
- `expires_at`
- `used_at`

## Frontend

Arquivo:

```text
js/mercado-pago-oauth-module.js
```

Comportamento:

- usuário comum desconectado: `Conectar Mercado Pago`; `Buscar minhas Points` fica bloqueado;
- OAuth conectado: exibe conta autorizada, libera busca das Points e botão `Desconectar`;
- Conta Dono continua podendo usar a credencial da plataforma sem OAuth;
- OAuth abre em janela/aba externa, evitando problemas de autenticação dentro do iframe da NextGo.

## Migrações

- `20260914_mercado_pago_oauth_multiuser.sql`
- `20260914_mercado_pago_oauth_connection_metadata.sql`
- estados OAuth possuem índice de expiração para limpeza eficiente.

## Próximo teste

Usar uma conta RENOVA que **não seja a Conta Dono**:

1. Clicar `Conectar Mercado Pago`.
2. Autorizar uma conta Mercado Pago diferente da Conta Dono.
3. Confirmar que nenhuma credencial é solicitada no RENOVA.
4. Buscar a Point dessa conta.
5. Ativar PDV.
6. Testar PIX/Débito/Crédito de valor baixo.
7. Confirmar que a receita entra somente no financeiro daquele usuário.
8. Desconectar e confirmar que o terminal deixa de ficar disponível para novas cobranças.

## Referências oficiais

- OAuth / Authorization Code: https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation
- API OAuth: https://www.mercadopago.com.br/developers/pt/reference/authentication/oauth/overview
- Renovação de token: https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/additional-content/security/oauth/renewal
- Detalhes da aplicação / redirect URI / PKCE: https://www.mercadopago.com.br/developers/pt/docs/application-details
