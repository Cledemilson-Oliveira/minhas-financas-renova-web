# Registro de desenvolvimento — Minhas Finanças RENOVA

Data de referência: **14/09/2026**

Este documento registra o estado técnico do projeto para evitar retrabalho, perda de contexto e mistura com outros projetos.

## Identificação do projeto

- Projeto: **Minhas Finanças RENOVA Web**
- Repositório: `Cledemilson-Oliveira/minhas-financas-renova-web`
- Supabase: `renova-financas`
- Supabase project ref: `ysxttnnkuyhzvkjheqfy`
- Região Supabase: `sa-east-1`
- Publicação/interface: NextGo + GitHub Pages
- Domínio utilizado pelo projeto: `https://minhasfinancas.servicosgold.com.br/`

> Este projeto é independente do **Ecossistema RENOVA**. Não misturar tabelas, código, credenciais ou deploys entre os dois projetos.

## Arquitetura oficial

```text
NextGo
  ↓
iframe / interface publicada
  ↓
GitHub Pages
  ↓
HTML + CSS + JavaScript
  ↓
Supabase Auth + PostgreSQL + Edge Functions
  ↓
Integrações externas autorizadas
```

## Princípios de desenvolvimento

- preservar o que já está funcionando;
- evitar retrabalho;
- implementar soluções definitivas quando tecnicamente possível;
- manter alto contraste e leitura fácil;
- desktop e mobile devem ser responsivos;
- lógica sensível sempre no backend;
- nunca expor tokens privados no GitHub ou no navegador;
- mudanças de banco devem ser versionadas em `supabase/migrations`;
- Edge Functions publicadas no Supabase também devem existir no GitHub;
- toda integração financeira deve ter rastreabilidade e idempotência quando disponível.

## Entregas recentes consolidadas

### Fluxos fixos por dia da semana

A estrutura de lançamentos recorrentes foi expandida para permitir receitas e despesas fixas semanais, atendendo casos como trabalho de segunda a sábado sem gerar domingo.

Arquivos relacionados:

- `supabase/migrations/20260913_weekly_fixed_schema.sql`
- `supabase/migrations/20260913_weekly_fixed_functions.sql`

### Multa, juros e encargos por atraso

Movimentações de despesa passaram a suportar:

- multa percentual aplicada uma vez;
- juros simples percentuais por dia de atraso;
- encargo fixo em reais;
- cálculo sobre contas vencidas sem alterar permanentemente o valor base.

Migration:

- `supabase/migrations/20260914_transaction_late_fees_and_charges.sql`

### Formas de recebimento

Receitas suportam:

- Dinheiro
- Pix
- Débito
- Crédito
- Outro

Para cartão, o sistema registra:

- valor bruto;
- percentual de taxa;
- valor da taxa;
- valor líquido;
- maquininha usada.

Migration:

- `supabase/migrations/20260914_payment_methods_and_card_terminals.sql`

Frontend:

- `js/payments-module.js`
- `css/payments-module.css`

### Cadastro de maquininhas

Foi criada `payment_terminals` com:

- nome;
- provedor;
- ID/serial externo;
- taxa de débito;
- taxa de crédito;
- status;
- vínculo futuro/atual com integração.

As taxas aplicadas ficam copiadas para a venda no momento do lançamento, evitando que uma alteração futura recalcule o histórico.

## Fundação das integrações de pagamento

Migration de produção registrada no Supabase:

`payment_provider_integrations_foundation`

Arquivo versionado no GitHub:

- `supabase/migrations/20260914_payment_provider_integrations_foundation.sql`

Foram criadas/expandidas as seguintes estruturas:

### `payment_provider_connections`

Gerencia a conexão de cada usuário com provedores de pagamento.

### `payment_orders`

Gerencia cobranças externas antes de elas serem conciliadas com `transactions`.

### `payment_terminals`

Recebeu:

- `connection_id`
- `integration_mode`

## Escopo ativo de provedores

Por decisão atual do projeto, trabalhar somente com:

1. **Mercado Pago**
2. **InfinitePay**

Outros provedores não fazem parte da implementação ativa neste momento.

## Mercado Pago Point

Edge Function publicada:

`mercado-pago-point`

Código versionado:

- `supabase/functions/mercado-pago-point/index.ts`

Ações implementadas:

- `list_terminals`
- `setup_terminal`
- `create_order`
- `get_order`
- `cancel_order`

A integração usa a API moderna de **Orders** do Mercado Pago.

Terminais documentados pelo Mercado Pago como integráveis ao PDV:

- Point Smart 1
- Point Smart 2
- Point Pro 2
- Point Pro 3

A Point Mini fica como operação manual/assistida até existir documentação oficial que permita o mesmo fluxo de integração via API Point/Orders.

### Segurança Mercado Pago

O `MP_ACCESS_TOKEN` permanece apenas no backend.

Enquanto OAuth individual não estiver implantado, a função Point está bloqueada para usuários comuns e aceita operação com o token global apenas para a **Conta Dono**.

Próxima evolução obrigatória antes de liberar Point automática para clientes:

- OAuth Mercado Pago por usuário.

## InfinitePay

Foram preparadas duas Edge Functions.

### `infinitepay-checkout`

Código:

- `supabase/functions/infinitepay-checkout/index.ts`

