# Registro de desenvolvimento — Minhas Finanças RENOVA

Data de referência: **14/09/2026**

Este documento registra o estado técnico consolidado do projeto para evitar retrabalho, perda de contexto e mistura com outros projetos.

## Identificação

- Projeto: **Minhas Finanças RENOVA Web**
- Repositório: `Cledemilson-Oliveira/minhas-financas-renova-web`
- Supabase: `renova-financas`
- Project ref: `ysxttnnkuyhzvkjheqfy`
- Região: `sa-east-1`
- Publicação/interface: NextGo + GitHub Pages
- Domínio: `https://minhasfinancas.servicosgold.com.br/`

> Este projeto é independente do **Ecossistema RENOVA**. Não misturar código, banco, credenciais, migrations ou deploys.

## Arquitetura oficial

```text
NextGo
  ↓
iframe
  ↓
GitHub Pages
  ↓
HTML + CSS + JavaScript
  ↓
Supabase Auth + PostgreSQL + Edge Functions
  ↓
Mercado Pago / InfinitePay
```

## Regras permanentes

- preservar funcionalidades estáveis;
- evitar retrabalho;
- manter desktop/mobile responsivos;
- manter alto contraste;
- segredos somente no backend;
- banco sempre versionado em migrations;
- Edge Function publicada também deve existir no GitHub;
- pagamento integrado nunca vira receita apenas porque a cobrança foi criada;
- somente confirmação oficial do provedor pode consolidar a receita.

## Entregas consolidadas

### Receitas e despesas fixas por dia

O sistema suporta fluxos recorrentes por dias da semana, permitindo, por exemplo, segunda a sábado sem gerar domingo.

Arquivos:

- `supabase/migrations/20260913_weekly_fixed_schema.sql`
- `supabase/migrations/20260913_weekly_fixed_functions.sql`

### Multa, juros e encargos

Despesas suportam:

- multa percentual;
- juros simples por dia;
- encargo fixo;
- vencimento.

Arquivo:

- `supabase/migrations/20260914_transaction_late_fees_and_charges.sql`

### Formas de recebimento

Receitas suportam:

- Dinheiro
- Pix
- Débito
- Crédito
- Outro

Cartão registra bruto, taxa, líquido e maquininha usada.

Arquivos:

- `supabase/migrations/20260914_payment_methods_and_card_terminals.sql`
- `js/payments-module.js`
- `css/payments-module.css`

## Integrações de pagamento

Escopo ativo atual:

1. **Mercado Pago**
2. **InfinitePay**

### Fundação multi-provedor

Migration aplicada:

`payment_provider_integrations_foundation`

Arquivo:

- `supabase/migrations/20260914_payment_provider_integrations_foundation.sql`

Estruturas:

- `payment_provider_connections`
- `payment_orders`
- `payment_terminals.connection_id`
- `payment_terminals.integration_mode`

### Conciliação automática

Migration aplicada:

`payment_order_auto_reconciliation`

Arquivo:

- `supabase/migrations/20260914_payment_order_auto_reconciliation.sql`

Trigger:

`payment_orders_reconcile_processed`

Regra:

```text
payment_order.status = processed
      ↓
valida conta/categoria
      ↓
calcula taxa da maquininha quando aplicável
      ↓
cria uma única transactions do tipo receita
      ↓
preenche payment_orders.transaction_id
```

A função `reconcile_processed_payment_order()` teve `EXECUTE` revogado de `anon` e `authenticated`.

## Mercado Pago Point

### Modelos previstos

Pela documentação atual do Mercado Pago:

- Point Smart 1
- Point Smart 2
- Point Pro 2
- Point Pro 3

A **Point Mini** fica em operação manual/assistida; não tratá-la como terminal Point/Orders automatizado sem documentação oficial equivalente.

### Backend

Edge Function:

- `mercado-pago-point`
- arquivo: `supabase/functions/mercado-pago-point/index.ts`

Ações implementadas:

- `list_terminals`
- `setup_terminal`
- `connect_terminal`
- `create_order`
- `get_order`
- `cancel_order`

O backend resolve o terminal local do RENOVA antes de mandar a cobrança. Uma venda não pode informar livremente um terminal externo qualquer.

### Webhook

Edge Function:

- `mercado-pago-point-webhook`
- arquivo: `supabase/functions/mercado-pago-point-webhook/index.ts`

URL:

```text
https://ysxttnnkuyhzvkjheqfy.supabase.co/functions/v1/mercado-pago-point-webhook
```

No Mercado Pago Developers deve ser configurado o evento **Order (Mercado Pago)**.

O webhook valida assinatura, consulta `/v1/orders/{id}`, atualiza `payment_orders` e deixa o trigger fazer a conciliação.

### Segurança Mercado Pago

O token global continua restrito à **Conta Dono**.

Usuários comuns recebem bloqueio até existir **OAuth Mercado Pago individual por usuário**.

## InfinitePay

### Checkout

Edge Function:

- `infinitepay-checkout`
- arquivo: `supabase/functions/infinitepay-checkout/index.ts`

Ações:

- salvar InfiniteTag;
- criar Checkout Integrado;
- criar `payment_order`;
- executar `payment_check`.

