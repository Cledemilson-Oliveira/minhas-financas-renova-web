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

## Integrações de pagamento ativas no roadmap

- Mercado Pago Point
- InfinitePay Checkout
- InfiniteTap preparado arquiteturalmente para etapa mobile/deep link

## Backend versionado

- `supabase/functions/mercado-pago-point/index.ts`
- `supabase/functions/infinitepay-checkout/index.ts`
- `supabase/functions/infinitepay-webhook/index.ts`

## Status

Base NextGo + GitHub + Supabase ativa. Estrutura de pagamentos e maquininhas versionada e documentada. A próxima etapa é conectar a interface de Recebimentos aos adaptadores Mercado Pago Point e InfinitePay já preparados no backend.
