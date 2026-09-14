# PIX na Mercado Pago Point - Minhas Finanças RENOVA

Data: 14/09/2026

## Objetivo

Permitir que uma receita marcada como PIX seja enviada para uma Mercado Pago Point integrada em modo PDV, exibindo o QR Code PIX no terminal físico e conciliando a receita somente depois da confirmação do pagamento.

## Base oficial

A API atual de Orders do Mercado Pago Point aceita `config.payment_method.default_type = "qr"`. A referência oficial da Point também informa suporte a cartões, QR Code e Pix em pagamentos presenciais.

## Implementação

### Frontend

Arquivo:

- `js/point-pix-module.js`

Comportamento:

1. Usuário cria uma Receita.
2. Seleciona PIX.
3. O campo `Maquininha / provedor (opcional no PIX)` é exibido.
4. Quando uma Point Mercado Pago conectada é selecionada, aparece `Cobrar PIX na Point`.
5. A cobrança integrada bloqueia o salvamento manual enquanto estiver em andamento.
6. O sistema acompanha a order até `processed`, `failed`, `cancelled`, `expired` ou `refunded`.
7. Em `processed`, a conciliação automática cria a receita no financeiro.

### Backend

Edge Function:

- `mercado-pago-point-pix`

Código versionado em:

- `supabase/functions/mercado-pago-point-pix/index.ts`

A função usa exclusivamente o secret:

- `MP_POINT_ACCESS_TOKEN`

Payload principal enviado para `/v1/orders`:

```json
{
  "type": "point",
  "transactions": {
    "payments": [{ "amount": "1.00" }]
  },
  "config": {
    "point": {
      "terminal_id": "...",
      "print_on_terminal": "no_ticket"
    },
    "payment_method": {
      "default_type": "qr"
    }
  }
}
```

## Banco de dados

Nenhuma migration adicional foi necessária.

`payment_orders.payment_method` já aceita `pix`, e a função `reconcile_processed_payment_order()` já reconhece PIX e mantém taxa 0 quando não existe uma taxa específica de PIX cadastrada.

## Observação operacional

Uma Point aceita uma order por vez. Se houver uma cobrança de cartão ou PIX já na fila, uma nova cobrança pode retornar `There is already a queued order on the terminal.`. A order anterior deve ser concluída, cancelada ou expirar antes do próximo teste.

## Referências oficiais

- https://www.mercadopago.com.br/developers/pt/reference/in-person-payments/point/overview
- https://www.mercadopago.com.br/developers/pt/docs/mp-point/migrate-payment-intent-to-orders
- https://www.mercadopago.com.br/developers/pt/reference/in-person-payments/point/orders/create-order/post
