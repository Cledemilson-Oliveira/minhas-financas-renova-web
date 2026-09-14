# Mercado Pago Point — credenciais separadas

**Data:** 14/09/2026  
**Projeto:** Minhas Finanças RENOVA Web

## Objetivo

Separar definitivamente a integração presencial Mercado Pago Point da integração de Checkout Transparente/assinaturas.

## Aplicações

- **Checkout Transparente:** mantém a credencial já existente no projeto.
- **Mercado Pago Point:** usa a aplicação exclusiva `Minhasfinancasrenovapoint`.

## Secrets do Supabase

A integração Point passa a usar exclusivamente:

- `MP_POINT_ACCESS_TOKEN`
- `MP_POINT_WEBHOOK_SECRET`

A função Point não usa mais `MP_ACCESS_TOKEN`, e o webhook Point não usa mais `MP_WEBHOOK_SECRET`.

## Edge Functions atualizadas

### `mercado-pago-point`

- requer JWT;
- usa `MP_POINT_ACCESS_TOKEN`;
- lista terminais;
- ativa modo PDV;
- cria Orders;
- consulta Orders;
- cancela Orders.

### `mercado-pago-point-webhook`

- endpoint público para notificações do Mercado Pago;
- valida assinatura HMAC com `MP_POINT_WEBHOOK_SECRET`;
- consulta a Order usando `MP_POINT_ACCESS_TOKEN`;
- atualiza `payment_orders`;
- deixa a conciliação automática criar a receita após status `processed`.

## Webhook de produção

```text
https://ysxttnnkuyhzvkjheqfy.supabase.co/functions/v1/mercado-pago-point-webhook
```

Evento configurado:

- `Order (Mercado Pago)`

## Segurança

- tokens privados não ficam no navegador nem no GitHub;
- credenciais da Point não se misturam com as do Checkout Transparente;
- a Point continua restrita à Conta Dono enquanto o OAuth por usuário não estiver implantado;
- o webhook rejeita notificações com assinatura inválida.

## Situação da order de teste anterior

Existe uma order de teste anterior de R$ 1,00 criada antes da separação das credenciais e que pode continuar enfileirada no terminal. Antes de um novo teste, essa cobrança deve ser cancelada/encerrada na Point ou expirar, evitando a mensagem:

`There is already a queued order on the terminal.`

## Commits

- `d05a2bd8a1c7f0e9005d6e7672660961ea1c9c56` — função Point passa a usar credencial exclusiva.
- `6462f0833cafe2736f2dc9fcde14330d208859fd` — webhook Point passa a usar token e secret exclusivos.
