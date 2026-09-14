# Pagamentos e maquininhas — Minhas Finanças RENOVA

> Documento técnico oficial da integração de pagamentos do projeto **Minhas Finanças RENOVA Web**.  
> Atualizado em: **14/09/2026**  
> Escopo ativo: **Mercado Pago + InfinitePay**.

## 1. Arquitetura

```text
NextGo / iframe
      ↓
GitHub Pages
      ↓
Frontend RENOVA
      ↓
Supabase Auth + PostgreSQL + Edge Functions
      ↓
Mercado Pago Point / InfinitePay Checkout
```

Regra de segurança: **tokens privados, service_role, Access Token, Client Secret e chaves de webhook nunca ficam no HTML, JavaScript público ou GitHub Pages.**

## 2. Estado atual

| Recurso | Estado |
|---|---|
| Dinheiro, Pix, Débito, Crédito e Outro | Implementado |
| Cadastro de maquininhas | Implementado |
| Taxa de débito/crédito | Implementado |
| Bruto, taxa e líquido | Implementado |
| Histórico preserva a taxa original | Implementado |
| Fundação multi-provedor | Implementada |
| Área de integrações Mercado Pago + InfinitePay | Implementada |
| Buscar Points da conta Mercado Pago | Implementado |
| Vincular Point e ativar modo PDV | Implementado |
| Cobrar diretamente na Point | Implementado |
| Consultar/cancelar order Point | Implementado |
| Webhook Point Orders | Implementado no backend |
| InfinitePay — salvar InfiniteTag | Implementado |
| InfinitePay — gerar Checkout Integrado | Implementado |
| InfinitePay — webhook + `payment_check` | Implementado |
| Conciliação automática `payment_order -> transaction` | Implementada |
| OAuth Mercado Pago por usuário | Pendente |
| Configurar URL do webhook Point no painel Mercado Pago | Ação operacional pendente |
| InfiniteTap com retorno automático no iframe | Não ativado; exige app/deep link compatível |

## 3. Banco de dados

### `payment_terminals`

Armazena as maquininhas e taxas do usuário.

Campos principais:

- `user_id`
- `name`
- `provider`
- `external_terminal_id`
- `debit_fee_percent`
- `credit_fee_percent`
- `is_active`
- `integration_status`
- `connection_id`
- `integration_mode`

Índice exclusivo evita duplicar o mesmo terminal externo para o mesmo usuário/provedor.

### `payment_provider_connections`

Representa a conexão do usuário com o provedor.

- Mercado Pago: conexão da Point.
- InfinitePay: conexão do Checkout Integrado via InfiniteTag.

**Não gravar tokens nessa tabela.**

### `payment_orders`

Toda cobrança integrada nasce primeiro como uma `payment_order`.

Campos principais:

- provedor;
- conexão;
- terminal;
- ID da order no provedor;
- referência externa;
- valor;
- método;
- parcelas;
- status;
- `transaction_id` depois da conciliação;
- dados adicionais em `provider_data`.

O frontend autenticado pode consultar apenas as próprias orders. Escritas sensíveis são feitas no backend.

## 4. Conciliação automática

Migration:

`supabase/migrations/20260914_payment_order_auto_reconciliation.sql`

Trigger:

`payment_orders_reconcile_processed`

Fluxo:

```text
payment_order criada
      ↓
provedor confirma pagamento
      ↓
status = processed
      ↓
trigger de conciliação
      ↓
transactions recebe uma única receita
      ↓
payment_orders.transaction_id é preenchido
```

A função `reconcile_processed_payment_order()` não possui `EXECUTE` para `anon` nem `authenticated`; ela é usada somente como trigger.

A conciliação é idempotente porque uma order que já possui `transaction_id` não gera nova receita.

Para Point, a taxa configurada na maquininha é aplicada no momento da conciliação:

```text
Bruto = R$ 100,00
Taxa configurada = 2,00%
Taxa = R$ 2,00
Líquido / transactions.amount = R$ 98,00
```

## 5. Mercado Pago Point

### Modelos previstos para integração automática

De acordo com a documentação atual do Mercado Pago:

- Point Smart 1
- Point Smart 2
- Point Pro 2
- Point Pro 3

A **Point Mini** continua como operação manual/assistida; não é tratada como terminal automatizado da API Point/Orders sem documentação oficial equivalente.

### Edge Function

`supabase/functions/mercado-pago-point/index.ts`

Função publicada:

`mercado-pago-point`

Ações:

- `list_terminals` — busca os terminais vinculados à conta.
- `setup_terminal` — altera `PDV` / `STANDALONE`.
- `connect_terminal` — coloca a Point em PDV, cria a conexão no RENOVA e cadastra o terminal integrado.
- `create_order` — cria cobrança Point.
- `get_order` — consulta e atualiza a order.
- `cancel_order` — cancela uma order válida.

O `create_order` recebe o **ID local da maquininha do RENOVA**, não aceita simplesmente um terminal externo arbitrário. O backend confere que a maquininha pertence ao usuário, está ativa, conectada e em `mercado_pago_point`.

### Webhook Point

Edge Function:

`supabase/functions/mercado-pago-point-webhook/index.ts`

Função publicada:

`mercado-pago-point-webhook`

URL de produção:

```text
https://ysxttnnkuyhzvkjheqfy.supabase.co/functions/v1/mercado-pago-point-webhook
```

No Mercado Pago Developers deve ser selecionado o evento **Order (Mercado Pago)**.

O webhook:

1. valida `x-signature` com `MP_WEBHOOK_SECRET`;
2. busca a order diretamente no endpoint `/v1/orders/{id}`;
3. atualiza `payment_orders`;
4. ao receber `processed`, o trigger cria a receita automaticamente.