### Webhook

Edge Function:

- `infinitepay-webhook`
- arquivo: `supabase/functions/infinitepay-webhook/index.ts`

O webhook usa `payment_check` antes de considerar o pagamento aprovado e também valida o valor esperado.

Quando a order vira `processed`, o trigger cria a receita automaticamente.

### InfiniteTap

A modelagem permanece preparada, mas o retorno automático do InfiniteTap depende de deep link/app compatível. Não simular esse comportamento no iframe web.

## Interface implementada

Novo módulo:

- `js/payment-integrations-module.js`
- `css/payment-integrations-module.css`

Carregamento:

- `js/config.js`

### Recebimentos → integrações

Mercado Pago:

- status;
- **Buscar minhas Points**;
- listar terminais encontrados;
- **Vincular e ativar PDV**.

InfinitePay:

- campo InfiniteTag;
- **Conectar InfinitePay**.

### Nova receita

Quando uma Point conectada é selecionada:

- botão **Cobrar na Point**;
- parcelas no crédito;
- polling de status;
- botão de cancelamento enquanto houver order ativa;
- receita somente após aprovação.

Quando a InfinitePay está conectada:

- botão **Gerar checkout InfinitePay**;
- criação do checkout;
- webhook / payment_check;
- conciliação automática.

## Separação obrigatória

### Assinatura RENOVA

Pagamento que o usuário faz para contratar o aplicativo.

### Recebimento do usuário

Venda/serviço que o próprio usuário recebe de seus clientes.

Esses fluxos não devem ser misturados.

## Edge Functions de pagamento atuais

- `mercado-pago-create-subscription`
- `mercado-pago-webhook`
- `mercado-pago-transparent-webhook`
- `mercado-pago-transparent-checkout`
- `mercado-pago-point`
- `mercado-pago-point-webhook`
- `infinitepay-checkout`
- `infinitepay-webhook`

Além delas:

- `finance-ai`

## Próximo teste operacional

### Mercado Pago

1. Abrir Mercado Pago Developers.
2. Configurar o webhook Point com a URL registrada acima.
3. Selecionar **Order (Mercado Pago)**.
4. No RENOVA, abrir **Recebimentos**.
5. Clicar **Buscar minhas Points**.
6. Vincular uma Point Pro/Smart.
7. Informar as taxas da maquininha.
8. Criar uma receita de teste com valor baixo.
9. Selecionar Crédito/Débito + Point.
10. Usar **Cobrar na Point**.
11. Confirmar pagamento.
12. Verificar entrada automática no financeiro/dashboard.

### InfinitePay

1. Habilitar Checkout Integrado na conta InfinitePay.
2. Informar a InfiniteTag no RENOVA.
3. Criar receita de teste.
4. Clicar **Gerar checkout InfinitePay**.
5. Fazer o pagamento.
6. Confirmar conciliação automática.

## Segurança verificada nesta etapa

- trigger de conciliação existe;
- índices de unicidade existem;
- `authenticated` não executa a função de trigger;
- `anon` não executa a função de trigger.

O Security Advisor ainda aponta avisos anteriores em outras cinco funções `SECURITY DEFINER` e proteção contra senhas vazadas desativada. Esses pontos não foram criados pela integração atual e devem entrar em revisão separada.

## Código de publicação NextGo

```html
<iframe
  src="https://cledemilson-oliveira.github.io/minhas-financas-renova-web/"
  title="Minhas Finanças RENOVA"
  style="position:fixed;inset:0;width:100%;height:100dvh;border:0;"
  allow="camera;microphone;clipboard-read;clipboard-write"
  allowfullscreen>
</iframe>
```

## Documentação detalhada

- `docs/PAGAMENTOS_E_MAQUININHAS.md`
- `docs/REGISTRO_DESENVOLVIMENTO_2026-09-14.md`

## Commits principais da etapa de pagamentos

- `cc74530a2194f90164e812df342cdd505697d1d2` — fundação multi-provedor.
- `78b0d58140d64b0d4369ff1404a088ce100af6fb` — Point inicial.
- `789b7bd3d4311d89378f32236b64a362c48e9957` — InfinitePay Checkout.
- `d14a6806c0b9dbaa50dbabe65d1e5a36779c2f2b` — webhook InfinitePay.
- `14ba2768d18c9cea1456513d3c2c9f4c0e507e66` — conciliação automática.
- `840b7d9320f8937a57f7fbc2e93af906c65c4f3f` — Point integrada ao fluxo de cobrança.
- `df7218ea8f28d42b20f64e45b3f1ad4a876b535b` — webhook Point Orders.
- `20c386e521f2a43d8d7cadb88ae0dcecfc8be5b8` — interface das integrações.
- `e94b6ef57b81c5691c9cb2dc8fab4f67562fc242` — estilos das integrações.
- `3aaaec912e0bc9dd5c4578ab681b7f44650a3d08` — carregamento do módulo.
- `502b08c8f43663c80fb23bda2e93ceab415b6d7b` — documentação técnica atualizada.

Este arquivo deve ser atualizado sempre que a arquitetura de pagamentos sofrer mudança relevante.