Responsabilidades:

- salvar a InfiniteTag;
- criar checkout integrado;
- criar `payment_order` correspondente;
- consultar `payment_check`;
- validar valor e confirmação do pagamento.

### `infinitepay-webhook`

Código:

- `supabase/functions/infinitepay-webhook/index.ts`

O webhook não confia apenas no payload recebido. Ele consulta a API `payment_check` da InfinitePay antes de mudar a order para `processed`.

### InfiniteTap

A modelagem foi preparada para `infinitepay_tap`, porém o fluxo completo ainda não deve ser ativado dentro do iframe web. A documentação oficial exige um `result_url` por deep link para retorno ao aplicativo de origem.

Alternativas futuras:

- PWA com estratégia de link compatível;
- wrapper mobile;
- aplicativo nativo/híbrido RENOVA.

## Edge Functions do projeto relacionadas a pagamentos

Além das integrações de maquininha, o projeto já possui funções relacionadas ao Mercado Pago para assinatura/checkout transparente.

No momento deste registro, existem funções como:

- `mercado-pago-create-subscription`
- `mercado-pago-webhook`
- `mercado-pago-transparent-webhook`
- `mercado-pago-transparent-checkout`
- `mercado-pago-point`
- `infinitepay-checkout`
- `infinitepay-webhook`

Também existe a função financeira:

- `finance-ai`

Não misturar a lógica de assinatura do aplicativo com as cobranças de vendas/recebimentos dos usuários.

## Separação importante: assinatura x recebimento do usuário

### Assinatura RENOVA

É o pagamento que o cliente faz para ter acesso aos recursos/plano do Minhas Finanças RENOVA.

### Recebimento financeiro do usuário

É o dinheiro que o próprio usuário recebe de seus clientes por suas vendas/serviços.

Esses dois fluxos devem usar tabelas e referências separadas para evitar que uma assinatura do aplicativo apareça como uma venda do usuário errado ou vice-versa.

## Segurança do banco

As novas tabelas utilizam RLS.

Regras principais:

- usuário só lê suas próprias conexões/orders;
- usuário pode administrar suas próprias conexões;
- `payment_orders` é escrita pelo backend;
- `anon` não deve escrever nessas estruturas;
- `service_role` é exclusivo do backend.

## Próxima etapa recomendada

### Interface de integrações

Criar em **Movimentações → Recebimentos** um bloco de integrações com apenas:

- Mercado Pago
- InfinitePay

### Mercado Pago

Implementar no frontend:

1. “Buscar minhas maquininhas”;
2. listar Point Smart/Pro retornadas pela API;
3. selecionar terminal;
4. ativar modo PDV;
5. salvar `external_terminal_id`;
6. botão “Cobrar na maquininha”;
7. acompanhar estado da order;
8. somente após confirmação, conciliar a receita.

### InfinitePay

Implementar no frontend:

1. campo InfiniteTag;
2. botão “Conectar InfinitePay”;
3. botão “Gerar checkout”;
4. abrir checkout em experiência segura;
5. acompanhar webhook/payment_check;
6. conciliar a receita quando confirmada.

### Conciliação automática

Criar rotina única para transformar uma `payment_order` processada em `transaction`, garantindo:

- idempotência;
- não duplicar receita;
- vínculo `payment_orders.transaction_id`;
- valor bruto;
- taxa;
- líquido;
- forma de pagamento;
- conta financeira correta;
- categoria escolhida.

## Documentação técnica detalhada

Consultar:

- `docs/PAGAMENTOS_E_MAQUININHAS.md`

## Código para publicação via NextGo

A página publicada pela NextGo deve apontar para o GitHub Pages do projeto:

```html
<iframe
  src="https://cledemilson-oliveira.github.io/minhas-financas-renova-web/"
  title="Minhas Finanças RENOVA"
  style="position:fixed;inset:0;width:100%;height:100dvh;border:0;"
  allow="camera;microphone;clipboard-read;clipboard-write"
  allowfullscreen>
</iframe>
```

## Regra de continuidade para próximos desenvolvimentos

Antes de alterar pagamentos:

1. ler este documento;
2. ler `docs/PAGAMENTOS_E_MAQUININHAS.md`;
3. verificar migrations já aplicadas;
4. verificar Edge Functions ativas;
5. não criar uma segunda tabela para resolver algo que `payment_orders`, `payment_provider_connections` ou `payment_terminals` já resolvem;
6. não colocar tokens em arquivos públicos;
7. não marcar pagamento como aprovado sem confirmação do provedor;
8. preservar compatibilidade desktop/mobile e NextGo iframe.

## Commits desta etapa

- `cc74530a2194f90164e812df342cdd505697d1d2` — fundação das integrações versionada.
- `78b0d58140d64b0d4369ff1404a088ce100af6fb` — Mercado Pago Point versionado.
- `789b7bd3d4311d89378f32236b64a362c48e9957` — backend InfinitePay Checkout.
- `d14a6806c0b9dbaa50dbabe65d1e5a36779c2f2b` — webhook InfinitePay.
- `77071a09bcc54132b7e6ac545c7fd59d2ffab14b` — documentação técnica de pagamentos.

Este arquivo deve ser atualizado sempre que a arquitetura de pagamentos sofrer mudança relevante.