Eventos finais tratados incluem processada, falha, cancelamento, expiração e reembolso.

Referências oficiais:

- https://www.mercadopago.com.br/developers/pt/docs/mp-point/overview
- https://www.mercadopago.com.br/developers/pt/docs/mp-point/configure-terminal
- https://www.mercadopago.com.br/developers/pt/docs/mp-point/payment-processing
- https://www.mercadopago.com.br/developers/pt/docs/mp-point/notifications

### Segurança Mercado Pago

O token global atual é bloqueado para usuários comuns. Até existir OAuth individual, a função Point permite operação com o token global somente para a **Conta Dono**.

Próxima evolução obrigatória para liberar Point a clientes:

**OAuth Mercado Pago por usuário.**

## 6. InfinitePay

A integração ativa nesta fase é o **Checkout Integrado**.

### Edge Function

`supabase/functions/infinitepay-checkout/index.ts`

Ações:

- `save_connection` — salva a InfiniteTag.
- `create_checkout` — cria `payment_order` e chama `POST https://api.checkout.infinitepay.io/links`.
- `payment_check` — confirma a transação com `POST https://api.checkout.infinitepay.io/payment_check`.

O checkout recebe `order_nsu`, `redirect_url`, `webhook_url` e itens em centavos.

### Webhook

`supabase/functions/infinitepay-webhook/index.ts`

O webhook não confia apenas no payload recebido. Ele executa `payment_check`, confirma o `order_nsu`, compara o valor pago com o valor esperado e só então muda a order para `processed`.

Quando isso acontece, a conciliação automática gera a receita no financeiro.

Referências oficiais:

- https://www.infinitepay.io/desenvolvedores
- https://www.infinitepay.io/checkout
- https://www.infinitepay.io/checkout-documentacao
- https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-integrado-da-infinitepay

### InfiniteTap

A estrutura do banco continua preparada para `infinitepay_tap`, mas o retorno oficial do InfiniteTap depende de deep link/app de origem. Como o RENOVA atual roda como web app dentro de iframe, não vamos simular um retorno nativo que não existe.

## 7. Interface implementada

Frontend:

- `js/payments-module.js`
- `css/payments-module.css`
- `js/payment-integrations-module.js`
- `css/payment-integrations-module.css`

O módulo de integrações é carregado por `js/config.js`.

Na tela **Recebimentos** o usuário encontra:

### Mercado Pago

- status da integração;
- botão **Buscar minhas Points**;
- lista de terminais encontrados;
- botão **Vincular e ativar PDV**.

### InfinitePay

- campo **InfiniteTag**;
- botão **Conectar InfinitePay**.

No lançamento de receita:

### Point integrada

Quando Crédito/Débito + Point integrada são selecionados:

- aparece **Cobrar na Point**;
- crédito permite selecionar parcelas;
- a order é enviada;
- o sistema acompanha o status;
- somente após `processed` a receita é criada.

### InfinitePay

Quando a InfinitePay está conectada:

- aparece **Gerar checkout InfinitePay**;
- o checkout é criado pela API;
- o pagamento é confirmado pelo webhook / `payment_check`;
- a receita é conciliada automaticamente.

## 8. Separação de responsabilidades

Não misturar:

### Assinatura do Minhas Finanças RENOVA

Pagamento que o usuário faz para contratar um plano do aplicativo.

### Recebimento do usuário

Pagamento que o cliente daquele usuário faz por um produto ou serviço.

As duas operações usam fluxos independentes.

## 9. Arquivos principais

### Banco

- `supabase/migrations/20260914_payment_methods_and_card_terminals.sql`
- `supabase/migrations/20260914_payment_provider_integrations_foundation.sql`
- `supabase/migrations/20260914_payment_order_auto_reconciliation.sql`

### Backend

- `supabase/functions/mercado-pago-point/index.ts`
- `supabase/functions/mercado-pago-point-webhook/index.ts`
- `supabase/functions/infinitepay-checkout/index.ts`
- `supabase/functions/infinitepay-webhook/index.ts`

### Frontend

- `js/payments-module.js`
- `css/payments-module.css`
- `js/payment-integrations-module.js`
- `css/payment-integrations-module.css`
- `js/config.js`

## 10. Próximos passos operacionais

1. No Mercado Pago Developers, configurar o webhook acima e marcar **Order (Mercado Pago)**.
2. Abrir **Recebimentos** na Conta Dono.
3. Clicar em **Buscar minhas Points**.
4. Vincular Point Pro/Smart desejada e ativar PDV.
5. Editar as taxas de débito/crédito da maquininha no RENOVA.
6. Fazer uma cobrança de teste com valor baixo.
7. Confirmar se a receita entra automaticamente no dashboard após aprovação.
8. Informar a InfiniteTag da conta InfinitePay.
9. Habilitar Checkout Integrado no app/site InfinitePay, se ainda não estiver habilitado.
10. Gerar um checkout de teste e confirmar a conciliação automática.
11. Depois dos testes da Conta Dono, implementar OAuth Mercado Pago para usuários do sistema.

## 11. Segurança verificada

Após a migration de conciliação:

- trigger de conciliação criado;
- índices de unicidade criados;
- `authenticated` não possui `EXECUTE` na função de trigger;
- `anon` não possui `EXECUTE` na função de trigger.

O Security Advisor continua apontando avisos **anteriores** em outras funções `SECURITY DEFINER` e proteção contra senhas vazadas desativada. Esses itens devem ser tratados em uma revisão de segurança separada.

## 12. Regra permanente

**Criar checkout ou criar order não significa pagamento aprovado.**

O Minhas Finanças RENOVA só consolida receita integrada depois da confirmação oficial do provedor.
