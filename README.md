# Minhas Finanças RENOVA Web

Aplicação web do projeto **Minhas Finanças RENOVA**, construída como projeto independente do Ecossistema RENOVA.

## Arquitetura oficial

- NextGo — desenvolvimento/interface e publicação do projeto web
- GitHub — código-fonte e versionamento
- Supabase — autenticação, banco de dados, storage e serviços backend

## Supabase

Projeto dedicado: `renova-financas`

> As credenciais, tokens e chaves privadas não devem ser gravados diretamente no repositório. Devem permanecer em secrets/variáveis seguras do backend.

## Diretrizes

- Interface RENOVA Dark V2
- Desktop e mobile responsivos
- Alto contraste e leitura fácil
- Preservar funcionalidades estáveis ao evoluir o sistema
- Evitar retrabalho e duplicação de componentes
- Integrações financeiras centralizadas no projeto `renova-financas`
- Não misturar este projeto com o Ecossistema RENOVA

## Documentação

### Registro atual do desenvolvimento

- [`docs/REGISTRO_DESENVOLVIMENTO_2026-09-14.md`](docs/REGISTRO_DESENVOLVIMENTO_2026-09-14.md)

### Pagamentos, maquininhas e integrações

- [`docs/PAGAMENTOS_E_MAQUININHAS.md`](docs/PAGAMENTOS_E_MAQUININHAS.md)
- [`docs/MERCADO_PAGO_OAUTH_MULTIUSUARIO_2026-09-14.md`](docs/MERCADO_PAGO_OAUTH_MULTIUSUARIO_2026-09-14.md)
- [`docs/PIX_NA_POINT_2026-09-14.md`](docs/PIX_NA_POINT_2026-09-14.md)

## Integrações de pagamento ativas

- Mercado Pago Point — Crédito, Débito e PIX
- Mercado Pago OAuth multiusuário — cada vendedor autoriza a própria conta sem compartilhar tokens
- InfinitePay Checkout
- InfiniteTap preparado arquiteturalmente para etapa mobile/deep link

## Backend versionado

- `supabase/functions/mercado-pago-oauth/index.ts`
- `supabase/functions/mercado-pago-oauth-callback/index.ts`
- `supabase/functions/mercado-pago-point/index.ts`
- `supabase/functions/mercado-pago-point-webhook/index.ts`
- `supabase/functions/infinitepay-checkout/index.ts`
- `supabase/functions/infinitepay-webhook/index.ts`

## Segurança OAuth Mercado Pago

- Authorization Code + PKCE S256
- `state` aleatório por tentativa e validade curta
- Access Token e refresh token armazenados somente no backend
- tabelas OAuth sem acesso para `anon` ou `authenticated`
- renovação automática do token do vendedor
- fallback `MP_POINT_ACCESS_TOKEN` mantido somente para a Conta Dono

## Status

Base NextGo + GitHub + Supabase ativa. A integração Mercado Pago Point da Conta Dono foi validada em terminal físico. A estrutura OAuth multiusuário está implantada no backend e no frontend; resta apenas concluir a configuração da aplicação Mercado Pago Developers com o Redirect URI e o `MP_POINT_CLIENT_SECRET` para iniciar o teste com uma conta de usuário comum.
