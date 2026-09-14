# Correção Mercado Pago Point — order no débito

Data: 14/09/2026

## Sintoma

Ao clicar em **Cobrar na Point** com forma de pagamento **Débito**, o frontend exibia apenas `mercado_pago_error`.

## Causa

O payload enviado para a API de Orders do Mercado Pago incluía parâmetros de parcelamento mesmo quando `config.payment_method.default_type` era `debit_card`.

A documentação oficial da API de Orders informa que `default_installments` é permitido apenas quando `default_type = credit_card`. Por isso, no débito o RENOVA não deve enviar campos de parcelas/custo de parcelamento.

## Correção aplicada

Na Edge Function `mercado-pago-point`:

- Débito envia somente `config.payment_method.default_type = debit_card`.
- Crédito continua enviando `default_installments` e `installments_cost`.
- Respostas de erro do Mercado Pago agora retornam `message` detalhada ao frontend, em vez de mostrar apenas `mercado_pago_error`.

## Arquivos

- `supabase/functions/mercado-pago-point/index.ts`

## Deploy

- Supabase Edge Function `mercado-pago-point` atualizada para versão 3.
- Commit principal: `1ca759a62d8d7a51d6073b982ebb11709d7bcb7e`.

## Próximo teste

Abrir uma receita, selecionar Débito, escolher a Point integrada e clicar novamente em **Cobrar na Point**.

Se a API rejeitar por outro motivo, a interface deve agora mostrar a mensagem real devolvida pelo Mercado Pago (por exemplo terminal ocupado, terminal não pertencente à conta, propriedade inválida ou outro código oficial).